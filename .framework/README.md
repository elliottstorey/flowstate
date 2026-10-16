# framework

A small fullstack JS framework that keeps code vanilla. File-system routing, Postgres, and server handlers, with no build step.

## Routing

Routing is file-system based. The folder structure under `src/routes/` mirrors the URL path.

Static route: `src/routes/about/index.html` resolves to `/about`.

Dynamic route: `src/routes/api/answers/{id}/messages/POST.js` resolves to `/api/answers/:id/messages` for POST requests, with the `id` segment available on the request object.

## Pages

Each route folder can hold:

- `index.html`, which gets its HTML boilerplate handled by the framework
- `layout.html`, `layout.css`, and `layout.js` for shared page shell
- `style.css` for route styles
- `script.js` for client-side code, which receives a `$request` object

## API handlers

A file named after an HTTP method, like `GET.js` or `POST.js`, is a server-side handler for that method on its route. Each handler exports a default function that receives a `$request` object with the route params, query string, and body.

## Framework libraries

Handlers import shared libraries through the `#framework/*` alias.

- `sql`, a Postgres client for queries and schema work
- `auth`, Google OAuth sign-in and session handling

App code lives under `src/` and is imported through `#config/*` and `#lib/*`.

## Project layout

```
src/
  routes/    file-system routing, pages and API handlers
  lib/       shared libraries, imported as #lib/*
  schemas/   Postgres schemas as .sql files, applied by db:push
  errors/    error pages as CODE.html
```

## Running

`framework.js` creates the server with `new Server({ port, host, features })`. Start it with `npm run dev`.
