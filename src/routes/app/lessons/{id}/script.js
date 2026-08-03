import DOMPurify from "https://esm.sh/dompurify@3";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

const DOM = {
    title: document.getElementById("title"),
    type: document.getElementById("type"),
    subtype: document.getElementById("subtype"),
    content: document.getElementById("content")
};

async function listen() {
    const id = $.params.id;

    const response = await fetch(`/api/lessons/${id}`);

    const { title, type, subtype, content } = await response.json();

    DOM.title.textContent = title;
    DOM.type.textContent = type;
    DOM.subtype.textContent = subtype;
    DOM.content.innerHTML = DOMPurify.sanitize(marked.parse(content));
}

listen();