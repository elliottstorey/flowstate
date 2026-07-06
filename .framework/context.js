import requestIp from "request-ip";
import cookie from "cookie";

const maxBodyBytes = 1024 * 1024; // 1MB default

class ClientContext {
    constructor(state = {}) {
        // this.ip = state.ip;
        Object.assign(this, state);
    }

    get url() {
        return new URL(window.location.href);
    }

    set url(location) {
        this.redirect(location);
    }

    get cookies() {
        return Object.fromEntries(
            document.cookie.split("; ").map(c => {
                const [key, ...v] = c.split("=");
                return [key, decodeURIComponent(v.join("="))];
            }).filter(([key]) => key)
        );
    }

    redirect = (location) => {
        window.location.href = location;
    }
}

class HttpContext {
    constructor(request, response) {
        this.request = request;
        this.response = response;
    }

    get ip() {
        return requestIp.getClientIp(this.request);
    }

    get url() {
        const proto = this.request.headers["x-forwarded-proto"] || (this.request.socket.encrypted ? "https" : "http");
        const base = `${proto}://${this.request.headers.host}`;
        return new URL(this.request.url, base);
    }

    get headers() {
        return new Proxy(this.request.headers, {
            set: (target, property, value) => {
                target[property] = value;
                this.response.setHeader(property, value);
                return true;
            },
            deleteProperty: (target, property) => {
                delete target[property];
                this.response.removeHeader(property);
                return true;
            }
        });
    }

    set url(location) {
        this.redirect(location);
    }

    get cookies() {
        const apply = (name, value) => {
            let current = this.response.getHeader("set-cookie") || [];
            if (!Array.isArray(current)) current = [current];

            const updated = current.filter(cookie => !cookie.startsWith(`${name}=`));
            if (value != null) updated.push(value);

            this.response.setHeader("set-cookie", updated);
        };

        const isSecure = this.url.protocol == "https:";
        const defaults = { path: "/", httpOnly: true, sameSite: "lax", secure: isSecure };
        const initial = this.headers.cookie ? cookie.parseCookie(this.headers.cookie) : {};

        return new Proxy(initial, {
            set: (target, property, value) => {
                const isObject = typeof value == "object" && value != null;

                const cookieValue = String(isObject ? value.value : value);
                const options = { ...defaults, ...(isObject ? value : {}) };
                delete options.value;

                target[property] = cookieValue;
                apply(property, cookie.stringifySetCookie({ name: property, value: cookieValue, ...options }));
                return true;
            },
            deleteProperty: (target, property) => {
                delete target[property];
                apply(property, cookie.stringifySetCookie({
                    name: property, value: "", ...defaults, expires: new Date(0), maxAge: -1
                }));
                return true;
            }
        });
    }

    body = async () => {
        const buffers = [];
        let byteCount = 0;

        for await (const chunk of this.request) {
            byteCount += chunk.length;
            if (byteCount > maxBodyBytes) throw this.error(413, "Payload Too Large");
            buffers.push(chunk);
        }

        const text = Buffer.concat(buffers).toString();
        if (!text) return null;

        const type = this.headers["content-type"] || "";
        if (type.includes("application/json")) {
            try { return JSON.parse(text); } catch { return text; }
        }
        if (type.includes("application/x-www-form-urlencoded")) {
            return Object.fromEntries(new URLSearchParams(text));
        }
        return text;
    }

    redirect = (location, status = 302) => {
        this.response.writeHead(status, { "Location": String(location) });
        this.response.end();
    }

    error = (status, message) => {
        const error = new Error(message);
        error.status = status;
        error.name = "HttpError";

        if (Error.captureStackTrace) {
            Error.captureStackTrace(error, this.error);
        }

        return error;
    }
}

export { ClientContext, HttpContext };