const _A_ = Symbol('a');
const _ABBR_ = Symbol('abbr');
const _ACRONYM_ = Symbol('acronym');
const _ADDRESS_ = Symbol('address');
const _APPLET_ = Symbol('applet');
const _AREA_ = Symbol('area');
const _ARTICLE_ = Symbol('article');
const _ASIDE_ = Symbol('aside');
const _AUDIO_ = Symbol('audio');
const _B_ = Symbol('b');
const _BASE_ = Symbol('base');
const _BASEFONT_ = Symbol('basefont');
const _BDI_ = Symbol('bdi');
const _BDO_ = Symbol('bdo');
const _BIG_ = Symbol('big');
const _BLOCKQUOTE_ = Symbol('blockquote');
const _BODY_ = Symbol('body');
const _BR_ = Symbol('br');
const _BUTTON_ = Symbol('button');
const _CANVAS_ = Symbol('canvas');
const _CAPTION_ = Symbol('caption');
const _CENTER_ = Symbol('center');
const _CITE_ = Symbol('cite');
const _CODE_ = Symbol('code');
const _COL_ = Symbol('col');
const _COLGROUP_ = Symbol('colgroup');
const _DATA_ = Symbol('data');
const _DATALIST_ = Symbol('datalist');
const _DD_ = Symbol('dd');
const _DEL_ = Symbol('del');
const _DETAILS_ = Symbol('details');
const _DFN_ = Symbol('dfn');
const _DIALOG_ = Symbol('dialog');
const _DIR_ = Symbol('dir');
const _DIV_ = Symbol('div');
const _DL_ = Symbol('dl');
const _DT_ = Symbol('dt');
const _EM_ = Symbol('em');
const _EMBED_ = Symbol('embed');
const _FIELDSET_ = Symbol('fieldset');
const _FIGCAPTION_ = Symbol('figcaption');
const _FIGURE_ = Symbol('figure');
const _FONT_ = Symbol('font');
const _FOOTER_ = Symbol('footer');
const _FORM_ = Symbol('form');
const _FRAME_ = Symbol('frame');
const _FRAMESET_ = Symbol('frameset');
const _H1_ = Symbol('h1');
const _H2_ = Symbol('h2');
const _H3_ = Symbol('h3');
const _H4_ = Symbol('h4');
const _H5_ = Symbol('h5');
const _H6_ = Symbol('h6');
const _HEAD_ = Symbol('head');
const _HEADER_ = Symbol('header');
const _HGROUP_ = Symbol('hgroup');
const _HR_ = Symbol('hr');
const _HTML_ = Symbol('html');
const _I_ = Symbol('i');
const _IFRAME_ = Symbol('iframe');
const _IMG_ = Symbol('img');
const _INPUT_ = Symbol('input');
const _INS_ = Symbol('ins');
const _KBD_ = Symbol('kbd');
const _LABEL_ = Symbol('label');
const _LEGEND_ = Symbol('legend');
const _LI_ = Symbol('li');
const _LINK_ = Symbol('link');
const _MAIN_ = Symbol('main');
const _MAP_ = Symbol('map');
const _MARK_ = Symbol('mark');
const _MENU_ = Symbol('menu');
const _META_ = Symbol('meta');
const _METER_ = Symbol('meter');
const _NAV_ = Symbol('nav');
const _NOFRAMES_ = Symbol('noframes');
const _NOSCRIPT_ = Symbol('noscript');
const _OBJECT_ = Symbol('object');
const _OL_ = Symbol('ol');
const _OPTGROUP_ = Symbol('optgroup');
const _OPTION_ = Symbol('option');
const _OUTPUT_ = Symbol('output');
const _P_ = Symbol('p');
const _PARAM_ = Symbol('param');
const _PICTURE_ = Symbol('picture');
const _PRE_ = Symbol('pre');
const _PROGRESS_ = Symbol('progress');
const _Q_ = Symbol('q');
const _RP_ = Symbol('rp');
const _RT_ = Symbol('rt');
const _RUBY_ = Symbol('ruby');
const _S_ = Symbol('s');
const _SAMP_ = Symbol('samp');
const _SCRIPT_ = Symbol('script');
const _SEARCH_ = Symbol('search');
const _SECTION_ = Symbol('section');
const _SELECT_ = Symbol('select');
const _SMALL_ = Symbol('small');
const _SOURCE_ = Symbol('source');
const _SPAN_ = Symbol('span');
const _STRIKE_ = Symbol('strike');
const _STRONG_ = Symbol('strong');
const _STYLE_ = Symbol('style');
const _SUB_ = Symbol('sub');
const _SUMMARY_ = Symbol('summary');
const _SUP_ = Symbol('sup');
const _SVG_ = Symbol('svg');
const _TABLE_ = Symbol('table');
const _TBODY_ = Symbol('tbody');
const _TD_ = Symbol('td');
const _TEMPLATE_ = Symbol('template');
const _TEXTAREA_ = Symbol('textarea');
const _TFOOT_ = Symbol('tfoot');
const _TH_ = Symbol('th');
const _THEAD_ = Symbol('thead');
const _TIME_ = Symbol('time');
const _TITLE_ = Symbol('title');
const _TR_ = Symbol('tr');
const _TRACK_ = Symbol('track');
const _TT_ = Symbol('tt');
const _U_ = Symbol('u');
const _UL_ = Symbol('ul');
const _VAR_ = Symbol('var');
const _VIDEO_ = Symbol('video');
const _WBR_ = Symbol('wbr');
const _TEXT_ = Symbol('text');

