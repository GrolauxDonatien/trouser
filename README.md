# JavaScriptLive

JavascriptLive introduces a lightweight reactive programming capability to JavaScript.
When designing an interactive user interface, with bare JS, the front-end needs to listen to all relevant events and push updates to the DOM. For an interface depending on many events, there exists many events listeners that update the interface, which spreads its logic around the code making it hard to design, think about, and maintain.
With a live DOM entity, you write once how this entity is updated, depending on an arbitrary number of other live objects. Event listeners update the other live objects instead of the DOM itself. The code can now be factored in a more direct, descriptive centralized way, greatly simplifying the design of the front-end.
This process of designs originate from the Functional Reactive Programming (FRP) paradigm. FRP has being around a while, but the paradigm shift required makes its adoption harder. By design, JavaScriptLive proposes a simpler transition from bare JavaScript to reactive programming.

Here is an example of a form validation:
        `<input type="text" name="in1">`
`        <input type="radio" name="radio" value="1">`
`        <input type="radio" name="radio" value="2">`
`        <input type="radio" name="radio" value="3">`
`        <input type="radio" name="radio" value="4" checked>`
`        <input type="checkbox" name="checkbox">`
`        <select name="selectsingle">`
`            <option value="1">1</option>`
`            <option value="2">2</option>`
`            <option value="3">3</option>`
`            <option value="4">4</option>`
`        </select>`
`        <select name="selectmultiple" multiple>`
`            <option value="1">1</option>`
`            <option value="2">2</option>`
`            <option value="3">3</option>`
`            <option value="4">4</option>`
`        </select>`
`        <textarea name="ta"></textarea>`
`        <div id="errors"></div>`

With bare JavaScript, for each input, a change listener must be put in place that computes the message for the errors div.
With JavaScriptLive, we do this:
        `let form = live(document.getElementsByTagName("form")[0]);`
`        let data = form.serializeObject;`
`        let errors=live(document.getElementById("errors"));`
`        errors.innerHTML=live(()=>{`
`            if (data.in1=="") return "Please, fill the text in";`
`            if (data.radio!="2") return "Please, tick the second radio button";`
`            if (!data.checkbox) return "Please, tick the checkbox";`
`            if (data.selectsingle==null) return "Please, select an option";`
`            if (data.ta=="") return "Please, fill the text area in";`
`            return "";`
`        });`
`        errors.style.display=live(()=>errors.innerHTML.live==""?"none":"block");`

The live() function serves as a lifting operator to obtain the live version of a function, DOM element, or variable.
In this example, we first get the live version of the form HTMLElement. This live object is pretty similar to the bare HTMLElement, however its properties are also automatically lifted to live versions.
The serializeObject is a convenience object that serializes the content of the interactive fields of the form to a JavaScript object. This is also a live object: it will reflect the changes of the user's inputs and even the DOM modifications automatically.
By setting the innerHTML property of the live errors div to a live function, we ensure that it always reflects the evaluation on the live function with respect to its live dependencies. In this code, the live dependency of the function is the serializeObject data. In other words, each time the user interacts with the form, or each time the DOM of the form is modified, the function is evaluated again, and the innerHTML of the errors div is updated accordingly!
The last line set the live CSS display property of the errors div to "none" or "block" depending if it currently displays text or not.

This example illustrates the design philosophy behind JavaScriptLive: we stay as close as possible to bare JavaScript and the usual DOM operations, just introducing a live operator to denote behavior that evolves over time. This simple change allows shifting from a pure event-based approach where the focus is the event itself to a more declarative approach where the focus is the computation of the wished result.

Documentation:
The live(something) function returns the live version of its parameter. To access or change its current value, use the live property.
Example:
let myvar = live(0);
myvar.live=1;
console.log(myvar.live);

Live objects also have the addChangeListener property that allows listening to live changes. When a live object is updated, it may trigger a cascade of updates in other live objects. Callbacks of addChangeListener are guaranteed to be called after the propagation of updates is fully complete. In other words, if you have several addChangeListener defined on different live objects, the system guarantees that when they are fired, they all get the same values for all live objects.

Example:
let myvar = live(0);
myvar.addChangeListener(()=>{console.log(myvar.live);})
myvar.live=1;

Live functions are particularly useful: they allow live computation on live objects.

Example:
let myvar1 = live(0);
let myvar2 = live(1);
let myfunc=live(()=>myvar1.live+myvar2.live);
myfunc.addChangeListener(()=>{console.log(myfunc.live());})
console.log(myfunc.live()) // outputs 1
myvar1.live=1 // outputs 2
myvar2.live=2 // outputs 3

**Important:** for live functions to work correctly, some restrictions apply:

1. A live function must be a zero parameter function.
2. A live function can only have closures over live objects, i.e. depend on live objects only. If a live function has a closure over something else, the live system will not be able to manage this dependency and update the function computation accordingly. Note that as a live function is indeed also a live object, live functions can call each other.
3. A live function is not called when invoked (by function.live()). Instead, it is called during the propagation of live updates, and the result is cached; the cached result is what is returned when the function is invoked.
4. A live function may yield an exception. During the propagation of live updates, dependents of live functions may be unable to update correctly because of the exception. From the perspective of the application, the exception is triggered when the function is invoked, event though the real invocation of the function was performed before, during the propagation of live updates.
5. A live function may change its dependencies during the course of its life, and the propagation of updates will take the change into account accordingly. However, a change of dependency may result in a glitch where a live function is called several times during the same propagation: when the system detects a dependency change, it may make the function call invalid at that time because it now depends on something else not yet updated. Consequently, the function must be called a second time to ensure the correct result.
6. A live function can use recursion, which works as usual.
7. A live function may update a live object. Beware that if the live function also depends on this live object, it becomes very easy to introduce an unfortunate recursion where the function needs to be called in reaction to a live change that it triggers itself, resulting in a stack overflow error.


