/* 
If you want a proper logger, have this loaded before this script: <script src="https://unpkg.com/js-logger/src/logger.min.js"></script>
*/

const loggerConfig = {
    "lostExceptions": true, // When a live function triggers an exception for which we are pretty sure no one is listening to, log this exception. (level=error)
    "allExceptions": false, // Whena a live function triggers an exception, always log it. (level=error)
    "propagation": false // dumps debug information during propagation. (level=debug)
}

if (typeof Logger == "undefined") { Logger = console; }

/*
    Each Live receives a unique id, allowing tracking the Live in maps using this ID.
    To avoid memory leak, the maps track uid->WeakRef(Live)
*/
let uid = 0;


/* The global liveTrace variable allows tracing dependencies: each time a Live is accessed,
   it is added to liveTrace, except for when it is null, which disables the liveTrace completely.
*/
let liveTrace = null;

/* Work around Proxy not extendable
   https://stackoverflow.com/questions/37714787/can-i-extend-proxy-with-an-es2015-class
*/

class ExtendableProxyWithDelegate {
    constructor(target, handler) {
        return new Proxy(target, handler);
    }
}

/* let instance=new Live() extends a proxy
    instance[private].state yields access to a regular object containing the state of this instance. This state is completely private.
    instance[private].delegate yields access to a the delegate handler of the proxy. 
        Indeed, we need the ability to change the dynamic value of a live, which requires different handling.
*/
let internal = Symbol();
let unresolved = null;
let recvDetails = null;

const MAXDEPENDENCY = 10000;
function isVal(something) {
    return something == null || something == undefined || (typeof something == "string") || (typeof something == "number") || (typeof something == "boolean") || (typeof something == "bigint") || (typeof something == "symbol");
}
function isEmptyObject(o) {
    for (let k in o) return false;
    return true;
}

function isPureObject(input) {
    return null !== input &&
        typeof input === 'object' &&
        Object.getPrototypeOf(input).isPrototypeOf(Object);
}

class HardRef {
    constructor(tgt) {
        this.tgt = tgt;
    }
    deref() {
        return this.tgt;
    }
}

class Live extends ExtendableProxyWithDelegate {
    constructor() {
        /* To obtain the ability to rewrite state and delegate completely, we embed them in an object 
        */
        let internalObject = {
            state: {},
            delegate: {},
            push: {},
            changeListeners: []
        }
        Object.defineProperty(internalObject, "uid", {
            value: (uid++) + "", // ensure uid is a string because it will be used as a key in maps which converts them to string then, and the key in map becomes different than the real uid
            writable: false, enumerable: true, configurable: false
        });
        /* list of internalObject keys:
            state: inner live state
            delegate: proxy handler delegate
            push: map uid->HardRef of where to push updates // HardRef because forward dependencies must stay in memory
            pull: map uid->WeakRef of places pushing to this instance
            uid: unique id of this Live object
            notify: when pushing to this object, this is the notification function
            changeListeners: listeners of change events
            unbind: when rebinding a Live object, unbind cleans up the old instance, should clear the keys below this one in this list
            executing: for functions, a flag that tells if the function is currently executing or not (an executing function calling itself makes a recursive call to itself instead of accessing its cached result)
            el: for DOM elements, the root element
            props: for DOM elements, livemic properties are stored here
        */
        let self = super({}, {
            get(_, prop, receiver) {
                switch (prop) {
                    case internal:
                        return internalObject;
                    case Symbol.toPrimitive:
                        return function (hint) {
                            throw new ReferenceError(`Live entities cannot be coerced into ${hint}. Did you forget to use .live ?`);
                        }
                    case "toJSON":
                        if ("toJSON" in internalObject.delegate) {
                            return internalObject.delegate.toJSON(internalObject.state);
                        } else {
                            return internalObject.state;
                        }
                    case "addChangeListener":
                        if ("changeListeners" in internalObject) {
                            return (l) => internalObject.changeListeners.push(l);
                        }
                        break;
                    case "removeChangeListener":
                        if ("changeListeners" in internalObject) {
                            return (l) => {
                                if (arguments.length === 0) { // remove everything
                                    internalObject.changeListeners.splice(0)
                                } else {
                                    idx = internalObject.changeListeners.indexOf(l);
                                    if (idx >= 0) {
                                        internalObject.changeListeners.splice(idx, 1);
                                        return true;
                                    } else {
                                        return false;
                                    }
                                }
                            }
                        }
                        break;
                }
                if ("get" in internalObject.delegate) {
                    if ((prop == "live" || prop == "toJSON") && liveTrace != null) {
                        liveTrace.add(self);
                    }
                    return internalObject.delegate.get(internalObject.state, prop, receiver);
                }
                throw new ReferenceError("Cannot access " + prop + " on this object.");
            },
            set(_, prop, value) {
                if ("set" in internalObject.delegate) {
                    return internalObject.delegate.set(internalObject.state, prop, value);
                } else {
                    throw new ReferenceError("Cannot change " + prop + " on this object.");
                }
            },
            ownKeys(_) {
                if ("ownKeys" in internalObject.delegate) {
                    return internalObject.delegate.ownKeys(internalObject.state);
                } else {
                    return Reflect.ownKeys(internalObject.state);
                }
            },
            getOwnPropertyDescriptor(_, prop) {
                if ("getOwnPropertyDescriptor" in internalObject.delegate) {
                    return internalObject.delegate.getOwnPropertyDescriptor(internalObject.state, prop);
                } else {
                    return Reflect.getOwnPropertyDescriptor(internalObject.state, prop);
                }
            }
        })
    }
}

/* As the type of Live binding depends on the type of what is lifted,
   We use a variant of the chain of responsibility design pattern.
   To enable the ability to rebind a live variable from one type to another (say from an immutable string to a mutable array)
   the instanciation of live is not set by the elements of the chain 
*/
let liveCreators = [];

function createLive(something) {
    let live = new Live();
    for (let i = 0; i < liveCreators.length; i++) {
        let candidate = liveCreators[i](something, live);
        if (candidate !== undefined) return candidate;
    }
    throw new Error("Invalid parameter for live");
}

const live = createLive;

function mergeLive(something, tgt) {
    // clean up target
    if ("unbind" in tgt[internal]) {
        tgt[internal].unbind();
    }
    if ("pull" in tgt[internal]) {
        // because we are reassigning completely, we should not be pulling anything anymore
        // however, we can still push src others that reference this one
        let pull = tgt[internal].pull;
        let tgtuid = tgt[internal].uid;
        for (const uid in pull) {
            let proxy = pull[uid].deref();
            if (proxy) {
                delete proxy[internal].push[tgtuid]; // remove tgt push of this old dependency
            }
        }
    }
    for (let k in tgt[internal]) {
        // keep these:
        // - push: denotes others that depend on this live, they are unsrcuched and still depend on this live
        // - uid: keeps this live's identity
        // - changeListeners: listeners keep on listening
        switch (k) {
            case "push":
            case "uid":
            case "changeListeners":
                break;
            default:
                delete tgt[internal][k];
        }
    }
    // rebind tgt
    tgt[internal].state = {};
    tgt[internal].delegate = {};
    for (let i = 0; i < liveCreators.length; i++) {
        let candidate = liveCreators[i](something, tgt);
        if (candidate === tgt) return candidate;
    }
    // if we are here, then something went wrong, set the live in error mode:
    liveError(_, tgt);
    throw new Error("Invalid parameter for live");
}

function liveError(_, live) {
    live[internal].type = "error";
    live[internal].delegate = {
        set() {
            switch (prop) {
                case "live":
                    mergeLive(value, live);
                    notifyChange(live, { type: "assign", old: new ReferenceError("This live is in error state."), "new": live.live });
                    return;
            }
            throw new ReferenceError("This live is in error state.");
        },
        get() {
            throw new ReferenceError("This live is in error state.");
        }
    }
    return live;
}

