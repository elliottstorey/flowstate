import fs from "node:fs";
import fsp from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { JSDOM } from "jsdom";
import mime from "mime-types";
import serialize from "serialize-javascript";
import { WebSocketServer } from "ws";
import { ClientContext, HttpContext } from "#framework/context";
import Router from "#framework/router";
import Registry from "#framework/registry";

function getHeadKey(el) {
	const tag = el.tagName.toLowerCase();
	if (el.id) return `id:${el.id}`;
	if (tag === "title" || tag === "base") return tag;
	if (tag === "meta") {
		const id = el.name || el.getAttribute("property") || el.httpEquiv || (el.hasAttribute("charset") && "charset");
		return id ? `meta:${id}` : Symbol();
	}
	if (tag === "link") {
		const rel = el.rel?.toLowerCase() || "";
		if (["canonical", "icon", "shortcut icon", "manifest"].includes(rel)) return `link:${rel}`;
		return el.href ? `link:${rel}:${el.href}` : Symbol();
	}
	if (tag === "script" && el.src) return `script:${el.src}`;
	return Symbol();
}

export default class Server {
	constructor({
		port = 80,
		host = "0.0.0.0",
		features = [],
		routesDir = path.join(process.cwd(), "src", "routes"),
		componentsDir = path.join(process.cwd(), "src", "components"),
	} = {}) {
		this.port = port;
		this.host = host;
		this.features = features;
		this.router = new Router(routesDir);
		this.registry = new Registry(componentsDir);

		this.http = createServer((req, res) => this.#handleHttp(req, res));
		this.wss = new WebSocketServer({ noServer: true });

		this.http.on("upgrade", (req, sock, head) => this.#handleUpgrade(req, sock, head));
		this.wss.on("connection", (ws, handler) => this.#handleWs(ws, handler));
	}

	async listen() {
		await this.router.build();
		for (const feature of this.features) {
			if (feature.routes) this.router.routes.unshift(...feature.routes);
		}

		this.http.listen(this.port, this.host, () => {
			const { address, port } = this.http.address();
			console.log(`Server running at http://${address}:${port}`);
		});
	}

	async #renderHtml(layouts, file, clientState) {
		const [first, ...rest] = [...layouts, file];
		const dom = new JSDOM(await fsp.readFile(first, "utf-8"));
		const { document } = dom.window;

		// 1. Replace <slot> hierarchy
		for (const f of rest) {
			const content = await fsp.readFile(f, "utf-8");
			document.querySelectorAll("slot").forEach(slot => (slot.outerHTML = content));
		}

		// 2. Hoist & deduplicate <head> tags (child templates win)
		const headTags = new Map();
		document.querySelectorAll("title:not(svg title), meta, link, base, style, script").forEach(el => {
			el.remove();
			headTags.set(getHeadKey(el), el);
		});
		headTags.forEach(el => document.head.appendChild(el));

		// 3. SSR & hydrate Custom Elements
		await this.registry.render(document);

		// 4. Ensure default meta tags & inject ClientContext ($)
		const { head } = document;
		if (!head.querySelector("meta[charset]")) {
			head.insertAdjacentHTML("afterbegin", `<meta charset="UTF-8">`);
		}
		if (!head.querySelector('meta[name="viewport"]')) {
			head.insertAdjacentHTML("beforeend", `<meta name="viewport" content="width=device-width, initial-scale=1.0">`);
		}
		head.insertAdjacentHTML("beforeend", `<script>{
            ${ClientContext.toString()}
            window.$ = new ClientContext(${serialize(clientState)});
        }</script>`);

		const out = dom.serialize();
		return document.doctype ? out : `<!DOCTYPE html>\n${out}`;
	}

	async #handleHttp(req, res) {
		const route = this.router.route(req.method, req.url);
		const context = new HttpContext(req, res);
		const clientState = { ip: context.ip, params: route?.params };

		try {
			if (!route) throw context.error(404, "Not Found");
			context.params = route.params;

			for (const feature of this.features) {
				if (feature.server) Object.assign(context, await feature.server(context));
				if (res.headersSent) return;
				if (feature.client) Object.assign(clientState, await feature.client(context));
				if (res.headersSent) return;
			}

			if (route.handler) {
				const result = await route.handler(context);
				if (res.headersSent) return;

				if (typeof result === "object" && result !== null) {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify(result));
				} else if (result !== undefined) {
					res.writeHead(200, { "Content-Type": "text/plain" });
					res.end(String(result));
				} else {
					res.writeHead(204).end();
				}
			} else if (route.file?.endsWith("/index.html")) {
				const html = await this.#renderHtml(route.layouts, route.file, clientState);
				res.writeHead(200, { "Content-Type": "text/html" }).end(html);
			} else if (route.file) {
				const contentType = mime.lookup(route.file) || "application/octet-stream";
				res.writeHead(200, { "Content-Type": contentType });
				fs.createReadStream(route.file).pipe(res);
			}
		} catch (err) {
			const status = err.status || 500;
			if (status === 500) console.error(err);
			if (res.headersSent) return res.destroy();
			res.writeHead(status).end(err.status ? err.message : "Internal Server Error");
		}
	}

	#handleUpgrade(req, socket, head) {
		const route = this.router.route("ws", req.url);
		if (!route) {
			socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
			return socket.destroy();
		}
		this.wss.handleUpgrade(req, socket, head, ws => {
			this.wss.emit("connection", ws, route.handler);
		});
	}

	async #handleWs(ws, handler) {
		const { message, close, error } = (await handler()) || {};
		if (message) ws.on("message", message);
		if (close) ws.on("close", close);
		if (error) ws.on("error", error);
	}
}