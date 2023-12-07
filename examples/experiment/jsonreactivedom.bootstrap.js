build.defaults._BUTTON_ = { class: "btn btn-secondary" };
build.defaults._BSINPUT_ = { class: "mb-3" };

const _BSARTICLE_ = Symbol('article');
const _BSINPUT_ = Symbol('bsinput');
const _BSTEXTAREA_ = Symbol('bstextarea');
const _BSSELECT_ = Symbol('bsselect');
const _BSRADIOS_ = Symbol('bsradios');
const _BSHEADER_ = Symbol('bsheader');
const _BSNAVBARICONS_ = Symbol('bsnavbaricons');
const _BSSIDEBAR_ = Symbol('bssidebar');
const _BSMENU_ = Symbol('bsmenu');
const _BSPAGE_ = Symbol('bspage');
const _BSHTML_ = Symbol('bshtml');

build.builders._BSARTICLE_ = (what) => {
    delete what._BSARTICLE_;
    what._ARTICLE_ = _ARTICLE_;
    let left = what.left || [];
    let right = what.right || [];
    delete what.left;
    delete what.right;
    what.class = "my-3";
    what.children = [
        {
            _DIV_,
            class: "bd-heading sticky-xl-top align-self-start mt-5 mb-3 mt-xl-0 mb-xl-2",
            children: left
        },
        {
            _DIV_,
            class: "mb-3",
            children: right
        }
    ]
    return build(what);
}

function bsforminput(t1) {
    const type = t1;
    return (what) => {
        what[build.getTypeKey(type)] = type; // set type of what to target type
        if (!("handle" in what)) what.handle = live(null); // ensure we have a handle
        let error = null;
        let check = (type == _INPUT_ && what.type == "checkbox");
        let out = {
            children: []
        };
        if ("class" in what) {
            out.class = what.class;
        }
        what.class = check ? "form-check-input" : "form-control";
        if ("error" in what) { // what.error is a function that returns {none:""},{valid:""} or {invalid:""}
            const whaterror = what.error;
            let errorfn = () => whaterror(what.handle);
            delete what.error;
            switch (what.errorTrigger || 'change') {
                case "live":
                    error = {
                        _DIV_,
                        class() {
                            let e = errorfn();
                            if ("valid" in e) { return "valid-feedback" }
                            if ("invalid" in e) { return "invalid-feedback" }
                            return "";
                        },
                        style: {
                            display() {
                                let e = errorfn();
                                if ("valid" in e) { return "block" }
                                if ("invalid" in e) { return "block" }
                                return "none";
                            }
                        },
                        innerText() {
                            let e = errorfn();
                            if ("valid" in e) { return e.valid }
                            if ("invalid" in e) { return e.invalid }
                            return "";
                        }
                    };
                    what.class = (v) => {
                        let e = errorfn();
                        if ("valid" in e) { return "form-control is-valid" }
                        if ("invalid" in e) { return "form-control is-invalid" }
                        return "form-control";
                    }
                    break;
                case "explicit":
                case "change":
                    let e = live({ "none": "" });
                    error = {
                        _DIV_,
                        class() {
                            if ("valid" in e.live) { return "valid-feedback" }
                            if ("invalid" in e.live) { return "invalid-feedback" }
                            return "";
                        },
                        style: {
                            display() {
                                if ("valid" in e.live) { return "block" }
                                if ("invalid" in e.live) { return "block" }
                                return "none";
                            }
                        },
                        innerText() {
                            if ("valid" in e.live) { return e.live.valid }
                            if ("invalid" in e.live) { return e.live.invalid }
                            return "";
                        }
                    };
                    what.class = (v) => {
                        if ("valid" in e.live) { return "form-control is-valid" }
                        if ("invalid" in e.live) { return "form-control is-invalid" }
                        return "form-control";
                    }
                    // build.running delays 
                    build._context_.atEnd.push(() => {
                        what.handle.live.validate = () => {
                            e.live = errorfn();
                        }
                    });
                    if (what.errorTrigger != "explicit") { // register change listener
                        if (!("listener" in what)) {
                            what.listener = {};
                        }
                        if (!("change" in what.listener)) {
                            what.listener.change = () => what.handle.live.validate()
                        } else {
                            if (Array.isArray(what.listener.change)) {
                                what.listener.change.unshift(() => what.handle.live.validate());
                            } else {
                                what.listener.change = [() => what.handle.live.validate(), what.listener.change];
                            }
                        }
                    }
                    break;

            }
            delete what.errorTrigger;
        }
        if (type == _INPUT_ && what.type == "radio") {
            throw new Error("Do not use _BSINPUT_ with radio type, instead use _BSRADIOS_");
        }
        if ("legend" in what) {
            out.children.push({
                _LEGEND_,
                innerText: what.legend
            });
            delete what.legend;
        }
        let label = null;
        if ("label" in what) {
            label = {
                _LABEL_,
                class: check ? "form-check-label" : "form-label",
                innerText: what.label
            };
            delete what.label;
        }
        if (!check && label !== null) {
            out.children.push(label);
        }
        if (("prepend" in what) || ("append" in what)) {
            let children = [];
            if ("prepend" in what) {
                children.push({
                    _SPAN_,
                    class: "input-group-text",
                    innerText: what.prepend
                });
            }
            children.push(what);
            if ("append" in what) {
                children.push({
                    _SPAN_,
                    class: "input-group-text",
                    innerText: what.append
                });
            }
            if (error !== null) children.push(error);
            out.children.push({
                _DIV_,
                class: "input-group",
                children
            })
        } else {
            out.children.push(what);
            if (error !== null) out.children.push(error);
        }
        if (check && label !== null) {
            out.children.push(label);
        }
        if ("help" in what) {
            out.children.push({
                _DIV_,
                class: "form-text",
                innerText: what.help
            });
            delete what.help;
        }
        if (check) {
            if ("class" in out) {
                out.class += " form-check form-switch";
            } else {
                out.class = "form-check form-switch";
            }
            what.role = "switch";
        }
        if (type == _INPUT_ && what.type == "range") {
            if ("class" in what) {
                what.class += " form-range";
            } else {
                what.class = "form-range";
            }
        }
        if (type == _SELECT_) {
            if ("children" in what || !("options" in what)) {
                throw new Error("Do not use _BSSELECT_ with _OPTIONS_ children, instead use option:{key:value,...}");
            }
            let options = what.options;
            delete what.options;
            what.children = [];
            let value = ("value" in what) ? (isLive(what.value) ? what.value.live : what.value) : null;
            for (let k in options) {
                let option = {
                    _OPTION_,
                    value: k,
                    innerText: options[k]
                }
                if (k == value) {
                    option.selected = "selected";
                }
                what.children.push(option);
            }
            if ("class" in what) {
                what.class += " form-select form-select-lg";
            } else {
                what.class = "form-select form-select-lg";
            }
        }
        return build.build(out, _DIV_);
    }
}

