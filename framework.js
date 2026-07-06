import path from "node:path";
import Router from "#framework/router";
import Server from "#framework/server";
import * as db from "#framework/features/db";
import * as authentication from "#framework/features/auth/authentication";
import * as payments from "#framework/features/payments";
import * as authorization from "#framework/features/auth/authorization"
import * as ai from "#framework/features/ai";

const features = [db, authentication, payments, authorization, ai];

const dir = path.join(import.meta.dirname, "src", "routes");
const router = new Router(dir);
await router.build();
features.map(feature => feature.routes).filter(Boolean).forEach(routes => {
    routes.forEach(route => router.routes.unshift(route));
});

const port = 80;
const host = "0.0.0.0"
const server = new Server(router, port, host, features);

server.listen();