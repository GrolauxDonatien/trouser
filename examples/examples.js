
function runExamples(list) {

    let listEl = live(document.getElementById("examples"));
    let topics = live(Object.keys(list));
    let example = live(null);

    listEl.mapChildren(topics,
        (item) => `<li class="mb-1">
        <button class="btn btn-toggle align-items-center rounded" data-bs-toggle="collapse" data-bs-target="#${item}-collapse" aria-expanded="true">
            ${item}
        </button>
        <div class="collapse show" id="${item}-collapse" style="">
          <ul class="btn-toggle-nav list-unstyled fw-normal pb-1 small">
          </ul>
        </div>
        </li>`,
        (item, el) => {
            live(el.querySelector("ul")).mapChildren(live(list[item]),
                (sub) => `<li><a href="#" class="link-dark rounded">${sub}</li>`,
                (sub, el) => {
                    el.querySelector("a").addEventListener("click", () => { 
                        example.live = item + "/" + sub; 
                    });
                })
        }
    );

    let code = document.getElementById("code");
    let html = document.getElementById("html");
    let preview = document.getElementById("preview");


    example.addChangeListener(() => {
        let iframe = preview.querySelector("iframe");
        if (iframe) iframe.parentElement.removeChild(iframe);
        iframe = document.createElement("iframe");
        iframe.setAttribute("src", example.live + ".html");
        preview.appendChild(iframe);
    });

    function format(t) {
        let lines = t.split("\n");
        while (lines.length > 0 && lines[0].trim().length == 0) lines.splice(0, 1);
        while (lines.length > 0 && lines[lines.length-1].trim().length == 0) lines.pop();
        let spaces = Number.MAX_VALUE;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("<script")) {
                lines.splice(i);
                break;
            }
        }
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() != "") {
                let lost = lines[i].length - lines[i].trimStart().length;
                if (lost < spaces) spaces = lost;
            }
        }
        if (spaces < Number.MAX_VALUE) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim() != "") {
                    lines[i] = lines[i].substring(spaces);
                }
            }
        }
        return lines.join('\n');
    }

    window.addEventListener("message", (event) => {
        code.innerHTML = '';
        textarea = document.createElement("textarea");
        textarea.value = format(event.data.script);
        code.appendChild(textarea);
        let editor = CodeMirror.fromTextArea(textarea, {
            mode: "javascript",
            lineNumbers: true,
            readOnly: true
        });
        editor.save()
        html.innerHTML = '';
        textarea = document.createElement("textarea");
        textarea.value = format(event.data.body);
        html.appendChild(textarea);
        editor = CodeMirror.fromTextArea(textarea, {
            mode: "javascript",
            lineNumbers: true,
            readOnly: true
        });
        editor.save()
    });

}

