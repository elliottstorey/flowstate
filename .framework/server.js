import fs from "node:fs";
import fsp from "node:fs/promises";
import { createServer } from "node:http";
import { JSDOM } from "jsdom";
import mime from "mime-types";
import serialize from "serialize-javascript";
import { WebSocketServer } from "ws";
import { ClientContext, HttpContext } from "#framework/context";

async function renderHtml(layouts, file, clientState) {
	const html = await fsp.readFile(layouts[0] ?? file, "utf-8");
	const dom = new JSDOM(html);
	const { document } = dom.window;

	for (const f of [...layouts.slice(1), file]) {
		const content = await fsp.readFile(f, "utf-8");
		document.querySelectorAll("slot").forEach((slot) => {
			slot.outerHTML = content;
		});
	}

	const head = document.head;
	if (!head.querySelector("meta[charset]"))
		head.insertAdjacentHTML("afterbegin", `<meta charset="UTF-8">`);
	if (!head.querySelector('meta[name="viewport"]'))
		head.insertAdjacentHTML(
			"beforeend",
			`<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
		);

	const contextScript = `
    <script>
    {
        ${ClientContext.toString()}
        const state = ${serialize(clientState)}; 
        window.$ = new ClientContext(state);
    }
    </script>`;

	head.insertAdjacentHTML("beforeend", contextScript);

	const out = dom.serialize();
	return document.doctype ? out : `<!DOCTYPE html>\n${out}`;
}

class Server {
	constructor(router, port, host = "0.0.0.0", features = []) {
		this.router = router;

		this.port = port;
		this.host = host;

		this.features = features;

		this.http = createServer((request, response) =>
			this.#handleHttp(request, response),
		);
		this.wss = new WebSocketServer({ noServer: true });

		this.http.on("upgrade", (request, socket, head) =>
			this.#handleUpgrade(request, socket, head),
		);
		this.wss.on("connection", (ws, handler) => this.#handleWs(ws, handler));
	}

	listen() {
		this.http.listen(this.port, this.host, () => {
			const { address, port } = this.http.address();
			console.log(`Server running at http://${address}:${port}`);
		});
	}

	async #handleHttp(request, response) {
        console.log(this.router.routes)
        console.log(request.method, request.url)
		const route = this.router.route(request.method, request.url);
        console.log(route);
		const context = new HttpContext(request, response);
		const clientState = { ip: context.ip };

		try {
			if (!route) throw context.error(404, "Not Found");
			context.params = route.params;
			clientState.params = route.params;

			for (const feature of this.features) {
				if (feature.server) {
					Object.assign(context, (await feature.server(context)) || {});
					if (response.headersSent) return;
				}
				if (feature.client) {
					Object.assign(clientState, (await feature.client(context)) || {});
					if (response.headersSent) return;
				}
			}

			if (route.handler) {
				const result = await route.handler(context);

				if (response.headersSent) return;

				if (typeof result == "object" && result != null) {
					response.writeHead(200, { "Content-Type": "application/json" });
					response.end(JSON.stringify(result));
				} else if (result != undefined) {
					response.writeHead(200, { "Content-Type": "text/plain" });
					response.end(String(result));
				} else {
					response.writeHead(204);
					response.end();
				}
			} else if (route.file.endsWith("/index.html")) {
				const html = await renderHtml(route.layouts, route.file, clientState);
				response.writeHead(200, { "Content-Type": "text/html" });
				response.end(html);
			} else if (route.file) {
				const stream = fs.createReadStream(route.file);
				const contentType =
					mime.lookup(route.file) || "application/octet-stream";
				response.writeHead(200, { "Content-Type": contentType });
				stream.pipe(response);
			}
		} catch (error) {
			const status = error.status || 500;
			const message = error.status ? error.message : "Internal Server Error";
			if (status == 500) console.error(error);
			if (response.headersSent) return response.destroy();
			response.writeHead(status);
			response.end(message);
		}
	}

	#handleUpgrade(request, socket, head) {
		const route = this.router.route("ws", request.url);

		if (!route) {
			socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
			return socket.destroy();
		}

		this.wss.handleUpgrade(request, socket, head, (ws) => {
			this.wss.emit("connection", ws, route.handler);
		});
	}

	async #handleWs(ws, handler) {
		const { message, close, error } = await handler();
		if (message) ws.on("message", (event) => message(event));
		if (close) ws.on("close", (event) => close(event));
		if (error) ws.on("error", (event) => error(event));
	}
}

export default Server;
