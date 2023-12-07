const { live, internal } = require('../examples/live.js');
const { assert, expect, should } = require("chai");

describe('Variables', function () {
  it('Object.keys', function () {
    let a0 = live(0);
    expect(Object.keys(a0)).to.eql(["live"]);
  });

  it('JSON.stringify', function () {
    let a0 = live(0);
    expect(JSON.stringify(a0)).to.eql('{"live":0}');
  });

  it('Assign through different live types', function () {
    let a1 = live(0);
    let fn1 = live(() => a1.live);
    let gather = [];
    fn1.addChangeListener(() => { gather.push(fn1.live()) });

    a1.live=1;
    expect(gather).to.eql([1]);
    gather.splice(0);
    a1.live="Test";
    expect(gather).to.eql(["Test"]);
    gather.splice(0);
    a1[internal];
    a1.live={test:"hello"};
    expect(JSON.stringify(gather)).to.equal('[{"test":"hello"}]');
    a1.live.test="hello2";
    expect(JSON.stringify(gather)).to.eql('[{"test":"hello2"},{"test":"hello2"}]');
    gather.splice(0);
    a1.live=["a","b","c"];
    expect(JSON.stringify(gather)).to.equal('[["a","b","c"]]');
    a1.live.push("d");
    expect(JSON.stringify(gather)).to.equal('[["a","b","c","d"],["a","b","c","d"]]');
    gather.splice(0);
    a1.live=()=>{return 5;}
    expect(typeof gather[0]).to.equal("function");
    expect(a1.live()).to.equal(5);
    gather.splice(0);
    a1.live=1;
    expect(gather).to.eql([1]);
  });

  it('Generic object support', function() {
    let a1=live(new Date());
    let gather = [];
    a1.addChangeListener(()=>{gather.push(a1.live.valueOf());});
    a1.live.setTime(0);
    expect(gather).to.eql([0]);
  });

  
  it('Weird ones', function() {
    let a1=live(true);
    let fn1=live(()=>a1.live?"ok":fn2.live());
    let fn2=live(()=>a1.live?"ok":fn1.live());
    a1.live=false;
    expect(fn1).to.throw;
    expect(fn2).to.throw;
  });

  it('Map', function() {
    let a1=live(new Map());
    expect(a1.live.size).to.eql(0);
    let fn1=live(()=>a1.live.size);
    a1.live.set("a","a");
    a1.live.set(1,"b");
    expect(a1.live.size).to.eql(2);
    expect(fn1.live()).to.eql(2);
    expect(a1.live.get(1)).to.eql("b");
  });


  it('Set', function() {
    let a1=live(new Set());
    a1.live.size;
    let fn1=live(()=>a1.live.size);
    a1.live.add("a");
    a1.live.add(1);
    a1.live.delete("a");
    expect(a1.live.size).to.eql(1);
    expect(fn1.live()).to.eql(1);
    expect(a1.live.has(1)).to.eql(true);
  });

});