function liveLive(something) {
    if (something instanceof Object) {
        try {
            if (something[internal]) return something;
        } catch (_) { }
    }
}

function liveVal(something, live) {
    if (isVal(something)) {
        live[internal].state = { live: something };
        live[internal].type = "value";
        live[internal].delegate = {
            set(target, prop, value) {
                switch (prop) {
                    case "live":
                        if (!(isVal(value))) {
                            let old = target.live;
                            mergeLive(value, live);
                            notifyChange(live, { type: "assign", old, "new": target.live });
                            return;
                        }
                        // changed to another value
                        let old = target.live;
                        let ret = false;
                        target.live = value;
                        if (old !== value) {
                            ret = true;
                            notifyChange(live, { type: "value", old: old, "new": target.live });
                        }
                        return ret;
                    default:
                        throw new ReferenceError("Cannot change " + prop + " on this object.");
                }
            },
            get(target, prop) {
                switch (prop) {
                    case "live":
                        return target.live;
                    default:
                        throw new ReferenceError("Cannot access " + prop + " on this object.");
                }
            }
        }
        return live;
    }
}

function livePureObject(object, live) {
    if (isPureObject(object)) {
        live[internal].type = "pureObject";
        live[internal].state = {
            live: new Proxy(object, {
                set(target, prop, value) {
                    let has = (prop in target);
                    let old = target[prop];
                    let ret = (target[prop] = value);
                    if (old !== value) {
                        if (has) {
                            notifyChange(live, { type: "pureObject", key: prop, "new": value });
                        } else {
                            notifyChange(live, { type: "pureObject", key: prop, old: old, "new": value });
                        }
                    }
                    return ret;
                },
                deleteProperty(target, prop) {
                    let has = (prop in target);
                    let old = target[prop];
                    let ret = (delete target[prop]);
                    if (has) {
                        notifyChange(live, { type: "pureObject", key: prop, old: old });
                    }
                    return ret;
                },
                defineProperty(target, key, descriptor) {
                    let has = (prop in target);
                    let old = target[prop];
                    let ret = Object.defineProperty(target, key, descriptor);
                    if (has) {
                        notifyChange(live, { type: "pureObject", key: prop, "new": value, descriptor });
                    } else {
                        notifyChange(live, { type: "pureObject", key: prop, old: old, "new": value, descriptor });
                    }
                    return ret;
                },
                setPrototypeOf(target, proto) {
                    let ret = Object.setPrototypeOf(target, proto);
                    notifyChange(live, { type: "pureObject", prototype: proto });
                    return ret;
                },
                get(target, prop) {
                    return target[prop];
                }
            })
        };
        live[internal].delegate = {
            get(_, prop) {
                switch (prop) {
                    case "live":
                        return live[internal].state.live;
                    default:
                        throw new ReferenceError("Cannot access " + prop + " on this object.");
                }
            },
            set(_, prop, value) {
                switch (prop) {
                    case "live":
                        let old = live[internal].state.live;
                        mergeLive(value, live);
                        notifyChange(live, { type: "assign", old, "new": live[internal].state.live });
                        return;
                    default:
                        throw new ReferenceError("Cannot change " + prop + " on this object.");
                }
            }
        }
        return live;
    }
}

function liveObject(object, live) {
    if (typeof object == "object") {
        live[internal].type = "object";
        live[internal].state = {
            live: new Proxy(object, {
                set(target, prop, value) {
                    let has = (prop in target);
                    let old = target[prop];
                    let ret = (target[prop] = value);
                    if (old !== value) {
                        if (has) {
                            notifyChange(live, { type: "object", key: prop, "new": value });
                        } else {
                            notifyChange(live, { type: "object", key: prop, old: old, "new": value });
                        }
                    }
                    return ret;
                },
                deleteProperty(target, prop) {
                    let has = (prop in target);
                    let old = target[prop];
                    let ret = (delete target[prop]);
                    if (has) {
                        notifyChange(live, { type: "object", key: prop, old: old });
                    }
                    return ret;
                },
                defineProperty(target, key, descriptor) {
                    let has = (prop in target);
                    let old = target[prop];
                    let ret = Object.defineProperty(target, key, descriptor);
                    if (has) {
                        notifyChange(live, { type: "object", key: prop, "new": value, descriptor });
                    } else {
                        notifyChange(live, { type: "object", key: prop, old: old, "new": value, descriptor });
                    }
                    return ret;
                },
                setPrototypeOf(target, proto) {
                    let ret = Object.setPrototypeOf(target, proto);
                    notifyChange(live, { type: "object", prototype: proto });
                    return ret;
                },
                get(target, prop) {
                    let ret = target[prop];
                    if (typeof ret == "function") {
                        return function () { // wrapper function
                            let oldstring = target.toString();
                            let oldvalue = target.valueOf();
                            let result = ret.apply(target, arguments);
                            if (oldvalue != target.valueOf() || oldstring != target.toString()) {
                                notifyChange(live, { type: "object", key: prop, "new": target });
                            }
                            return result;
                        }
                    } else {
                        return ret;
                    }
                }
            })
        };
        live[internal].delegate = {
            get(_, prop) {
                switch (prop) {
                    case "live":
                        return live[internal].state.live;
                    default:
                        throw new ReferenceError("Cannot access " + prop + " on this object.");
                }
            },
            set(_, prop, value) {
                switch (prop) {
                    case "live":
                        let old = live[internal].state.live;
                        mergeLive(value, live);
                        notifyChange(live, { type: "assign", old, "new": live[internal].state.live });
                        return;
                    default:
                        throw new ReferenceError("Cannot change " + prop + " on this object.");
                }
            }
        }
        return live;
    }
}

function clone(live) {
    if (live[internal].type == "array") {
        return live[internal].state.live.slice(0);
    } else if (live[internal].type == "value") {
        return live[internal].state.live;
    } else {
        let str = JSON.stringify(live.live);
        if (str !== undefined) {
            return JSON.parse(str);
        } else {
            return live.live
        }
    }
}


