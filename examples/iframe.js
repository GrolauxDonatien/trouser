if (window.parent) {
    let body=document.body.innerHTML; // capture body right now
    window.addEventListener("load",()=>{
        let scr='';
        for(let i=0; i<document.scripts.length; i++) {
            scr=document.scripts[i].innerHTML;
            if (scr.length>0) break;
        }
        window.parent.postMessage({
            body,
            script: scr
        }, "*");    
    });
}