Live HTMLElement are where the benefits of JavaScriptLive are. They allow linking their dynamic properties to live elements, which are updated automatically. By linking a property of a live HTMLElement to a live function depending on one or more live values, we obtain a pipeline where:
\- the live values are the source of information;
\- the live function transforms the bare information into an HTML consumable representation;
\- the live HTMLElement property is updated accordingly automatically;

Example:

    `<button id="but1">Toggle List</button>`
`    <button id="but2">Push Number</button>`
`    <button id="but3">Pop Number</button>`
`    <button id="but4">Reverse List</button>`
`    <ul id="list">`
`    </ul>`
`    <p id="hidden">List is not empty, but hidden.</p>`
`    <p id="empty">List is empty.</p>`
`    <p id="count"></p>`

        `let list = live([1, 2, 3]);`
`        let show = live(true);`
`        document.getElementById("but1").addEventListener("click", () => { show.live = !show.live });`
`        document.getElementById("but2").addEventListener("click", () => { list.live.push(list.live.length + 1) });`
`        document.getElementById("but3").addEventListener("click", () => { list.live.pop() });`
`        document.getElementById("but4").addEventListener("click", () => { list.live.reverse() });`

<br>
`        let listEl = live(document.getElementById("list"));`

<br>
`        listEl.mapChildren(`
`            list,`
`            "<li></li>",`
`            (item, el) => {`
`                el.innerHTML = item;`
`            }`
`        )`

<br>
`        live(document.getElementById("count")).innerHTML=live(()=>listEl.children.length+" element(s)");`
`        live(document.getElementById("hidden")).style.display = live(() => (show.live || list.live.length == 0) ? "none" : "block");`
`        live(document.getElementById("list")).style.display = live(() => show.live ? "block" : "none");`
`        live(document.getElementById("empty")).style.display = live(() => list.live.length == 0 ? "block" : "none");`

In this example, the source of data is the live list. The buttons triggers different list manipulations, using the bare JavaScript Array API (push, pop, reverse).
The variable show is another live variable, a boolean that indicates if the list is displayed or not.
The three live functions at the end of the code manipulates the live properties of several DOM elements, linking them to live functions depending on the two live variables.
Moreover, the listEl.mapChildren function allows mapping DOM children elements to a live list: children are dynamically added/removed/updated according to the live list updates.
Finally, listEl.children returns a live list of the DOM children of listEl.

**Restrictions**
JavaScriptLive needs to observe changes on variable for the system to work. With ES6, this can only be achieved throught the use of Proxy, and we can only observe changes on the keys of an object. It is not possible to observe direct variable assignations. This is why we use the .live property to access or change the current value of a live object. From a design perspective, this is quite OK as it makes the explicit distinction between the live object itself, and its current value. However, this can also result in seemingly unnecessary lengthy lines of code. For example, if the children property of a live HTMLElement is, itself, a live object, then we end up writing : listEl.children.live.length to access its length. To avoid this effect, we decided that the properties of live HTMLElements do not require the extra .live access. Indeed, there is already a property access (.children) required by the Proxy mechanism to detect the live object access, and we can avoid using .live in that situation.

Moreover, live HTMLElements are cut down version of their HTMLElements counterpart where we only keep properties that have a dynamic aspect :
\- value: read & write
\- innerHTML: read & write
\- checked: read & write
\- disabled: read & write
\- readonly: read & write
\- title: read & write
\- inert: read & write
\- selected: read & write
\- style\.CSSProperty: read & write
\- mapChildren\(liveList\,template\,post\): a function that maps liveList to children of this element\, using template and calling post after each child creation\.
\- querySelector\(filter\): a function that returns the live version of the first HTMLElement selected by filter\. If you want a bare HTMLElement\, call querySelector on the bare HTMLElement: liveEl\.live\.querySelector\(myfilter\)\.
\- querySelectorAll\(filter\): a function that returns a live array of HTMLElements selected by filter\. Warning: the returned array is live\, but the lements of this Array are bare HTMLElement\, not their live versions\. If you need a live array of live HTMLElements\, create a live function for it:
 live(()=>{let ret=[]; let els=liveEl.querySelectorAll(myfilter); for(let i=0; i<els.length; i++) ret.push(live(els[i)); return ret;});
\- getElementById\(id\): a function that returns the live version of the HTMLElement with that id\.
\- getElementsByName\(name\): a function that returns a live array of HTMLElements whose HTML name attributes are name\.
\- getElementsByTagName\(name\): a function that returns a live array of HTMLElements whose HTML tags are name\.
\- elements: returns a live array of interactive HTMLElements \(input\, select\, and textarea\)\.
\- images: returns a live array of IMG HTMLElements\.
\- plugins: returns a live array of EMBED HTMLElements\.
\- embeds: returns a live array of EMBED HTMLElements\.
\- links: returns a live array of A HTMLElements\.
\- scripts: returns a live array of SCRIPT HTMLElements\.
\- children: returns a live array of the direct children HTMLElements\.
\- serializeObject: see the example above\.

