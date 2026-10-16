import Server from "#framework/server";
import * as db from "#framework/features/db";
import * as authentication from "#framework/features/auth/authentication";
import * as payments from "#framework/features/payments";
import * as authorization from "#framework/features/auth/authorization";
import * as ai from "#framework/features/ai";

const server = new Server({
    port: 80,
    host: "0.0.0.0",
    features: [db, authentication, payments, authorization, ai],
});

await server.listen();