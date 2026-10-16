import fsp from "node:fs/promises";
import path from "node:path";

const isDev = process.env.NODE_ENV === "development";

export default class Registry {
    cache = new Map();

    constructor(dir = path.join(process.cwd(), "src", "components")) {
        this.dir = dir;
    }

    async get(tag) {
        if (!isDev && this.cache.has(tag)) return this.cache.get(tag);

        try {
            const raw = await fsp.readFile(path.join(this.dir, `${tag}.html`), "utf-8");
            const script = raw.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1]?.trim() || "";
            const template = raw.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").trim();

            const comp = { template, script };
            this.cache.set(tag, comp);
            return comp;
        } catch {
            return null;
        }
    }

    async render(rootNode, scripts = new Map(), isRoot = true) {
        const elements = [...rootNode.querySelectorAll("*")].filter(el => el.tagName.includes("-"));

        for (const el of elements) {
            const tag = el.tagName.toLowerCase();
            const comp = await this.get(tag);
            if (!comp) continue;

            el.innerHTML = `<template shadowrootmode="open">${comp.template}</template>${el.innerHTML}`;
            if (comp.script && !scripts.has(tag)) scripts.set(tag, comp.script);

            const shadowTemplate = el.querySelector("template");
            if (shadowTemplate) await this.render(shadowTemplate.content, scripts, false);
        }

        if (!isRoot || !scripts.size) return;

        const defs = JSON.stringify(Object.fromEntries(scripts));
        rootNode.head.insertAdjacentHTML("beforeend", `<script type="module">
            const defs = ${defs};
            for (const [tag, code] of Object.entries(defs)) {
                const init = new Function("root", "host", "state", code);
                customElements.define(tag, class extends HTMLElement {
                    connectedCallback() {
                        if (this._ready) return;
                        this._ready = true;
                        const state = (initial, onRender) => {
                            let queued = false;
                            const render = () => {
                                if (queued) return;
                                queued = true;
                                requestAnimationFrame(() => {
                                    queued = false;
                                    onRender?.(this);
                                });
                            };
                            for (const [k, v] of Object.entries(initial)) {
                                let val = this[k] ?? this.getAttribute(k) ?? v;
                                Object.defineProperty(this, k, {
                                    enumerable: true,
                                    get: () => val,
                                    set: (next) => { if (val !== next) { val = next; render(); } }
                                });
                            }
                            render();
                            return this;
                        };
                        init(this.shadowRoot, this, state);
                    }
                });
            }
        </script>`);
    }
}