describe('Functions', function () {

  it('Simple dependency propagation', function () {
    let gather = [];
    let a0 = live(0);
    let fn1 = live(() => { return a0.live == 0 ? true : false });
    fn1.addChangeListener(() => {
      gather.push(fn1.live());
    });
    a0.live = 1;
    a0.live = 0;
    a0.live = 2;
    expect(gather).to.eql([false, true, false]);
  });

  it('Propagation with livemically changing dependencies', function () {
    let gather = [];
    let a0 = live(0);
    let a1 = live(4);
    let fn2 = live(() => {
      if (a0.live == 0) return 0;
      return a1.live;
    })
    fn2.addChangeListener(() => {
      gather.push(fn2.live());
    });
    a0.live = 1;
    a1.live = 3;
    a0.live = 0;
    expect(gather).to.eql([4, 3, 0]);
  });

  it('Propagation with livemically changing otherwise circular dependencies', function () {
    let gather = [];
    let a0 = live(0);
    let fn1 = live(() => { return a0.live == 0 ? 0 : fn2.live() });
    fn1.addChangeListener(() => {
      gather.push(fn1.live() + "<" + fn2.live());
    })
    let fn2 = live(() => { return a0.live + 1 });
    fn2.addChangeListener(() => {
      gather.push(fn1.live() + ">" + fn2.live());
    })
    gather.push(fn1.live() + "=" + fn2.live()); // at first 0=1
    a0.live = 1;
    a0.live = 2;
    a0.live = 0;
    a0.live = 3;
    expect(gather).to.eql(['0=1', '2<2', '2>2', '3<3', '3>3', '0<1', '0>1', '4<4', '4>4']);
  });

  it('Recursion', function () {
    let a0 = live(0);
    let fn1 = live(() => {
      if (a0.live > 0) {
        a0.live--;
        return fn1.live();
      } else {
        return 0;
      }
    });

    a0.live = 5;
    expect(fn1.live()).to.equal(0);
  });

  it('Infinite recursion and exceptions', function () {
    let a0 = live(0);
    let fn1 = live(() => {
      if (a0.live > 0) {
        fn1.live();
      } else {
        return 0;
      }
    });

    a0.live = 1;
    expect(fn1.live).to.throw();

    a0.live = 0;
    expect(fn1.live).to.not.throw();
  });

  it('Dynamically otherwise circular dependencies', function () {
    let a0 = live(true);
    let fn1 = live(() => a0.live ? "fn1a0" : `fn2=${fn2.live()}`);
    let fn2 = live(() => a0.live ? `fn1=${fn1.live()}` : "fn2a0");

    expect(fn1.live()).to.equal("fn1a0");
    expect(fn2.live()).to.equal("fn1=fn1a0");
    a0.live = false;
    expect(fn1.live()).to.equal("fn2=fn2a0");
    expect(fn2.live()).to.equal("fn2a0");
  });

  it('Circular references and exceptions', function () {
    let a0 = live(true);
    let fn1 = live(() => {
      return a0.live ? "fn1a0" : `fn2=${fn2.live()}`
    });
    let fn2 = live(() => fn1.live() + "toto");

    expect(fn1.live()).to.equal("fn1a0");
    expect(fn2.live()).to.equal("fn1a0toto");
    a0.live = false;
    expect(fn1.live).to.throw;
    expect(fn2.live).to.throw;
  });


  it('Further propagation', function () {
    let a1 = live(0);
    let fn2 = live(() => { return a1.live + 1 });
    let fn3 = live(() => { return a1.live + fn2.live() });
    let fn4 = live(() => { return fn2.live() + fn3.live() });
    let fn5 = live(() => { return fn3.live() + fn4.live() });
    let fn6 = live(() => { return fn5.live() + fn4.live() + fn3.live() + fn2.live() });

    a1.live = 5;
    expect(fn2.live()).to.equal(6);
    expect(fn3.live()).to.equal(11);
    expect(fn4.live()).to.equal(17);
    expect(fn5.live()).to.equal(28);
  });

  it('Reassignment', function () {
    let o = live(0);
    let gather = [];
    let fn = live(() => o.live);
    fn.addChangeListener(() => { gather.push(fn.live()) });
    expect(o.live).to.equal(0);
    o.live = 1;
    expect(o.live).to.equal(1);
    o.live = "Hello";
    expect(o.live).to.equal("Hello");
    o.live = undefined;
    expect(o.live).to.equal(undefined);
    o.live = null;
    expect(o.live).to.equal(null);
    expect(gather).to.eql([1, "Hello", undefined, null]);

    /*    o.live=[];
        expect(o.live).to.equal([]);*/
  });

  it('Pure objects', function () {
    let a1 = live({});
    let gather = [];
    a1.addChangeListener((details) => {
      gather.push(JSON.stringify(details));
    });

    a1.live.toto = "yes";
    expect(JSON.stringify(a1.live)).to.equal('{"toto":"yes"}');
    a1.live.tutu = "no";
    expect(JSON.stringify(a1.live)).to.equal('{"toto":"yes","tutu":"no"}');
    delete a1.live.toto;

    expect(JSON.stringify(a1.live)).to.equal('{"tutu":"no"}');

    expect(gather).to.eql(['{"type":"pureObject","key":"toto","new":"yes"}', '{"type":"pureObject","key":"tutu","new":"no"}', '{"type":"pureObject","key":"toto","old":"yes"}']);
  });

  it('Array', function () {
    let a1 = live([]);
    let gather = [];
    a1.addChangeListener((details) => {
      gather.push(JSON.stringify(details));
    });

    a1.live.push("1")
    expect(JSON.stringify(a1.live)).to.equal('["1"]');
    a1.live[1] = "no";
    expect(JSON.stringify(a1.live)).to.equal('["1","no"]');
    a1.live.splice(0, 1);

    expect(JSON.stringify(a1.live)).to.equal('["no"]');

    a1.live[3] = "now?";
    expect(JSON.stringify(a1.live)).to.equal('["no",null,null,"now?"]');

    delete a1.live[0];

    expect(gather.join(',')).to.equal('{"type":"array","function":"push","operations":[{"type":"add","index":0,"value":"1"}]},{"type":"array","function":"index","operations":[{"type":"add","index":1,"value":"no"}]},{"type":"array","function":"splice","operations":[{"type":"remove","index":0}]},{"type":"array","function":"index","operations":[{"type":"add","index":1},{"type":"add","index":2},{"type":"add","index":3,"value":"now?"}]},{"type":"array","function":"delete","operations":[{"type":"remove","index":0}]}');
  });


});