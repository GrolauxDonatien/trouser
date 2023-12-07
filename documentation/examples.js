const { live, internal, loggerConfig } = require('../examples/live.js');
/*
let v1=live(5);
let v2=live(7);
let fn=live(()=>v1.live+v2.live);
console.log(fn.live());    // outputs 12
v1.live=7;
console.log(fn.live());    // outputs 14
*/

/*
let v1=live(true);
let v2=live(1);
let fn=live(()=>v1.live?0:v2.live);
console.log(fn.live()); // returns 0;
v2.live=2;
console.log(fn.live()); // returns 0;
v1.live=false;
console.log(fn.live()); // returns 2;
v2.live=3;
console.log(fn.live()); // returns 3;
*/

loggerConfig.propagation=true;

let v1=live(true);
let v2=live(1);
let fn1=live(()=>v1.live?0:fn2.live()+1);  // for now, fn1 depends on v1
let fn2=live(()=>v1.live?0:v2.live+1);     // for now, fn2 depends on v1
// for now, the propagation is in the order of the declaration: fn1 then fn2
console.log(fn1.live()); // returns 0;
v2.live=2;
console.log(fn1.live()); // returns 0;
v1.live=false;  // fn1 now also depends on fn2, and fn2 on v2
// now the correct propagation order becomes fn2 first, then fn1
console.log(fn1.live()); // returns 4;
v2.live=3;
console.log(fn1.live()); // returns 5;


let i=live(document.getElementById("myInput"));
let m=live(document.getElementById("myMessage"));
m.innerHTML=i.innerHTML;

