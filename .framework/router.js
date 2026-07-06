import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

class Router {
    #httpMethods = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

    routes = [];
    layouts = [];

    constructor(dir) {
        this.dir = dir;
    }

    getURLPattern(parentPath, name = "") {
        const fullPath = path.join(parentPath, name);
        const relativePath = path.relative(this.dir, fullPath);

        if (!relativePath) {
            return new URLPattern({ pathname: "/" });
        }

        const segments = relativePath.split(path.sep).map(segment => {
            if (segment.startsWith("{...") && segment.endsWith("}")) {
                return `:${segment.slice(4, -1)}*`;
            }
            if (segment.startsWith("{") && segment.endsWith("}")) {
                return `:${segment.slice(1, -1)}`;
            }
            return segment;
        });

        return new URLPattern({ pathname: path.posix.join("/", ...segments) });
    }

    async build() {
        const files = await fs.readdir(this.dir, { recursive: true, withFileTypes: true });

        for (const file of files) {
            if (file.name == "layout.html") {
                this.layouts.push(path.join(file.parentPath, file.name));
            }
        }

        this.layouts.sort((a, b) => a.length - b.length);

        for (const file of files) {
            if (!file.isFile() || file.name == "layout.html") continue;

            const filePath = path.join(file.parentPath, file.name);
            const method = path.basename(file.name, ".js");
            const dirPattern = this.getURLPattern(file.parentPath);

            if (this.#httpMethods.has(method) || file.name == "ws.js") {
                const module = await import(pathToFileURL(filePath).href);
                this.routes.push({
                    method: file.name == "ws.js" ? "ws" : method,
                    pattern: dirPattern,
                    handler: module.default
                });
            } else if (file.name === "index.html") {
                const matchedLayouts = this.layouts.filter(layout => {
                    const layoutDir = path.dirname(layout);
                    return file.parentPath === layoutDir || file.parentPath.startsWith(layoutDir + path.sep);
                });

                this.routes.push({
                    method: "GET",
                    pattern: dirPattern,
                    layouts: matchedLayouts,
                    file: filePath
                });
            } else {
                this.routes.push({
                    method: "GET",
                    pattern: this.getURLPattern(file.parentPath, file.name),
                    file: filePath
                });
            }
        }

        return this.routes;
    }

    route(method, url) {
        const route = this.routes.find(route => route.method == method && route.pattern.test(url));
        if (!route) return null;

        return { ...route, params: route.pattern.exec(url).pathname.groups };
    }
}

export default Router;