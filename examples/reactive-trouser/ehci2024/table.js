const _GRID_ = Symbol('grid');
const _COLSPAN_ = Symbol('');
const _ROWSPAN_ = Symbol('');

function map(src, fn) {
    if (Array.isArray(src)) {
        return src.map(fn);
    } else if (typeof src == 'function') {
        return map(live(src), fn);
    } else if (build.isLive(src) || ((typeof src == "object") && ("live" in src))) {
        if (typeof src.live == 'function') {
            return map(src.live(), fn);
        } else {
            return map(src.live, fn);
        }
    } else if ((typeof src == "object") && ("array" in src)) {
        return map(src.array, (item, idx) => { return src.render(item, idx) });
    } else {
        throw new Error("Unsupported data source: " + src);
    }
}

function fixtr(children) {
    for (let i = children.length - 1; i >= 0; i--) {
        if (children[i].child == _ROWSPAN_) {
            if (i > 0) {
                children[i - 1].rowspan = (children[i].rowspan || 1) + 1;
                children.splice(i, 1);
            } else {
                throw new Error("Cannot _ROWSPAN_ the first item of a line");
            }
        } else if (children[i].child == _COLSPAN_) {
            if (i > 0) {
                children[i - 1].colspan = (children[i].colspan || 1) + 1;
                children.splice(i, 1);
            } else {
                throw new Error("Cannot _COLSPAN_ the first item of a column");
            }
        }
    }
    return children;
}

function fix(trs) {
    // do not delete immediately, so as the keep the 2D structure intact
    for (let l = trs.length - 1; l >= 0; l--) {
        for (let c = trs[l].children.length - 1; c >= 0; c--) {
            if (trs[l].children[c].child==_ROWSPAN_) {
                if (l>0) {
                    trs[l-1].children[c].rowspan=(trs[l].children[c].rowspan||1)+1;
                    trs[l].children[c].remove=true;
                } else {
                    throw new Error("Cannot _ROWSPAN_ the first item of a line");
                }
            } else if (trs[l].children[c].child==_COLSPAN_) {
                if (c>0) {
                    trs[l].children[c-1].colspan=(trs[l].children[c].colspan||1)+1;
                    trs[l].children[c].remove=true;
                } else {
                    throw new Error("Cannot _COLSPAN_ the first item of a column");
                }
            }
        }
    }
    // check up if rowspan & colspan deletes something that should stay there
    for(let l=0; l<trs.length; l++) {
        for(let c=0; c<trs[l].children.length; c++) {
            let rs=trs[l].children[c].rowspan||1;
            let cs=trs[l].children[c].colspan||1;
            for(let l2=l+1; l2<l+cs; l2++) {
                for(let c2=c+1; c2<c+rs; c2++) {
                    if (trs[l2].children[c2].remove!==true) {
                        throw new Error("Cannot satisfy _ROWSPAN_ and _COLSPAN_ as it would delete non empty cells");
                    }
                }    
            }
        }
    }
    // delete elements
    for(let l=0; l<trs.length; l++) {
        for(let c=trs[l].children.length-1; c>=0; c--) {
            if (trs[l].children[c].remove===true) {
                trs[l].children.splice(c,1);
            }
        }
    }
    return trs;
}

build.builders._GRID_ = (model) => {
    model.children = [];
    let vheader = model.vheader || null;
    if ("header" in model) {
        let header = model.header;
        model.children.push({
            _THEAD_,
            child: {
                _TR_,
                children() {
                    let th = map(header, item => { return { _TH_, child: item } })
                    if (vheader != null) { // extra room for the vertical header
                        th.unshift({ _TH_ }); // adds an empty th at beginning to leave room for vheader
                    }
                    return fixtr(th);
                }
            }
        });
    }
    if ("body" in model) {
        let body = model.body;
        if (vheader != null) {
            model.children.push({
                _TBODY_,
                children() {
                    let vheaders = map(vheader, item => { return { _TH_, child: item } });
                    return fix(map(body, (line, idx) => {
                        let tr = {
                            _TR_,
                            children: map(line, item => { return { _TD_, child: item } })
                        }
                        tr.children.unshift(vheaders[idx]);
                        return tr;
                    }));
                }
            })
        } else {
            model.children.push({
                _TBODY_,
                children() {
                    return fix(map(body, (line, idx) => {
                        return {
                            _TR_,
                            children: map(line, item => { return { _TD_, child: item } })
                        }
                    }));
                }
            })
        }
    }
    if ("footer" in model) {
        let footer = model.footer;
        model.children.push({
            _TFOOT_,
            child: {
                _TR_,
                children() {
                    let th = map(footer, item => { return { _TH_, child: item } })
                    if (vheader != null) { // extra room for the vertical header
                        th.unshift({ _TH_ }); // adds an empty th at beginning to leave room for vheader
                    }
                    return fixtr(th);
                }
            }
        });
    }
    // remove was we already handled
    delete model.header;
    delete model.vheader;
    delete model.body;
    delete model.footer;
    return build.build(model, _TABLE_);
}