function liveArray(object, live) {
    if (Array.isArray(object)) {
        live[internal].type = "array";
        live[internal].state = {
            live: new Proxy(object, {
                get(arr, prop) {
                    // don't waste time if nobody needs be notified
                    let idx = parseInt(prop);
                    if (isNaN(idx)) {
                        let ops = [];
                        let details = { type: "array", function: prop, operations: ops };
                        switch (prop) {
                            case "splice":
                                return function (start, count) {
                                    let l = arr.length;
                                    let ret = arr.splice.apply(arr, arguments);
                                    if (arguments.length == 1) {
                                        for (let i = start; i < l - 1; i++) {
                                            ops.push({ type: "remove", index: i });
                                        }
                                    } else {
                                        let end = Math.min(l, start + count);
                                        for (let i = end - 1; i >= start; i--) {
                                            ops.push({ type: "remove", index: i });
                                        }
                                        for (let i = 0; i < arguments.length - 2; i++) {
                                            ops.push({ type: (end == l) ? "add" : "insert", index: i + start, value: arr[i + start] });
                                        }
                                    }
                                    if (ops.length > 0) notifyChange(live, details);
                                    return ret;
                                }
                            case "push":
                                return function () {
                                    let l = arr.length;
                                    let ret = arr.push.apply(arr, arguments);
                                    for (let i = l; i < arr.length; i++) {
                                        ops.push({ type: "add", index: i, value: arr[i] });
                                    }
                                    if (ops.length > 0) notifyChange(live, details);
                                    return ret;
                                }
                            case "pop":
                                return function () {
                                    let l = arr.length;
                                    let ret = arr.pop();
                                    if (l > 0) ops.push({ type: "remove", index: arr.length });
                                    if (ops.length > 0) notifyChange(live, details);
                                    return ret;
                                }
                            case "shift":
                                return function () {
                                    let ret = arr.shift();
                                    ops.push({ type: "remove", index: 0 });
                                    if (ops.length > 0) notifyChange(live, details);
                                    return ret;
                                }
                            case "unshift":
                                return function () {
                                    let l = arr.length;
                                    let ret = arr.unshift.apply(arr, arguments);
                                    for (let i = 0; i < arr.length - l; i++) {
                                        ops.push({ type: "insert", index: i, value: arr[i] });
                                    }
                                    if (ops.length > 0) notifyChange(live, details);
                                    return ret;
                                }
                            default:
                                return Reflect.get(...arguments);
                        }
                    } else {
                        return Reflect.get(...arguments);
                    }
                },
                set(arr, prop, value) {
                    let idx = parseInt(prop);
                    if (isNaN(idx)) {
                        switch (prop) {
                            case "length": // adjusts the size of array,
                                let ops = [];
                                let details = { type: "array", function: prop, operations: ops };
                                let l = arr.length;
                                let ret = Reflect.set(...arguments);
                                if (arr.length > l) {
                                    for (let i = l; i < arr.length; i++) {
                                        ops.push({ type: "add", index: i, value: arr[i] });
                                    }
                                } else if (arr.length < l) {
                                    for (let i = l - 1; i >= arr.length; i--) {
                                        ops.push({ type: "remove", index: i });
                                    }
                                }
                                if (ops.length > 0) notifyChange(live, details);
                                return ret;
                            case "live": // change the whole array
                                if (Array.isArray(value)) {
                                    let ops = [];
                                    let details = { type: "array", function: prop, operations: ops };
                                    for (let i = arr.length - 1; i >= 0; i--) {
                                        ops.push({ type: "remove", index: i });
                                    }
                                    for (let i = 0; i < value.length; i++) {
                                        ops.push({ type: "add", index: i, value: value[i] });
                                    }
                                    let ret = (arr = value);
                                    if (ops.length > 0) notifyChange(live, details);
                                    return ret;
                                }
                            default:
                                throw new ReferenceError("Cannot change " + prop + " on this object.");
                        }
                    } else {
                        let l = arr.length;
                        let ret = Reflect.set(...arguments);
                        let ops = [];
                        let details = { type: "array", function: "index", operations: ops };
                        if (arr.length > l) {
                            for (let i = l; i < arr.length; i++) {
                                ops.push({ type: 'add', index: i, value: arr[i] });
                            }
                        } else {
                            ops.push({ type: 'set', index: idx, value });
                        }
                        if (ops.length > 0) notifyChange(live, details);
                        return ret;
                    }
                },
                deleteProperty(arr, prop) {
                    let idx = parseInt(prop);
                    if (isNaN(idx)) {
                        throw new ReferenceError("Cannot change " + prop + " on this object.");
                    } else {
                        let ops = [];
                        let details = { type: "array", function: "delete", operations: ops };
                        if (prop in arr) {
                            ops.push({ type: "remove", index: idx });
                        }
                        let ret = delete arr[prop];
                        if (ops.length > 0) notifyChange(live, details);
                        return ret;
                    }
                }
            })
        };
        live[internal].delegate = {
            get(_, prop) {
                switch (prop) {
                    case "live":
                        return live[internal].state.live;
                    default:
                        throw new ReferenceError("Cannot access " + prop + " on this object.");
                }
            },
            set(_, prop, value) {
                switch (prop) {
                    case "live":
                        let old = clone(live);
                        mergeLive(value, live);
                        notifyChange(live, { type: "assign", old, "new": clone(live) });
                        return;
                    default:
                        throw new ReferenceError("Cannot change " + prop + " on this object.");
                }
            }
        }
        return live;
    }
}

function liveMap(object, live) {
    if (object instanceof Map) {
        live[internal].type = "map";
        live[internal].state = {
            live: new Proxy(object, {
                get(map, prop) {
                    let details = { type: "map", function: prop };
                    switch (prop) {
                        case "clear":
                            return function () {
                                if (map.length > 0) {
                                    map.clear();
                                    notifyChange(live, details);
                                }
                            }
                        case "delete":
                            return function (what) {
                                if (map.delete(what)) {
                                    details.key = what;
                                    notifyChange(live, details);
                                    return true;
                                }
                                return false;
                            }
                        case "set":
                            return function (key, value) {
                                details.key = key;
                                details.value = value;
                                map.set(key, value);
                                notifyChange(live, details);
                                return live;
                            }
                        case "entries":
                        case "forEach":
                        case "keys":
                        case "values":
                        case "get":
                        case "has":
                            return (p1, p2, p3) => map[prop](p1, p2, p3);
                        case "size":
                            return map[prop];
                        default:
                            return Reflect.get(...arguments);
                    }
                },
                set() {
                    throw new ReferenceError("Cannot change " + prop + " on this object.");
                }
            })
        };
        live[internal].delegate = {
            get(_, prop) {
                switch (prop) {
                    case "live":
                        return live[internal].state.live;
                    default:
                        throw new ReferenceError("Cannot access " + prop + " on this object.");
                }
            },
            set(_, prop, value) {
                switch (prop) {
                    case "live":
                        let old = clone(live);
                        mergeLive(value, live);
                        notifyChange(live, { type: "assign", old, "new": clone(live) });
                        return;
                    default:
                        throw new ReferenceError("Cannot change " + prop + " on this object.");
                }
            }
        }
        return live;
    }
}

function liveSet(object, live) {
    if (object instanceof Set) {
        live[internal].type = "set";
        live[internal].state = {
            live: new Proxy(object, {
                get(set, prop) {
                    let details = { type: "set", function: prop };
                    switch (prop) {
                        case "clear":
                            return function () {
                                if (set.length > 0) {
                                    set.clear();
                                    notifyChange(live, details);
                                }
                            }
                        case "delete":
                            return function (what) {
                                if (set.delete(what)) {
                                    details.key = what;
                                    notifyChange(live, details);
                                    return true;
                                }
                                return false;
                            }
                        case "add":
                            return function (key) {
                                details.key = key;
                                set.add(key);
                                notifyChange(live, details);
                                return live;
                            }
                        case "entries":
                        case "forEach":
                        case "has":
                        case "keys":
                        case "values":
                            return (p1, p2, p3) => set[prop](p1, p2, p3);
                        case "size":
                            return set[prop];
                        default:
                            return Reflect.get(...arguments);
                    }
                },
                set() {
                    throw new ReferenceError("Cannot change " + prop + " on this object.");
                }
            })
        };
        live[internal].delegate = {
            get(_, prop) {
                switch (prop) {
                    case "live":
                        return live[internal].state.live;
                    default:
                        throw new ReferenceError("Cannot access " + prop + " on this object.");
                }
            },
            set(_, prop, value) {
                switch (prop) {
                    case "live":
                        let old = clone(live);
                        mergeLive(value, live);
                        notifyChange(live, { type: "assign", old, "new": clone(live) });
                        return;
                    default:
                        throw new ReferenceError("Cannot change " + prop + " on this object.");
                }
            }
        }
        return live;
    }
}