build.builders._BSINPUT_ = bsforminput(_INPUT_);
build.builders._BSTEXTAREA_ = bsforminput(_TEXTAREA_);
build.builders._BSSELECT_ = bsforminput(_SELECT_);
build.builders._BSRADIOS_ = build.underConstruction;

build.builders._BSHEADER_ = (what) => {
    let out = {
        children: [],
        class: "navbar sticky-top bg-dark flex-md-nowrap p-0 shadow"
    };

    if ("class" in what) {
        out.class += " " + what.class;
        delete what.class;
    }

    if ("left" in what) {
        for (let i = 0; i < what.left.length; i++) {
            let c = what.left[i];
            build.addClass(c, "navbar-brand col-md-3 col-lg-2 me-0 px-3 fs-6 text-white");
            out.children.push(c);
        }
        delete what.left;
    }

    if ("center" in what) {
        delete what.center;
    }
    if ("search" in what) {
        out.children.push({
            _DIV_,
            id: "navbarSearch",
            class: "navbar-search w-100 collapse",
            child: {
                _INPUT_,
                class: "form-control w-100 rounder-0 border-0",
                type: "text",
                placeholder: "Search",
                "aria-label": "Search",
                listener: { change: what.search }
            }
        })
    }
    if (("right" in what) || ("search" in what) || what.sidebarToggle === true) {
        let span = {
            _SPAN_,
            class: "navbar-nav flex-row",
            children: []
        };
        out.children.push(span);
        if ("right" in what) {
            span.children.push.apply(span.children, what.right);
            delete what.right;
        }
        let icons = [];
        if ("search" in what) {
            icons.push({
                innerHTML: "&#128269;&#xFE0E;",
                style: {
                    "font-family": "initial"
                },
                "data-bs-toggle": 'collapse',
                "data-bs-target": "#navbarSearch",
                "aria-controls": "navbarSearch",
                "aria-expanded": "true",
                "aria-label": "Toggle search"
            })
            delete what.search;
        }
        if (what.sidebarToggle === true) {
            icons.push({
                innerHTML: "&#9776;",
                pclass: "d-md-none",
                style: {
                    "font-family": "initial"
                },
                "data-bs-toggle": "offcanvas",
                "data-bs-target": '#sidebarMenu',
                "aria-controls": "sidebarMenu",
                "aria-expanded": "false",
                "aria-label": "Toggle navigation"
            })
            delete what.sidebarToggle;
        }
        if (icons.length > 0) {
            span.children.push({
                _BSNAVBARICONS_,
                icons
            })
        }
    }
    return build.build(out, _HEADER_);
}

