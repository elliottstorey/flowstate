import "urlpattern-polyfill";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DUMMY_BASE = 'http://localhost';

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
            return {
                pattern: new URLPattern({ pathname: "/", baseURL: DUMMY_BASE }),
                pathname: "/"
            };
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

        const pathname = path.posix.join("/", ...segments);
        
        return {
            pattern: new URLPattern({ pathname, baseURL: DUMMY_BASE }),
            pathname
        };
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
            const dirRoute = this.getURLPattern(file.parentPath);

            if (this.#httpMethods.has(method) || file.name == "ws.js") {
                const module = await import(pathToFileURL(filePath).href);
                this.routes.push({
                    method: file.name == "ws.js" ? "ws" : method,
                    pattern: dirRoute.pattern,
                    pathname: dirRoute.pathname,
                    handler: module.default
                });
            } else if (file.name === "index.html") {
                const matchedLayouts = this.layouts.filter(layout => {
                    const layoutDir = path.dirname(layout);
                    return file.parentPath === layoutDir || file.parentPath.startsWith(layoutDir + path.sep);
                });

                this.routes.push({
                    method: "GET",
                    pattern: dirRoute.pattern,
                    pathname: dirRoute.pathname,
                    layouts: matchedLayouts,
                    file: filePath
                });
            } else {
                const fileRoute = this.getURLPattern(file.parentPath, file.name);
                this.routes.push({
                    method: "GET",
                    pattern: fileRoute.pattern,
                    pathname: fileRoute.pathname,
                    file: filePath
                });
            }
        }

        // Sort routes by specificity so static routes evaluate before dynamic ones
        this.routes.sort((a, b) => {
            const aSegs = a.pathname.split('/');
            const bSegs = b.pathname.split('/');
            const len = Math.max(aSegs.length, bSegs.length);

            for (let i = 0; i < len; i++) {
                const aSeg = aSegs[i] || '';
                const bSeg = bSegs[i] || '';

                // Catch-all (*) falls to the bottom
                const aIsCatchAll = aSeg.includes('*');
                const bIsCatchAll = bSeg.includes('*');
                if (aIsCatchAll && !bIsCatchAll) return 1;
                if (!aIsCatchAll && bIsCatchAll) return -1;

                // Dynamic (:) falls below static segments
                const aIsDynamic = aSeg.includes(':');
                const bIsDynamic = bSeg.includes(':');
                if (aIsDynamic && !bIsDynamic) return 1;
                if (!aIsDynamic && bIsDynamic) return -1;

                // Sort alphabetically if they are the same type to keep it deterministic
                if (aSeg !== bSeg) return aSeg.localeCompare(bSeg);
            }
            return 0;
        });

        return this.routes;
    }

    route(method, url) {
        const pathOnly = url.split('?')[0];

        const route = this.routes.find(route => 
            route.method == method && route.pattern.test(pathOnly, DUMMY_BASE)
        );
        
        if (!route) return null;

        return { 
            ...route, 
            params: route.pattern.exec(pathOnly, DUMMY_BASE).pathname.groups 
        };
    }
}

export default Router;