function liveFunc(something, live) {
    if (typeof something == "function") {
        live[internal].type = "function";
        let obj = live[internal];
        obj.pull = {};
        obj.executing = false;
        // On first notify run, we ensure that exceptions are properly thrown, so they should never be logged.
        let exceptionGuard = true;
        obj.notify = () => {
            let oldTrace = liveTrace;
            let oldUnresolved = unresolved;
            liveTrace = new Set();
            unresolved = {};
            obj.executing = true;
            delete obj.exception;
            let temp;
            try {
                temp = something();
            } catch (e) {
                obj.exception = e;
                if (!exceptionGuard) {
                    if (loggerConfig.allExceptions) {
                        Logger.error(e);
                    } else if (loggerConfig.lostExceptions) {
                        if (isEmptyObject(obj.push)) {
                            Logger.error(e);
                        } else {
                            if (Object.keys(obj.push).length == 1) {
                                for (let k in obj.push) {
                                    let type = obj.push[k].deref()[internal].type;
                                    if (type.startsWith("property") || type.startsWith("attr")) {
                                        Logger.error(e);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            obj.executing = false;
            let olduids = new Set(Object.keys(obj.pull));
            // questionable trick: items in unresolved where modified by the function
            // so they cannot be dependencies of the function and should be removed from liveTrace
            for (let uid in unresolved) liveTrace.delete(unresolved[uid]);
            for (const proxy of liveTrace) { // registers towards proxies
                let tgt = proxy[internal];
                if (tgt.uid == obj.uid) continue; // cannot have itself has a dependency, recursion is managed elsewhere
                if (tgt.uid in obj.pull) { // already registered
                    olduids.delete(tgt.uid); // do not process this target anymore
                } else { // new target
                    tgt.push[obj.uid] = new HardRef(live); // subscribe for pushing to all dependencies, using a weak reference to the proxy of this live function
                    obj.pull[tgt.uid] = new WeakRef(proxy);// remembers where we subscribed to        
                }
            }
            for (const uid of olduids) {
                let proxy = obj.pull[uid].deref();
                if (proxy) {
                    delete proxy[internal].push[obj.uid]; // remove from push of this old dependency
                }
                delete obj.pull[uid];
            }
            liveTrace = oldTrace;
            for (let uid in unresolved) oldUnresolved[uid] = unresolved[uid];
            unresolved = oldUnresolved;
            let ret = { old: obj.state.live, new: temp };
            if ("exception" in obj) {
                return {
                    exception: obj.exception
                }
            } else if (obj.state.live === temp) {
                ret.changed = false;
            } else {
                ret.changed = true;
                obj.state.live = temp;
            }
            return ret;
        }
        obj.notify();
        exceptionGuard = false;
        obj.delegate.set = (_, prop, value) => {
            switch (prop) {
                case "live":
                    mergeLive(value, live);
                    notifyChange(live, { type: "assign", old: something, "new": live.live });
                    return;
                default:
                    throw new ReferenceError("Cannot change " + prop + " on this object.");
            }
        }
        obj.delegate.get = (target, prop) => {
            switch (prop) {
                case "live":
                    return () => {
                        if (obj.executing) {
                            return something();
                        } else if ("exception" in obj) {
                            if (typeof obj.exception == "function") {
                                throw obj.exception();
                            } else {
                                throw obj.exception;
                            }
                        } else {
                            return target.live;
                        }
                    }
                default:
                    throw new ReferenceError("Cannot access " + prop + " on this object.");
            }
        }
        if ("exception" in obj) {
            throw obj.exception;
        }
        return live;
    }
}

function unify(src, tgt) {
    /* this is probably not fully working right */
    /* both variables become one which may cause problem when one of them is set to another value => will rewire the other too */
    /* a better solution would be a link mechanism */
    for (let k in tgt[internal].push) { // adjust dependencies, tgt already has a dependency that needs to be redirected to src
        let peer = tgt[internal].push[k].deref();
        delete peer[internal].pull[tgt[internal].uid];
        peer[internal].pull[src[internal].uid] = new WeakRef(src);
        src[internal].push[peer[internal].uid] = new HardRef(peer);
    }
    for (let k in tgt[internal]) {
        delete tgt[internal][k];
    }
    for (let k in src[internal]) {
        tgt[internal][k] = src[internal][k];
    }
}

function liveDom(el, live) {
    if (el instanceof HTMLElement || el instanceof SVGElement) {
        if ("live" in el) {
            unify(el.live, live);
            return live;
        }
        live[internal].type = "Element";
        el.live = live;
        let obj = live[internal];
        obj.props = {};
        // maps DOM property->live
        obj.events = {};
        // maps property -> eventListener where the eventListener tracks the property changes
        obj.observers = {};
        // maps prefix->{live,observer} where live is the reference to the live object for this observer and observer is the MutationObserver used
        // where prefix is the querySelectorAll filter, or internal for serializeObject

        function getDomProp(prop, event, prefix) {
//            if (prop=="value") debugger;
            function setter(value) {
                if (prefix) {
                    el[prefix][prop] = value;
                } else {
                    el[prop] = value;
                }
            }
            let propname = (prefix ? (prefix + ".") : "") + prop;
            if (!(propname in obj.props)) {
                let liveprop = liveVal(prefix ? el[prefix][prop] : el[prop], new Live());
                let oset = liveprop[internal].delegate.set;
                liveprop[internal].delegate.set = (target, prop, value) => {
                    if (prop == 'live') {
                        /*                        if (!isEmptyObject(liveprop[internal].pull)) { // this prop has been linked to something live, directly changing the value makes no sense => throw an exception
                                                    throw new ReferenceError("Cannot change live value of a property that is currently linked to a live entity");
                                                } else {*/
                        let ret = oset(target, prop, value);
                        setter(value);
                        return ret;
                        //}
                    } else {
                        return oset(target, prop, value);
                    }
                }

                liveprop[internal].type = "property:" + propname;
                obj.props[propname] = liveprop;
                if (event) {
                    function callback() {
                        if (liveprop.live != el[prop]) {
                            let old = liveprop.live;
                            liveprop[internal].state.live = el[prop];
                            notifyChange(liveprop, { type: "dom", old: old, "new": liveprop.live });
                        }
                    }
                    if (Array.isArray(event)) {
                        for (let i = 0; i < event.length; i++) {
                            el.addEventListener(event[i], callback);
                        }
                    } else {
                        el.addEventListener(event, callback);
                    }
                    obj.events[propname] = {
                        el: new WeakRef(el),
                        event,
                        callback
                    };
                }
                let refel = new WeakRef(el); // do not prevent garbage collect of DOM element
                liveprop[internal].notify = () => {
                    let el = refel.deref();
                    if (el) {
                        for (let uid in liveprop[internal].pull) {
                            let proxy = liveprop[internal].pull[uid].deref();
                            if (proxy) {
                                let old = liveprop.live;
                                let value;
                                try {
                                    value = proxy.live;
                                    if (typeof value == "function") value = value();
                                } catch (e) {
                                    return { type: "dom", old, error: e };
                                }
                                if (typeof value == "function") value = value();
                                liveprop[internal].state.live = value;
                                setter(value);
                                return { type: "dom", old, "new": value };
                            } else {
                                delete liveprop[internal].pull[uid];
                            }
                        }
                    } else {
                        for (let uid in liveprop[internal].pull) {
                            let proxy = liveprop[internal].pull[uid].deref();
                            if (proxy) {
                                delete proxy[internal].push[liveprop[internal].uid]; // remove from push of this old dependency
                            }
                            delete liveprop[internal].pull[uid];
                        }
                    }
                }
                return liveprop;
            } else {
                return obj.props[propname];
            }
        }

        function setDomProp(prop, value, event, prefix) {
            if (value == null || liveLive(value) == value) {
                let propname = (prefix ? (prefix + ".") : "") + prop;
                let domprop;
                if (propname in live[internal].props) {
                    domprop = live[internal].props[propname];
                } else {
                    domprop = getDomProp(prop, event, prefix);
                }

                // this version is unidirectional, value update => prop update
                let obj = domprop[internal];
                if (!("pull" in obj)) obj.pull = {};
                for (let uid in obj.pull) {
                    let proxy = obj.pull[uid].deref();
                    if (proxy) {
                        delete proxy[internal].push[obj.uid]; // remove from push of this old dependency
                    }
                    delete obj.pull[uid];
                }
                if (value != null) {
                    value[internal].push[obj.uid] = new HardRef(domprop);
                    obj.pull[value[internal].uid] = new WeakRef(value);
                    if (typeof value.live == "function") {
                        obj.state.live = value.live();
                    } else {
                        createLive(()=>{
                            domprop.live=value.live;
                        });
                        createLive(()=>{
                            value.live=domprop.live;
                        });


                        /* obj.state.live = value.live; // this alternate implementation does seem to work
                        mergeLive(domprop,value);
                        unify(domprop,value); */

                    }
                }

                domprop[internal].notify();
            } else {
                throw new ReferenceError("Lifted properties of a DOM element can only be assigned to another lifted value");
            }
        }

        function getDomAttribute(attr) {
            let attrname = "attr:" + attr;
            if (!(attrname in obj.props)) {
                let liveattr = liveVal(el.getAttribute(attr), new Live());
                let oset = liveattr[internal].delegate.set;
                liveattr[internal].delegate.set = (target, attr, value) => {
                    if (attr == 'live') {
                        if (!isEmptyObject(liveattr[internal].pull)) { // this attr has been linked to something live, directly changing the value makes no sense => throw an exception
                            throw new ReferenceError("Cannot change live value of an attribute that is currently linked to a live entity");
                        } else {
                            let ret = oset(target, attr, value);
                            el.setAttribute(attr, value);
                            return ret;
                        }
                    } else {
                        return oset(target, attr, value);
                    }
                }

                liveattr[internal].type = "attribute:" + attrname;
                obj.props[attrname] = liveattr;
                // Maybe use a MutationObserver to observer attributes change?
                let refel = new WeakRef(el); // do not prevent garbage collect of DOM element
                liveattr[internal].notify = () => {
                    let el = refel.deref();
                    if (el) {
                        for (let uid in liveattr[internal].pull) {
                            let proxy = liveattr[internal].pull[uid].deref();
                            if (proxy) {
                                let old = liveattr.live;
                                let value;
                                try {
                                    value = proxy.live;
                                    if (typeof value == "function") value = value();
                                } catch (e) {
                                    return { type: "attribute", old, error: e };
                                }
                                liveattr[internal].state.live = value;
                                try {
                                    el.setAttribute(attr, value);
                                } catch (e) {
                                    throw new Error("Error when setting attribute "+attr, {cause:e});
                                }
                                return { type: "attribute", old, "new": value };
                            } else {
                                delete liveattr[internal].pull[uid];
                            }
                        }
                    } else {
                        for (let uid in liveattr[internal].pull) {
                            let proxy = liveattr[internal].pull[uid].deref();
                            if (proxy) {
                                delete proxy[internal].push[liveattr[internal].uid]; // remove from push of this old dependency
                            }
                            delete liveattr[internal].pull[uid];
                        }
                    }
                }
                return liveattr;
            } else {
                return obj.props[attrname];
            }
        }

        function setDomAttribute(attr, value) {
            if (value == null || liveLive(value) == value) {
                let attrname = "attr:" + attr;
                let domattr;
                if (attrname in live[internal].props) {
                    domattr = live[internal].props[attrname];
                } else {
                    domattr = getDomAttribute(attr);
                }
                let obj = domattr[internal];
                if (!("pull" in obj)) obj.pull = {};
                for (let uid in obj.pull) {
                    let proxy = obj.pull[uid].deref();
                    if (proxy) {
                        delete proxy[internal].push[obj.uid]; // remove from push of this old dependency
                    }
                    delete obj.pull[uid];
                }
                if (value != null) {
                    value[internal].push[obj.uid] = new HardRef(domattr);
                    obj.pull[value[internal].uid] = new WeakRef(value);
                    if (typeof value.live == "function") {
                        obj.state.live = value.live();
                    } else {
                        obj.state.live = value.live;
                    }
                }
                domattr[internal].notify();
            } else {
                throw new ReferenceError("Can only setAttribute('" + attribute + "',...) of a lifted DOM element to another lifted value.");
            }
        }

        function mapChildren(src, template, fn) {
            if (liveLive(src) !== src || !Array.isArray(src.live)) {
                throw new Error("Invalid mapChildren first parameter: not a live array");
            }
            if (template instanceof HTMLElement) {
                // ensure template is removed from the DOM
                if (template.parentElement != null) {
                    template.parentElement.removeChild(template);
                }
            } else if (template instanceof String || typeof template == "string") {
                // template is expressed as HTML, convert it to HTMLElement
                let div = document.createElement("DIV");
                div.innerHTML = template;
                template = div.children[0];
            } else if (typeof template != "function") {
                throw new Error("Invalid template for mapChildren");
            }
            el.innerHTML = ""; // force empty container
            function instanceTemplate(item, index) {
                if (template instanceof HTMLElement) {
                    return template.cloneNode(true);
                } else {
                    let instance = template(item, index);
                    if (instance instanceof String || typeof instance == "string") {
                        let tpl = document.createElement("TEMPLATE");
                        tpl.innerHTML = instance;
                        if (tpl.content.children.length != 1) throw new Error("Invalid template for mapChildren: the string template must have one root HTML element");
                        return tpl.content.children[0];
                    } else if (instance instanceof Node) {
                        if (instance.parentElement != null) {
                            throw new Error("Invalid template for mapChildren: each function call must return an new element not yet in the page");
                        }
                        return instance;
                    } else {
                        throw new Error("Invalid template for mapChildren");
                    }
                }
            }
            function applyOp(el, details) {
                let instance;
                switch (details.type) {
                    case "add":
                        instance = instanceTemplate(details.value, details.index);
                        el.appendChild(instance);
                        if (fn) fn(details.value, instance, details.index);
                        return;
                    case "insert":
                        instance = instanceTemplate(details.value, details.index);
                        el.insertBefore(instance, el.children[details.index]);
                        if (fn) fn(details.value, instance, details.index);
                        return;
                    case "remove":
                        el.removeChild(el.children[details.index]);
                        return;
                    case "set":
                        instance = instanceTemplate(details.value, details.index);
                        el.children[details.index].replaceWith(instance);
                        if (fn) fn(details.value, instance, details.index);
                        return;
                }
            }

            for (let i = 0; i < src.live.length; i++) {
                let instance = instanceTemplate(src.live[i], i);
                el.appendChild(instance);
                if (fn) fn(src.live[i], instance, i);
            }
            let propname = "mapChildren";
            if (!(propname in obj.props)) {
                let liveprop = new Live();
                liveprop[internal].type = "mapChildren";
                obj.props[propname] = liveprop; // dumb live just to be notified by src
                let refel = new WeakRef(el); // do not prevent garbage collect of DOM element
                liveprop[internal].notify = () => {
                    let el = refel.deref();
                    if (el) {
                        let allDetails = []; // details need to be grabbed from recvDetails
                        let target = obj.props[propname][internal];
                        for (let uid in target.pull) {
                            allDetails = recvDetails[uid];
                            break;
                        }
                        for (let i = 0; i < allDetails.length; i++) {
                            let details = allDetails[i];
                            if ("operations" in details) {
                                for (let i = 0; i < details.operations.length; i++) {
                                    applyOp(el, details.operations[i]);
                                }
                            } else if (details.type == "assign" && "length" in details.new) {
                                el.innerHTML = "";
                                for (let i = 0; i < details.new.length; i++) {
                                    let instance = instanceTemplate(details.new[i], i);
                                    el.appendChild(instance);
                                    if (fn) fn(details.new[i], instance, i);
                                }
                            }
                        }
                    } else {
                        //                        console.log("GC8");
                        let target = obj.props[propname][internal];
                        //                        console.log(target);
                        for (let uid in target.pull) {
                            let proxy = target.pull[uid].deref();
                            if (proxy) {
                                delete proxy[internal].push[target.uid]; // remove from push of this old dependency
                            } else {
                                //                                console.log("GC9:" + uid);
                            }
                            delete target.pull[uid];

                        }
                    }
                }
            }
            let target = obj.props[propname][internal];
            if (!("pull" in target)) target.pull = {};
            for (let uid in target.pull) {
                let proxy = target.pull[uid].deref();
                if (proxy) {
                    delete proxy[internal].push[target.uid]; // remove from push of this old dependency
                } else {
                    //                    console.log("GC10:" + uid);
                }
                delete target.pull[uid];

            }
            src[internal].push[target.uid] = new HardRef(obj.props[propname]);
            target.pull[src[internal].uid] = new WeakRef(src);
            return src;
        }

        function liveSelectorAll(root, filter) {
            let liveSelectorAll;
            if (filter in obj.observers) {
                liveSelectorAll = obj.observers[filter];
                if (liveSelectorAll) return liveSelectorAll.live;
            }
            liveSelectorAll = new Live();
            liveSelectorAll[internal].type = "selectorAll:" + filter;
            obj.observers[filter] = { live: liveSelectorAll }; // weakref to avoid preventing garbage collection of unsused liveSelectorAll
            let objSelectorAll = liveSelectorAll[internal];
            // a MutationObserver on root is required to ensure notification of DOM changes
            objSelectorAll.state = { live: root.querySelectorAll(filter) };
            obj.observers[filter].observer = new MutationObserver((mutations) => {
                // dummy implementation that completely ignores the filter and mutations
                // we just rely on querySelectorAll, and detect when the result changes
                let newresult = root.querySelectorAll(filter);
                if (!eqSet(new Set(newresult), new Set(objSelectorAll.state.live))) {
                    let old = objSelectorAll.state.live;
                    objSelectorAll.state.live = newresult;
                    notifyChange(liveSelectorAll, { type: "querySelectorAll", old, "new": newresult });
                }
            });
            obj.observers[filter].observer.observe(root, { attributes: true, childList: true, subtree: true });
            objSelectorAll.delegate = {
                set(_, prop, value) {
                    throw new ReferenceError("Cannot change " + prop + " on this object.");
                },
                get(target, prop, _) {
                    switch (prop) {
                        case "live":
                            return target.live;
                        default:
                            throw new ReferenceError("Cannot access " + prop + " on this object.");
                    }
                }
            }

            return liveSelectorAll;
        }

        function liveSerializeObject(root) {
            let liveSerialize;
            if (internal in obj.observers) { // reuse internal key to signify serializeObject
                liveSerialize = obj.observers[internal];
                if (liveSerialize) return liveSerialize.live;
            }
            liveSerialize = new Live();
            liveSerialize[internal].type = "serializeObject";
            obj.observers[internal] = { live: liveSerialize };
            liveSerialize[internal].listeners = {};
            let objSerialize = liveSerialize[internal];
            const filter = 'input[name]:not([type="reset"]):not([type="submit"]):not([type="button"]),textarea[name],select[name]';
            // a MutationObserver on root is required to ensure notification of DOM changes
            function getKeys() {
                let els = objSerialize.state.elements;
                let ret = new Set();
                for (let i = 0; i < els.length; i++) ret.add(els[i].getAttribute("name"));
                return ret;
            }
            function getEls(name) {
                let els = objSerialize.state.elements;
                let ret = [];
                for (let i = 0; i < els.length; i++) {
                    if (els[i].getAttribute("name") == name) ret.push(els[i]);
                }
                return ret;
            }
            let handler = {
                get(_, prop) {
                    if (prop == "toJSON") {
                        let ret = {};
                        let keys = getKeys();
                        for (let k of keys) {
                            ret[k] = handler.get(_, k);
                        }
                        return ret;
                    } else {
                        let els = getEls(prop);
                        if (els.length == 0) throw new ReferenceError("Cannot access " + prop + " on this object.");
                        if (liveTrace != null) liveTrace.add(liveSerialize);
                        let el = els[0];
                        switch (el.nodeName) {
                            case "INPUT":
                                let radio = true; // stays true iff all elements are radio buttons
                                for (let i = 0; i < els.length; i++) {
                                    if (els[i].type != "radio") {
                                        radio = false;
                                        break;
                                    }
                                }
                                if (radio) {
                                    for (let i = 0; i < els.length; i++) {
                                        if (els[i].checked) return els[i].value;
                                    }
                                    return null;
                                } else if (el.type == "checkbox") {
                                    return el.checked;
                                } else if (el.type == "file") {
                                    return el.files;
                                } else {
                                    return el.value;
                                }
                            case "SELECT":
                                if (el.type == "select-multiple") {
                                    let ret = [];
                                    for (let i = 0; i < el.options.length; i++) {
                                        if (el.options[i].selected) ret.push(el.options[i].getAttribute("value"));
                                    }
                                    return ret;
                                } else {
                                    for (let i = 0; i < el.options.length; i++) {
                                        if (el.options[i].selected) return el.options[i].getAttribute("value");
                                    }
                                    return null;
                                }
                            case "TEXTAREA":
                                return el.value;
                        }
                    }
                },
                set(_, prop, value) {
                    let els = getEls(prop);
                    if (els.length == 0) throw new ReferenceError("Cannot change " + prop + " on this object.");
                    let el = els[0];
                    switch (el.nodeName) {
                        case "INPUT":
                            let radio = true; // stays true iff all elements are radio buttons
                            for (let i = 0; i < els.length; i++) {
                                if (els[i].type != "radio") {
                                    radio = false;
                                    break;
                                }
                            }
                            if (radio) {
                                for (let i = 0; i < els.length; i++) {
                                    els[i].checked = (els[i].value == value);
                                }
                                return value;
                            } else if (el.type == "checkbox") {
                                return el.checked = value;
                            } else if (el.type == "file") {
                                return el.files = value;
                            } else {
                                return el.value = value;
                            }
                        case "SELECT":
                            if (el.type == "select-multiple") {
                                for (let i = 0; i < el.options.length; i++) {
                                    el.options[i].selected = value.indexOf(el.options[i].getAttribute() || '') != -1;
                                }
                            } else {
                                return el.value = value;
                            }
                        case "TEXTAREA":
                            return el.value = value;
                    }
                },
                ownKeys(_) {
                    let keys = getKeys();
                    return [...keys];
                },
                getOwnPropertyDescriptor(_, prop) {
                    return { writable: true, configurable: true, enumerable: true };
                }
            };
            objSerialize.state = {
                elements: [],
                lives: new Set()
            };
            objSerialize.delegate = handler;
            function clearListener(name) {
                let l = liveSerialize[internal].listeners;
                if (name in l) {
                    let els = l[name].els;
                    for (let i = 0; i < els.length; i++) {
                        els[i].removeEventListener("change", l[name].listener);
                    }
                    delete l[name];
                }
            }
            function checkKeys() {
                // we just rely on querySelectorAll, and detect when the result changes
                let newresult = root.querySelectorAll(filter);
                if (!eqSet(new Set(newresult), new Set(objSerialize.state.elements))) {
                    objSerialize.state.elements = newresult;
                    let keys = getKeys();
                    let ops = [];
                    for (let k of keys) if (!(objSerialize.state.lives.has(k))) {
                        ops.push({ type: "add", name: k });
                        // listen to new element
                        clearListener(k);
                        let els = getEls(k);
                        function listener() {
                            notifyChange(liveSerialize, { type: "serializeobject", change: k })
                        }
                        for (let i = 0; i < els.length; i++) {
                            els[i].addEventListener('change', listener);
                        }
                        liveSerialize[internal].listeners[k] = { els, listener };
                        objSerialize.state.lives.add(k);
                    }
                    for (let k of objSerialize.state.lives) if (!keys.has(k)) {
                        ops.push({ type: "remove", name: k });
                        // stop listening to removed element
                        clearListener(k);
                        objSerialize.state.lives.delete(k);
                    }
                    if (ops.length > 0) notifyChange(liveSerialize, { type: "serializeobject", domchange: ops });
                }
            }
            let observer = new MutationObserver(checkKeys);
            obj.observers[internal].observer = {
                disconnect() {
                    observer.disconnect();
                    let l = liveSerialize[internal].listeners;
                    for (let k in l) {
                        l[k].el.removeEventListener("change", l[k].listener);
                    }
                }
            }
            observer.observe(root, { attributes: true, childList: true, subtree: true });
            checkKeys();
            return liveSerialize;
        }

        obj.pull = {};
        obj.unbind = () => {
            for (let propname in obj.events) {
                let evt = live[internal].events[propname];
                let el = evt.el.deref();
                if (el) {
                    if (Array.isArray(evt.event)) {
                        for (let i = 0; i < evt.event.length; i++) {
                            el.removeEventListener(evt.event[i], evt.callback);
                        }
                    } else {
                        el.removeEventListener(evt.event, evt.callback);
                    }
                } else {
                    //                    console.log("GC11");
                    //                    console.log(obj);
                }
                delete live[internal].events[propname];
            }
            for (let propname in obj.props) {
                let prop = obj.props[propname];
                if (prop) {
                    prop = prop[internal];
                    if ("pull" in prop) {
                        for (let uid in prop.pull) {
                            let proxy = prop.pull[uid].deref();
                            if (proxy) {
                                delete proxy[internal].push[prop.uid]; // remove from push of this old dependency
                            } else {
                                //                                console.log("GC12:" + uid);
                            }
                            delete prop.pull[uid];
                        }
                    }
                }
            }
            for (let filter in obj.observers) {
                obj.observers[filter].observer.disconnect();
            }
        }
        obj.el = el;
        obj.delegate.get = (_, prop) => {
            switch (prop) {
                case "live":
                    return el;
                case "value":
                    return getDomProp(prop, "input"); // ["change", "keyup", "input"]);
                case "innerHTML":
                case "innerText":
                    return getDomProp(prop, "focusout");
                case "checked":
                case "inert":
                case "selected":
                    return getDomProp(prop, "change");
                case "disabled":
                case "readOnly":
                case "title":
                    return getDomProp(prop);
                case "style":
                    if (!("style" in obj)) {
                        obj.style = new Proxy({}, {
                            get(_, prop) {
                                return getDomProp(prop, undefined, "style");
                            },
                            set(_, prop, value) {
                                return setDomProp(prop, value, undefined, "style");
                            }
                        });
                    }
                    return obj.style;
                case "mapChildren":
                    return mapChildren;
                case "getAttribute":
                    return function (attribute) {
                        return getDomAttribute(attribute);
                    }
                case "setAttribute":
                    return function (attribute, value) {
                        return setDomAttribute(attribute, value);
                    }
                case "removeAttribute":
                    return function (attribute) {
                        setDomAttribute(attribute, undefined);
                        el.removeAttribute(attribute);
                    }
                case "querySelector":
                    return function (selector) {
                        return live(el.querySelector(selector));
                    }
                case "querySelectorAll":
                    return function (selector) {
                        if (liveTrace != null) liveTrace.add(live);
                        return liveSelectorAll(el, selector).live;
                    }
                case "getElementById":
                    return function (id) {
                        return live(el.getElementById(id));
                    }
                case "getElementsByName":
                    return function (name) {
                        if (liveTrace != null) liveTrace.add(live);
                        return liveSelectorAll(el, `[name="${name}"]`).live;
                    }
                case "getElementsByTagName":
                    return function (name) {
                        if (liveTrace != null) liveTrace.add(live);
                        return liveSelectorAll(el, name).live;
                    }
                case "elements":
                    if (liveTrace != null) liveTrace.add(live);
                    return liveSelectorAll(el, "input,select,textarea").live;
                case "images":
                    if (liveTrace != null) liveTrace.add(live);
                    return liveSelectorAll(el, "img").live;
                case "embeds":
                case "plugins":
                    if (liveTrace != null) liveTrace.add(live);
                    return liveSelectorAll(el, "embed").live;
                case "links":
                    if (liveTrace != null) liveTrace.add(live);
                    return liveSelectorAll(el, "a[href],area[href]").live;
                case "scripts":
                    if (liveTrace != null) liveTrace.add(live);
                    return liveSelectorAll(el, "scripts").live;
                case "children":
                    if (liveTrace != null) liveTrace.add(live);
                    return liveSelectorAll(el, ":scope >*").live;
                case "serializeObject":
                    return liveSerializeObject(el);
                // childNodes cannot rely on liveSelectorAll because of text nodes => custom solution instead
                default:
                    throw new ReferenceError("Cannot change " + prop + " on this object.");
            }
        }
        obj.delegate.set = (target, prop, value) => {
            switch (prop) {
                case "value":
                    return setDomProp(prop, value, ["keyup","input"]);
                case "innerHTML":
                case "innerText":
                    return setDomProp(prop, value, "focusout");
                case "checked":
                    return setDomProp(prop, value, "change");
                case "disabled":
                case "readOnly":
                case "title":
                case "inert":
                case "selected":
                    return setDomProp(prop, value);
                case "style":
                    throw new Error("Cannot overwrite " + value);
                case "live":
                    let old = target.live;
                    mergeLive(value, live);
                    notifyChange(live, { type: "assign", old, "new": target.live });
                    return;
                case "serializeObject":
                    if (isPureObject(value)) {
                        let so = liveSerializeObject(el);
                        for (let k in value) so[k] = value[k];
                        return;
                    } else {
                        throw new ReferenceError("Can only assign serializeObject to pure objects");
                    }
                default:
                    if (!(value in target)) {
                        throw new Error("Invalid key " + value);
                    }
            }
        }

        return live;
    }
}

liveCreators.push(liveLive);
liveCreators.push(liveVal);
liveCreators.push(liveFunc);
liveCreators.push(liveArray);
liveCreators.push(livePureObject);
liveCreators.push(liveMap);
liveCreators.push(liveSet);
if (typeof HTMLElement != "undefined") liveCreators.push(liveDom);
liveCreators.push(liveObject);
liveCreators.push(liveError);

const eqSet = (xs, ys) =>
    xs.size === ys.size &&
    [...xs].every((x) => ys.has(x));

let triggering = false;

function stack() {
    let stack = new Error().stack.split('\n');
    function get(l) {
        let idx = l.indexOf("(");
        return l.substring(idx + 1, l.length - 1);
    }
    for (let i = 1; i < stack.length; i++) {
        let r = get(stack[i]);
        if (r.indexOf("/live.js:") == -1) return r;
    }
    return get(stack[0]);
}

function toString(live) {
    let i = live[internal] ? live[internal] : live;
    return i.uid + "/" + i.type + JSON.stringify(i.state);
}

function notifyChange(live, details) {
    if (triggering) {
        if (recvDetails) {
            let uid = live[internal].uid;
            if (!(uid in recvDetails)) {
                recvDetails[uid] = [];
            }
            recvDetails[uid].push(details);
        }
        if (unresolved) {
            unresolved[live[internal].uid] = live;
        }
        return;
    }
    if (loggerConfig.propagation) { Logger.info(`${live[internal].uid}:startPropagation:${toString(live)}:${stack()}`) };
    recvDetails = {};
    recvDetails[live[internal].uid] = [details];
    triggering = true;
    let tobenotified = {};
    try {
        let resolved = new Set();
        resolved.add(live[internal].uid); // the trigger live was already solved before triggering
        let targets = {}; // JS maps keep the order in witch items are put in
        let attemptCount = {};
        function gather(inter, force = false) {
            for (let uid in inter.push) {
                let ref = inter.push[uid].deref();
                if (ref) {
                    if (!force) {
                        if (!(uid in targets) && !(resolved.has(uid))) {
                            targets[uid] = {
                                internal: ref[internal],
                                deps: (ref[internal].pull ? Object.keys(ref[internal].pull) : [])
                            }
                            gather(ref[internal]);
                        }
                    } else {
                        if (!(uid in targets)) {
                            targets[uid] = {
                                internal: ref[internal],
                                deps: (ref[internal].pull ? Object.keys(ref[internal].pull) : [])
                            }
                            resolved.delete(uid);
                            gather(ref[internal], true);
                        }
                    }
                } else {
                    //                    console.log("GC13:" + uid);
                    delete inter.push[uid];
                }
            }
        }
        gather(live[internal]);
        // finds a target to resolve
        function canNotify(target, withAttempt = false) {
            for (let j = 0; j < target.deps.length; j++) {
                let uid = target.deps[j];
                if (resolved.has(uid)) continue; // already resolved
                if (!(uid in targets)) continue; // not concerned by what is happening
                if (withAttempt && (uid in attemptCount)) continue; // accept something that has been attempted
                return false; // target still has not resolved to be updated dependency
            }
            return true;
        }
        function attemptTarget(target, lastchance = false) {
            let uid = target.internal.uid;
            // found a target
            if (!(uid in attemptCount)) attemptCount[uid] = 0;
            attemptCount[uid]++;
            delete target.internal.exception;
            unresolved = {};
            if (loggerConfig.propagation) { Logger.info(`  ${live[internal].uid}:attempting:${toString(target.internal)}`) };
            let details = target.internal.notify();
            let newdeps = (target.internal.pull ? Object.keys(target.internal.pull) : []);
            if (!(eqSet(new Set(newdeps), new Set(target.deps)))) {
                if (loggerConfig.propagation) { Logger.info(`  ${live[internal].uid}:dep_changed:${toString(target.internal)}:${JSON.stringify(target.deps)}:${JSON.stringify(newdeps)}`) };
                target.deps = newdeps;
                if (!canNotify(target)) {
                    if (loggerConfig.propagation) { Logger.info(`  ${live[internal].uid}:retry_needed:${toString(target.internal)}`) };
                    // due to a change in target's dependencies, we cannot consider the notification a success
                    gather(target.internal); // recompute dependencies starting from this target
                    return true; // we want to loop to be able to try again
                }
            } else if (lastchance) {
                // target was notified, dependencies didn't change, and it is a lastchance run
                if (!details || details.new !== details.old) {
                    // unstable situation, cannot assume it has run successfully
                    if (loggerConfig.propagation) { Logger.info(`  ${live[internal].uid}:lastchance_failed:${toString(target.internal)}`) };
                    return false;
                }
                // otherwise, we consider it has run its course and the dependency is now satisfied
            }
            tobenotified[uid] = () => {
                if ("changeListeners" in target.internal) {
                    let cl = target.internal.changeListeners;
                    for (let i = 0; i < cl.length; i++) {
                        cl[i](details);
                    }
                }
            }
            resolved.add(uid);
            delete targets[uid];
            delete unresolved[uid];
            for (let uid in unresolved) {
                resolved.delete(uid);
                gather(unresolved[uid][internal], true);
                delete unresolved[uid];
            }
            if (loggerConfig.propagation) { Logger.info(`  ${live[internal].uid}:success:${toString(target.internal)}:${JSON.stringify(Object.keys(resolved))}:${JSON.stringify(Object.keys(unresolved))}`) };
            return true;
        }
        let count = 0;
        // Reset circular dependencies by clearing related dependencies:
        // We intentionally set the dependencies of circular dependencies to nothing to give them a chance to get executed.
        // This results in glitches (several execution of the same live function in the same propagation), but also gives the circular reference a chance to disappear.
        for (let uid in targets) {
            if (targets[uid].internal.circular === true) {
                delete targets[uid].internal.circular;
                targets[uid].deps = [];
            }
        }
        function propagate() {
            let cont = true;
            while (cont && count < MAXDEPENDENCY) {
                if (loggerConfig.propagation) { Logger.info(`  ${live[internal].uid}:targets:${JSON.stringify(Object.keys(targets))}:${JSON.stringify(Object.keys(resolved))}`) };
                count++;
                cont = false;
                for (let uid in targets) {
                    let target = targets[uid];
                    if (canNotify(target)) {
                        if (attemptTarget(target)) {
                            cont = true;
                        }
                    }
                }
                if (cont == false && Object.keys(targets).length != 0) {
                    // The dependency tree has circular references
                    // This situation is possible because dependencies can change dynamically, as live functions execution paths change
                    // We might unstuck the situation by taking attemptCount into account:
                    //   if an attempt has been made on a live object which is still an unresolved target
                    //   then it means that other live objects not yet attempted in the loop may break the loop
                    for (let uid in targets) {
                        let target = targets[uid];
                        if (canNotify(target, true)) {
                            // we know that canNotify(target,false) is false
                            // so we are here only because of attemptCount
                            if (attemptTarget(target, true)) {
                                if (canNotify(target)) { // now this is working for real, and we are unstuck
                                    cont = true;
                                    break;
                                } else {
                                    // undo changes
                                    resolved.delete(target.internal.uid);
                                    targets[target.internal.uid] = target;
                                }
                            }
                        }
                    }
                }
            }
        }

        propagate();

        if (count >= MAXDEPENDENCY) {
            // set everything remaining in an exception state and give up
            // this is a worst case scenario because there is nothing more we can do...
            for (let uid in targets) {
                if (!("exception" in targets[uid].internal)) {
                    // embedded as a function so that the stack liveTrace is computed from a place it makes sense
                    targets[uid].internal.exception = () => new RangeError("Maximum lifted propagation exceeded");
                }
            }
        } else if (Object.keys(targets).length != 0) { // some targets are still unresolved
            // This happens because of a circular dependency
            // This is touchy because we want a behavior that simulates a thrown error, while no such thing happens
            // And just putting everything in an exception mode prevents functions trying to catch an exception from working
            // For now, we set functions to throw an exception if and only if they do not update a property or attribute
            // Also, we flag them as being part of a circular group.
            let touched = [];
            for (let uid in targets) {
                let o = targets[uid].internal;
                o.circular = true;
                if ("exception" in o) continue;
                if (o.type != "function") continue;
                if (Object.keys(o.push).length == 1 &&
                    o.push[Object.keys(o.push)[0]].deref()[internal].type != "function") continue;
                // embedded as a function so that the stack liveTrace is computed from a place it makes sense
                o.exception = () => { throw new Error("Unresolvable circular dependencies") };
                touched.push(o);
                for (let u in o.push) resolved.delete(u);
                resolved.add(uid);
            }
            for (let i = 0; i < touched.length; i++) {
                gather(touched[i]);
                delete targets[touched[i].uid];
            }
            if (touched.length > 0) {
                propagate();
            }
        }
    } catch (e) {
        // Verrrryyyy bad !
        console.error("FATAL: internal error was leaked during propagation!");
        console.error(e);
        debugger;
    } finally {
        triggering = false;
        recvDetails = null;
        unresolved = null;
        if (!(live[internal].uid in tobenotified) && "changeListeners" in live[internal]) {
            let cl = live[internal].changeListeners;
            for (let i = 0; i < cl.length; i++) {
                cl[i](details);
            }
        }
        for (let k in tobenotified) {
            try {
                tobenotified[k]();
            } catch (e) {
                if (loggerConfig.allExceptions || loggerConfig.lostExceptions) {
                    Logger.error(e);
                }
            }
        }
        if (loggerConfig.propagation) { Logger.info(`${live[internal].uid}:stopPropagation:${toString(live)}`) };
    }
}

if (typeof module !== "undefined" && ("exports" in module)) module.exports = { live, internal, loggerConfig };