build.builders._BSNAVBARICONS_ = (what) => {
    let out = {
        class: "mb-0 flex-row navbar-nav",
        children: []
    }
    for (let i = 0; i < what.icons.length; i++) {
        let icon = what.icons[i];
        if (build.getTypeKey(icon) == null) {
            icon._BUTTON_ = _BUTTON_;
            icon.type = "button";
        }
        build.addClass(icon, "nav-link px-3 text-white bg-transparent border-0");
        let li = {
            _LI_,
            class: "nav-item text-nowrap",
            child: icon
        };
        build.addClass(li, icon.pclass);
        delete icon.pclass;
        out.children.push(li);
    }
    return build.build(out, _UL_);
}

build.builders._BSSIDEBAR_ = (what) => {
    let out = {
        class: "sidebar border border-right col-md-3 col-lg-2 p-0 bg-body-tertiary",
        child: {
            _DIV_,
            class: "offcanvas-md offcanvas-end bg-body-tertiary",
            tabindex: -1,
            id: "sidebarMenu",
            "aria-labelledby": "sidebarMenuLabel",
            children: []
        }
    }
    build.addClass(out, what.class);
    if ("label" in what) {
        out.child.children.push({
            _DIV_,
            class: "offcanvas-header",
            children: [{
                _DIV_,
                class: "offcanvas-title",
                id: "sidebarMenuLabel",
                children: [
                    { _H5_, child: what.label }
                ]
            }, {
                _BUTTON_,
                type: "button", class: "btn-close", "data-bs-dismiss": "offcanvas",
                "data-bs-target": "#sidebarMenu", "aria-label": "Close"
            }]
        });
    }
    if ("children" in what) {
        out.child.children.push({
            _DIV_,
            class: "offcanvas-body d-md-flex flex-column p-0 pt-lg-3 overflow-y-auto",
            children: what.children
        }
        );
    }
    return build.build(out, _DIV_);
}

build.builders._BSMENU_ = (what) => {
    let out = {
        class: "nav flex-column",
        children: []
    }
    if (what.children) for (let i = 0; i < what.children.length; i++) {
        let c = what.children[i];
        if (build.getTypeKey(c) == null) {
            c._A_ = _A_;
        }
        build.addClass(c, "nav-link d-flex align-items-center gap-2");
        out.children.push(c);
    }
    return build.build(out, _UL_);
}

build.builders._BSPAGE_ = (what) => {
    let out = {
        class: "col-md-9 ms-sm-auto col-lg-10 px-md-4",
        children: []
    };
    if ("title" in what) {
        let title = {
            _DIV_,
            class: "d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom",
            children: []
        }
        if (typeof what.title == "string") {
            title.children.push({
                _H1_,
                class: "h2",
                innerText: what.title
            });
        } else {
            title.children.push(what.title);
        }
        out.children.push(title);
        delete what.title;
    }
    if ("child" in what) {
        out.children.push(what.child);
    } else if ("children" in what) {
        out.children.push.apply(out.children, what.children);
    }
    return build.build(out, _MAIN_);
}

build.builders._BSHTML_ = (what) => {
    let out = {
        children: []
    };

    let bsheader = {
        _BSHEADER_,
        left: [{
            _A_,
            innerText: what.pageTitle || "",
            href: "#"
        }],
    };
    if ("search" in what) {
        bsheader.search = what.search;
    }
    out.children.push(bsheader);
    let content = [];
    let div = {
        _DIV_,
        class: "container-fluid",
        child: {
            _DIV_,
            class: "row",
            children: content
        }
    }
    out.children.push(div);
    if ("menu" in what) {
        bsheader.sidebarToggle = true;
        for (let k in what.menu) {
            content.push({
                _BSSIDEBAR_,
                label: k,
                children: [{ _BSMENU_, children: what.menu[k] }]
            })
        }
    }

    if ("page" in what) {
        what.page._BSPAGE_ = _BSPAGE_;
        content.push(what.page);
    }
    return build.build(out, _DIV_);
}