const build = (() => {

    function isLive(o) {
        return ((typeof o == 'object') && o[internal] !== undefined);
    }

    function build(what, how = { mode: "direct" }) {
        if ("_context_" in build) {
            throw new Error("Cannot recursively call build() while already running a build()");
        }
        let _context_ = {};
        Object.assign(_context_, how);
        _context_.atEnd = [];
        build._context_ = _context_;
        let ret = build.innerBuild(what);
        if (how.mode == "direct" || how.mode == "bind") {
            let atEnd = build._context_.atEnd;
            for (let i = 0; i < atEnd.length; i++) {
                atEnd[i]();
            }
        }
        delete build._context_;
        if (how.mode == "trace") {
            return simplify(ret.src, ret.tgt, ret.html);
        } else {
            return ret;
        }
    }

    build.innerBuild = (what, context) => {
        if (context == undefined) context = build._context_;
        if (context == undefined) throw new Error("Internal error: missing context for " + build.stringify(what));
        let dupe, type;
        if (typeof what == "string") {
            dupe = what;
        } else {
            type = build.getType(what);
            let key = build.getTypeKey(type);
            if (type == null) throw new Error("Missing type for " + build.stringify(what));
            dupe = {};
            for (let k in what) { // shallow copy so that we can manipulate the keys without changing the original
                if (k !== key) dupe[k] = what[k];
            }
            build.applyDefaults(dupe, type);
        }
        return build.build(dupe, type, context);
    }

    build.defaultBuilder = (what, type, context) => {
        if (context == undefined) context = build._context_;
        if (context == undefined) throw new Error("Internal error: missing context for " + build.stringify(what));
        if (!(context.mode in build.defaultBuilder)) {
            throw new Error("Internal error: unknown mode " + context.mode + " for " + build.stringify(what));
        }
        return build.defaultBuilder[context.mode](what, type, context);
    }

    function getState(v) {
        if (isLive(v)) v = v.live;
        if (typeof v == 'function') v = v();
        return v;
    }

    function bindEvents(el, lel, l, events) {
        function wrap(fn) {
            switch (l) {
                case "rendering":
                    fn(new Event("rendering"), lel);
                    break;
                case "rendered":
                    setTimeout(() => { fn(new Event("rendering"), lel) }, 0);
                    break;
                default:
                    el.addEventListener(l, (event) => { fn(event, lel) });
            }
        }
        if (Array.isArray(events)) {
            for (let i = 0; i < events.length; i++) {
                wrap(events[i]);
            }
        } else {
            wrap(events);
        }
    }

    build.defaultBuilder.direct = (what, type, context) => {  // direct DOM elements creation
        let el = document.createElement(type.description);
        let lel = live(el);
        let children;
        if ("handle" in what) {
            what.handle.live = el;
        }
        for (let prop in what) {
            switch (prop) {
                case "listener":
                    for (let l in what.listener) {
                        bindEvents(el, lel, l, what.listener[l]);
                    }
                    break;
                case "child":
                    children = [what.child];
                case "children":
                    if (prop == "children") children = what.children;
                    if (isLive(children)) {
                        lel.mapChildren(children, c => build.innerBuild(getState(c), context));
                    } else if (typeof children == "function") {
                        let array = live([]);
                        live(() => array.live = children());
                        lel.mapChildren(array, c => build.innerBuild(getState(c), context));
                    } else {
                        let alive = false;
                        for (let i = 0; i < children.length; i++) {
                            if (typeof children[i] == "function") children[i] = live(children[i]);
                            if (isLive(children[i])) {
                                alive = true;
                            }
                        }
                        if (alive) {
                            lel.mapChildren(live(children), c => build.innerBuild(getState(c), context));
                        } else { // not live data to manage
                            for (let i = 0; i < children.length; i++) {
                                el.appendChild(build.innerBuild(children[i], context));
                            }
                        }
                    }
                    break;
                case "mapChildren":
                    if (!('array' in what[prop]) || !('render' in what[prop])) {
                        throw new Error("mapChildren requires an object {array,render} ");
                    }
                    children = what[prop].array;
                    lel.mapChildren(isLive(children) ? children : live(children), (c, i) => build.innerBuild(what[prop].render(c, i), context));
                    break;
                case "innerText":
                case "innerHTML":
                case "value":
                case "checked":
                case "inert":
                case "selected":
                case "disabled":
                case "readonly":
                case "title":
                    if (typeof what[prop] == 'function') {
                        lel[prop] = live(what[prop]);
                    } else if (isLive(what[prop])) {
                        lel[prop] = what[prop];
                    } else {
                        // el[prop]=what[prop] results in problems
                        // if the live version of el[prop] is used down the line.
                        // Indeed, this reactive system does not listen to DOM mutations,
                        // and if the live variable already exists, it is now out of sync with the element property
                        // By staying at the reactive level, we avoid this issue.
                        lel[prop] = live(what[prop]);
                    }
                    break;
                case "style":
                    let style = (typeof what.style == "function") ? live(what.style) : what.style;
                    if (isLive(what.style)) {
                        lel[style] = what.style; // TODO check that this is working
                    } else {
                        for (let s in what.style) {
                            let v = what.style[s];
                            if (typeof v == "function") v = live(v);
                            if (isLive(v)) {
                                lel.style[s] = v;
                            } else {
                                lel.style[s] = live(v);
                            }
                        }
                    }

                    break;
                case "handle":
                    break;
                default:
                    let v = what[prop];
                    if (typeof v == "function") v = live(v);
                    if (isLive(v)) {
                        lel.setAttribute(prop, v);
                    } else {
                        lel.setAttribute(prop, live(v));
                    }
            }
        }
        return el;
    }

    build.defaultBuilder.html = (what, type, context) => { // creates HTML
        let out = [];
        out.push(`<${type.description}`);
        function toString(v) {
            let ret = isLive(v) ? v.live : v;
            //        if (typeof ret == "function") ret = ret();
            return new String(ret).toString();
        }
        for (let prop in what) {
            switch (prop) {
                case "listener":
                // ignore listeners, they are bound using addEventListener and not the onevent HTML attribute
                case "child":
                case "children":
                case "mapChildren":
                // ignore children, they matter after closing the tag
                case "handle":
                    // ignore handle, they are of no use in this mode
                    break;
                case "value":
                case "checked":
                case "inert":
                case "selected":
                case "disabled":
                case "readonly":
                case "title":
                    if (toString(what[prop]) == "true") {
                        out.push(` ${prop}`);
                    }
                    break;
                case "style":
                    out.push(` style="`);
                    for (let s in what.style) {
                        out.push(`${s}=${toString(what.style[s])};`);
                    }
                    out.push(`" `);
                    break;
                default:
                    out.push(` ${prop}="${toString(what[prop]).replace(/"/g, "&quot;")}"`);
            }
        }
        out.push('>');
        if ("innerText" in what) {
            let t = getState(what.innerText);
            out.push(t.replace(/&/g, "&amp;") // manual escape so that there is zero reliance on DOM and this can run in pure node.
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;"));
        } else if ("innerHTML" in what) {
            out.push(getState(what.innerHTML));
        }
        if (!(type.description in { area: true, base: true, br: true, col: true, command: true, embed: true, hr: true, img: true, input: true, keygen: true, link: true, meta: true, param: true, source: true, track: true, wbr: true })) {
            // tag has a closing counterpart (https://www.thoughtco.com/html-singleton-tags-3468620)
            let children;
            for (let prop in what) {
                switch (prop) {
                    case "child":
                        children = [what.child];
                    case "children":
                        if (prop == "children") children = what.children;
                        let array = isLive(children) ? children.live : children;
                        if (typeof array == "function") array = array();
                        out.push("\n");
                        for (let i = 0; i < array.length; i++) {
                            out.push(build.innerBuild(array[i], context));
                        }
                        out.push("\n");
                        break;
                    case "mapChildren":
                        if (!('array' in what[prop]) || !('render' in what[prop])) {
                            throw new Error("mapChildren requires an object {array,render} ");
                        }
                        children = what[prop].array;
                        if (isLive(children)) children = children.live;
                        if (typeof children == "function") children = children();
                        out.push("\n");
                        for (let i = 0; i < children.length; i++) {
                            out.push(build.innerBuild(what[prop].render(children[i]), context));
                        }
                        out.push("\n");
                        break;
                }
            }
            out.push(`</${type.description}>`);
        }
        return out.join("");
    }

    build.defaultBuilder.bind = (what, type, context) => {  // direct DOM elements creation
        if (!("target" in context)) {
            throw new Error('build(...,{mode:"bind" target:...}) : missing a target property to the pre-rendered HTML element.');
        }
        let el = context.target;
        if (el == null || el.tagName.toLowerCase() != type.description.toLowerCase()) {
            throw new Error('build(...,{mode:"bind", target:...}) : invalid target element, expecting type ' + type.description + ' but got ' + (el == null ? null : el.outerHTML) + ' instead.');
        }
        let lel = live(el);
        let children;
        if ("handle" in what) {
            what.handle.live = el;
        }
        for (let prop in what) {
            switch (prop) {
                case "listener":
                    for (let l in what.listener) {
                        bindEvents(el, lel, l, what.listener[l]);
                    }
                    break;
                case "child":
                    children = [what.child];
                case "children":
                    if (prop == "children") children = what.children;
                    if (isLive(children)) {
                        build._context_ = { mode: "direct", atEnd: build._context_.atEnd };
                        lel.mapChildren(children, c => build.innerBuild(c, build._context_));
                    } else if (typeof children == "function") {
                        let array = live([]);
                        live(() => array.live = children());
                        build._context_ = { mode: "direct", atEnd: build._context_.atEnd };
                        lel.mapChildren(array, c => build.innerBuild(getState(c), build._context_));
                    } else {
                        let count = 0;
                        for (let i = 0; i < children.length; i++) {
                            if (typeof children[i] != "string" && !("_TEXT_" in children[i])) count++;
                        }
                        if (el.children.length != count) { // some children may be pure strings which become text nodes
                            debugger;
                            throw new Error('Cannot build(...,{mode:"bind"}) because the pre-rendered HTML does not contain the correct number of children for ' + build.stringify(what));
                        }
                        for (let i = 0; i < children.length; i++) {
                            let old = build._context_;
                            build._context_ = { mode: "bind", target: el.children[i], atEnd: build._context_.atEnd };
                            build.innerBuild(children[i], build._context_);
                            build._context_ = old;
                        }
                    }
                    break;
                case "mapChildren":
                    if (!('array' in what[prop]) || !('render' in what[prop])) {
                        throw new Error("mapChildren requires an object {array,render} ");
                    }
                    children = what[prop].array;
                    lel.mapChildren(isLive(children) ? children : live(children), c => {
                        let old = build._context_;
                        build._context_ = { mode: "direct", atEnd: build._context_.atEnd };
                        let ret = build.innerBuild(what[prop].render(c), build._context_)
                        build._context_ = old;
                        return ret;
                    });
                    break;
                case "innerText":
                case "innerHTML":
                case "value":
                case "checked":
                case "inert":
                case "selected":
                case "disabled":
                case "readonly":
                case "title":
                    if (typeof what[prop] == 'function') {
                        lel[prop] = live(what[prop]);
                    } else if (isLive(what[prop])) {
                        lel[prop] = what[prop];
                    } else {
                        lel[prop] = live(what[prop]);
                    }
                    break;
                case "style":
                    let style = (typeof what.style == "function") ? live(what.style) : what.style;
                    if (isLive(what.style)) {
                        lel[style] = what.style; // TODO check that this is working
                    } else {
                        for (let s in what.style) {
                            let v = what.style[s];
                            if (typeof v == "function") v = live(v);
                            if (isLive(v)) {
                                lel.style[s] = v;
                            } else {
                                lel.style[s] = live(v);
                            }
                        }
                    }

                    break;
                case "handle":
                    break;
                default:
                    let v = what[prop];
                    if (typeof v == "function") v = live(v);
                    if (isLive(v)) {
                        lel.setAttribute(prop, v);
                    } else {
                        lel.setAttribute(prop, live(v));
                    }
            }
        }

        return el;

    }

    build.cloneObject = (o) => {
        if (Array.isArray(o)) {
            let ret = [];
            for (let k in o) {
                ret[k] = build.cloneObject(o[k]);
            }
            return ret;
        } else if (typeof o == "object") {
            let ret = {};
            for (let k in o) {
                ret[k] = build.cloneObject(o[k]);
            }
            return ret;
        } else {
            return o;
        }
    }

    build.defaultBuilder.trace = (what, type, context) => { // creates HTML
        for (let prop in what) {
            switch (prop) {
                case "child":
                    what.child = build.innerBuild(what.child, context);
                    break;
                case "children":
                    if (isLive(what.children)) what.children = what.children.live;
                    if (typeof what.children == "function") what.children = what.children();
                    for (let i in what.children) {
                        what.children[i] = build.innerBuild(what.children[i], context);
                    }
                    break;
                case "mapChildren":
                    what.children = [];
                    let array = what.mapChildren.array;
                    if (isLive(array)) array = array.live;
                    if (typeof array == "function") array = array();
                    for (let i in array) {
                        what.children[i] = build.innerBuild(what.mapChildren.render(array[i]), context);
                    }
                    delete what.mapChildren;
                    break;
            }
        }
        what[build.getTypeKey(type)] = type;
        return what;
    }


    build.defaults = {};
    build.builders = {
        _TEXT_: (what, type, context) => {
            return build.stringBuilder(what.innerText, context);
        }
    };

    build.stringBuilder = (what, context = undefined) => {
        if (context == undefined) context = build._context_;
        if (context == undefined) throw new Error("Internal error: missing context for " + build.stringify(what));
        if (context.mode == "direct") return document.createTextNode(what);
        return what;
    }

    build.getType = (what) => {
        let key = null;
        for (let k in what) {
            if (typeof what[k] == 'symbol') {
                if (build.getTypeKey(what[k]) != k) throw new Error("Invalid Symbol: it's description should be '" + k.toLowerCase().substring(1, k.length - 1) + "'");
                return what[k];
            }
        }
        return null;
    }
    build.getTypeKey = (type) => {
        if (type == null) {
            return null;
        } else if (typeof type == "string") {
            return type;
        } else if (typeof type == "symbol") {
            return "_" + type.description.toUpperCase() + "_";
        } else if (typeof type == "object") {
            let temp = build.getType(type);
            if (temp != null) {
                return "_" + temp.description.toUpperCase() + "_";
            } else {
                return null;
            }
        } else {
            return null;
        }
    }
    build.applyDefaults = (dupe, type = null) => {
        let key = build.getTypeKey(type || dupe);
        if (key == null) throw new Error("Unknown type for " + build.stringify(dupe));
        let defaults = build.defaults;
        if (key in defaults) {
            let def = defaults[key];
            for (let k in def) {
                if (!(k in dupe)) {
                    dupe[k] = def[k];
                } else if (k == "style") {
                    for (let s in def.style) {
                        if (!(s in dupe.style)) {
                            dupe.style[s] = def.style[s];
                        }
                    }
                }
            }
        }
        return dupe;
    }
    build.stringify = (what, separator = "") => {
        let out = [];
        function loop(what) {
            if (isPureObject(what)) {
                out.push('{');
                let sep = "";
                for (let k in what) {
                    out.push(sep);
                    if (typeof what[k] == "symbol") {
                        out.push(k);
                    } else if (Array.isArray(what[k])) {
                        out.push(`"${k}":`);
                        out.push('[');
                        for (let i = 0; i < what[k].length; i++) {
                            if (i > 0) out.push(",");
                            loop(what[k][i]);
                        }
                        out.push(']');
                    } else if (typeof what[k] == "function") {
                        out.push(`"${k}":${what[k].toString()}`);
                    } else {
                        out.push(`"${k}":`);
                        loop(what[k]);
                    }
                    sep = "," + separator;
                }
                out.push("}");
            } else if ((typeof what == "function") || (typeof what == "symbol")) {
                out.push(what.toString());
            } else {
                out.push(JSON.stringify(what, null, separator));
            }
        }
        loop(what);
        return out.join("");
    }
    build.getBuilder = (dupe, type = null) => {
        if (typeof dupe == "string") return build.stringBuilder;
        let key = build.getTypeKey(type || dupe);
        if (key == null) throw new Error("Unknown type for " + build.stringify(dupe));
        let fn = (key in build.builders) ? build.builders[key] : build.defaultBuilder;
        return function (...args) {
            try {
                return fn(...args);
            } catch (e) {
                if ("shown" in e) {
                    console.error("Building " + key + ": " + build.stringify(dupe));
                } else {
                    e.shown = true;
                    console.error(e);
                }
                throw e;
            }
        }
    }
    build.build = (dupe, type = null, context) => {
        if (type == null) type = build.getType(dupe);
        if (context == undefined) context = build._context_;
        if (context == undefined) throw new Error("Internal error: missing context for " + build.stringify(what));
        if (context.mode == "trace") {
            build._context_.mode = "html";
            let d2 = build.cloneObject(dupe);
            d2[build.getTypeKey(type)] = type;
            let out = {
                src: d2,
                html: build.build(build.cloneObject(dupe), type)
            }
            build._context_.mode = "trace";
            out.tgt = build.cloneObject(build.getBuilder(dupe, type)(dupe, type, context));
            return out;
        } else {
            return build.getBuilder(dupe, type)(dupe, type, context);
        }
    }

    build.underConstruction = (dupe, type = null) => {
        if (type == null) type = build.getType(dupe);
        throw new Error(build.getTypeKey(type) + " is under construction and not yet available.");
    }

    build.addClass = (dupe, clss) => {
        if (clss == undefined) return;
        let list = (dupe.class || "").split(" ");
        list.push.apply(list, clss.split(" "));
        dupe.class = list.join(" ");
    }

    const isEqual = function () { // copied from lodash
        var e = Object.prototype.toString,
            r = Object.getPrototypeOf,
            t = Object.getOwnPropertySymbols ? function (e) {
                return Object.keys(e).concat(Object.getOwnPropertySymbols(e))
            } : Object.keys;
        return function (n, a) {
            try {
                return function n(a, c, u) {
                    var i, s, l, o = e.call(a),
                        f = e.call(c);
                    if (a === c) return !0;
                    if (null == a || null == c) return !1;
                    if (u.indexOf(a) > -1 && u.indexOf(c) > -1) return !0;
                    if (u.push(a, c), o != f) return !1;
                    if (i = t(a), s = t(c), i.length != s.length || i.some(function (e) {
                        return !n(a[e], c[e], u)
                    })) return !1;
                    switch (o.slice(8, -1)) {
                        case "Symbol":
                            return a.valueOf() == c.valueOf();
                        case "Date":
                        case "Number":
                            return +a == +c || +a != +a && +c != +c;
                        case "RegExp":
                        case "Function":
                        case "String":
                        case "Boolean":
                            return "" + a == "" + c;
                        case "Set":
                        case "Map":
                            i = a.entries(), s = c.entries();
                            do {
                                if (!n((l = i.next()).value, s.next().value, u)) return !1
                            } while (!l.done);
                            return !0;
                        case "ArrayBuffer":
                            a = new Uint8Array(a), c = new Uint8Array(c);
                        case "DataView":
                            a = new Uint8Array(a.buffer), c = new Uint8Array(c.buffer);
                        case "Float32Array":
                        case "Float64Array":
                        case "Int8Array":
                        case "Int16Array":
                        case "Int32Array":
                        case "Uint8Array":
                        case "Uint16Array":
                        case "Uint32Array":
                        case "Uint8ClampedArray":
                        case "Arguments":
                        case "Array":
                            if (a.length != c.length) return !1;
                            for (l = 0; l < a.length; l++)
                                if ((l in a || l in c) && (l in a != l in c || !n(a[l], c[l], u))) return !1;
                            return !0;
                        case "Object":
                            return n(r(a), r(c), u);
                        default:
                            return !1
                    }
                }(n, a, [])
            } catch (e) {
                console.error(e);
                debugger;
                throw e;
            }
        }
    }();

    const copyButChild = function (o) { // shallow copy but Child
        let r = {};
        for (let k in o) {
            if (k != "child" && k != "children" && k != "mapChildren") r[k] = o[k];
        }
        return r;
    }

    function simplify(src, tgt) {
        let str1 = build.stringify(src);
        let str2 = build.stringify(tgt);
        function isDual(what) {
            if (typeof what == "string") return false;
            return ("src" in what) && ("tgt" in what) && ("html" in what) && Object.keys(what).length == 3;
        }
        if (Array.isArray(src) && src.length == 1) src = src[0];
        let last = dupe(src);
        toChildren(last);
        if ((typeof last == "object") && (_BSNAVBARICONS_ in last)) debugger;
        function toChildren(other) {
            if (typeof other == "string") return other;
            if ("child" in other) {
                other.children = [other.child];
                delete other.child;
            }
            return other;
        }
        function check(other) {
            if ((typeof other == "string")) {
                if (last !== other) return "different";
                return "same";
            }
            toChildren(other);
            if (isEqual(last, other)) return "same";
            if (isEqual(copyButChild(last), copyButChild(other)) && last.children.length == other.children.length) return "children";
            return "different";
        }
        function dupe(what) {
            if (typeof what == "string") return what;
            let ret = {};
            for (let k in what) {
                if (k == "children") {
                    ret[k] = [];
                    for (let c in what[k]) {
                        if (isDual(what[k][c])) {
                            ret[k][c] = simplify(what[k][c].src, what[k][c].tgt);
                        } else {
                            ret[k][c] = [what[k][c]];
                        }
                    }
                } else {
                    ret[k] = what[k];
                }
            }
            toChildren(ret);
            return ret;
        }
        let out = [last];
        let cur = tgt;
        //            if ((typeof src != "string") && "_BSINPUT_" in src) debugger;
        while (cur && isDual(cur)) {
            switch (check(cur.src)) {
                case "same":
                    cur = cur.tgt;
                    break;
                case "children": // children should never occur at this level
                case "different":
                    last = dupe(cur.src);
                    out.push(last);
                    cur = cur.tgt;
                    break;
            }
        }
        if (cur && !isDual(cur)) {
            switch (check(cur)) {
                case "same":
                    break;
                case "different":
                    out.push(dupe(cur));
                    break;
                case "children":
                    for (let i = 0; i < last.children.length; i++) {
                        let from = last.children[i];
                        if (Array.isArray(from) && from.length == 1) from = from[0];
                        if ((typeof from == "object") && (_BSNAVBARICONS_ in from)) debugger;
                        if (isDual(from)) {
                            debugger; // should not happen
                        }
                        let to = cur.children[i];
                        if (isDual(to)) { // should be isEqual(from,to.src)==true
                            last.children[i] = simplify(from, to.tgt);
                        } else {
                            last.children[i] = simplify(from, to);
                        }
                    }
                    break;
            }
        }
        return out;
    }

    function render(trace) {
        function renderElement(def) {
            if (typeof def == "string") {
                return {
                    _TEXT_, innerText: '"' + def.replace(/"/g, '\\"') + '"'
                }
            }
            let ul = { _UL_, children: [] };
            for (let k in def) {
                if (k == "0" && def[k] == "T") debugger;
                if (typeof def[k] == "symbol") {
                    ul.children.unshift({
                        _LI_,
                        innerText: build.getTypeKey(k)
                    });
                } else if ("children" == k) {
                    let children = [];
                    ul.children.push({
                        _LI_,
                        children: [
                            { _SPAN_, "class": "key", innerText: k },
                            { _SPAN_, "class": "semicolon", innerText: ":" },
                            { _SPAN_, "class": "value", children }
                        ]
                    });
                    children.push("[");
                    for (let i in def[k]) {
                        if (i > 0) children.push(',');
                        if (Array.isArray(def[k][i])) {
                            children.push(render(def[k][i]));
                        } else {
                            children.push(render([def[k][i]]));
                        }
                    }
                    children.push("]");
                } else if (isPureObject(def[k])) {
                    ul.children.push({
                        _LI_,
                        children: [
                            { _SPAN_, "class": "key", innerText: k },
                            { _SPAN_, "class": "semicolon", innerText: ":" },
                            render([def[k]])]
                    });
                } else {
                    ul.children.push({
                        _LI_,
                        child: {
                            _BUTTON_,
                            "class": "toggleButton text",
                            listener: {
                                click(event) {
                                    let btn = event.currentTarget;
                                    let old = btn.getAttribute("data-html");
                                    if (old == null) {
                                        btn.setAttribute("data-html", btn.innerHTML);
                                        btn.innerHTML = "...";
                                    } else {
                                        btn.innerHTML = old;
                                        btn.removeAttribute("data-html");
                                    }
                                    event.stopPropagation();
                                }
                            },
                            children: [
                                { _SPAN_, "class": "key", innerText: k },
                                { _SPAN_, "class": "semicolon", innerText: ":" },
                                { _SPAN_, "class": "value", innerText: build.stringify(def[k]) }
                            ]
                        }
                    });
                }
            }
            return { _SPAN_, children: ["{", ul, "}"] };
        }
        if (trace.length == 1) {
            let out = renderElement(trace[0]);
            out["class"] = "trace";
            out.style = { fontFamily: "monospace" };
            return out;
        } else if (trace.length > 0) {
            let multiple = [];
            let out = {
                _TABLE_, "class": "trace", child: {
                    _TBODY_,
                    child: {
                        _TR_,
                        children: multiple
                    }
                }, style: { fontFamily: "monospace" }
            }
            let handles = [];
            for (let i = 0; i < trace.length - 1; i++) {
                let handle = live(null);
                handles.push(handle);
                multiple.push({
                    _TD_,
                    handle,
                    child: {
                        _BUTTON_,
                        "class": "toggleButton",
                        "style": { textAlign: "left" },
                        listener: {
                            click(event) {
                                let nextDisplayed = handles[i + 1].style.display.live != "none";
                                if (nextDisplayed) {
                                    for (let j = i + 1; j < trace.length; j++) {
                                        handles[j].style.display.live = "none";
                                    }
                                } else {
                                    handles[i + 1].style.display.live = "table-cell";
                                }
                                event.stopPropagation();
                            }
                        },
                        child: renderElement(trace[i])
                    },
                    style: { display: i == 0 ? "table-cell" : "none" }
                });
            }
            if (trace.length > 0) {
                let handle = live(null);
                handles.push(handle);
                multiple.push({
                    _TD_,
                    handle,
                    child: renderElement(trace[trace.length - 1]),
                    style: { display: trace.length == 1 ? "table-cell" : "none" }
                });
            }
            return out;
        } else {
            return "";
        }
    }

    build.traceToModel = render;

    return build;
})();

