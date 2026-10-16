# framework

A fullstack JS framework aiming to reduce boilerplate and keep code vanilla.

### Routing



## Directory Structure

```
src/
    routes/ (dynamic routing)

    layout.[html,css,js]

    index.html (auto take care of html boilerplate)
    style.css
    script.js (pass in $request object)

    METHOD.js server side api file (import db, auth from $framework, etc. export default handler w/ $request object passed in)

    lib/

    lib files can be imported from $lib

    errors/

    CODE.html

    schemas/

    auto postgres schemas (.sql files)
```

## Routing

Routing is file-system based and handled within the src/routes/ directory. The folder structure mirrors the URL path.

Static Routes: src/routes/about/index.html resolves to /about.

Dynamic Routes: (Implied usage based on standard conventions) Brackets or specific syntax in folder names handle dynamic parameters.

## Frontend Development

## Backend & API Development

## index.html

All HTML boilerplate is taken care of.

## script.js

## METHOD.js

Export a server side handler function to be called during the specified HTTP METHOD.

### $request

Passed in to the handler function is the $request object.

### framework libraries

Multiple libraries can be imported from framework and used.

* sql
* auth

Something the user knows: Passwords or PINs.

Something the user has: A mobile device (for SMS codes, Authenticator apps, or push notifications) or a hardware security key.

Something the user is: Biometrics like FaceID or fingerprint scanning.