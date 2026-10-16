# framework

A small fullstack JS framework that keeps code vanilla. File-system routing, Postgres, and server handlers, with no build step.

## Routing

Routing is file-system based. The folder structure under `src/routes/` mirrors the URL path.

Static route: `src/routes/about/index.html` resolves to `/about`.

Dynamic route: `src/routes/api/answers/{id}/messages/POST.js` resolves to `/api/answers/:id/messages` for POST requests, with the `id` segment available on the request object.

Routing supports `{id}` AND `{...catch-all}` dynamic segments, with `METHOD.js` handlers. For example, a catch-all route such as `src/routes/docs/{...catch-all}/GET.js` resolves to `/docs/...` for GET requests.

## Pages

Each route folder can hold:

- `index.html`, which gets its HTML boilerplate handled by the framework
- `layout.html` for shared page shell. There is no `layout.css` or `layout.js`.
- `styles.css` for route styles
- `script.js` for client-side code

## API handlers

A file named after an HTTP method, like `GET.js` or `POST.js`, is a server-side handler for that method on its route. Each handler exports a default function that receives a context object with `params`, `url` (query via `url.searchParams`), and `body` as an async function (`await body()`).

Handlers do NOT receive a literal `$request` with a `body` property.

Handlers receive `db` / `user` / `payments` / `model` from context.

## Framework libraries

There is NO `sql` module or export. The DB is exposed as `db` via `.framework/db/index.js` `server()` returning `{db}`.

There is NO single `auth` import. Auth is split into `.framework/auth/authentication` + `.framework/auth/authorization`.

Handlers do not import these, they receive `db` / `user` / `payments` / `model` from context.

App code lives under `src/` and is imported through `#config/*` and `#lib/*`.

## Project layout

```
src/
  routes/    file-system routing, pages and API handlers
  lib/       shared libraries, imported as #lib/*
```

The real schema location is `src/schema.sql` plus `.framework/*/schema.sql`.

There are no error pages, the server returns plain-text errors.

## Running

`framework.js` creates the server with `new Server({ port, host, features })`. Start it with `npm run dev`.
