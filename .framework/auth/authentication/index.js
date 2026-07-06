import crypto from "node:crypto";
import config from "#config/auth";
import * as arctic from "arctic";

const google = new arctic.Google(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost/auth/callback/google"
);

async function server({ db, cookies }) {
    let user = null;
    const token = cookies.session;

    if (token) {
        const [dbUser] = await db`
            SELECT u.* FROM auth.users u
            INNER JOIN auth.sessions s ON u.id = s.user_id
            WHERE s.token = ${token} AND s.expires_at > now()
        `;
        user = dbUser || null;
    }

    return { user };
}

function client({ user }) {
    return {
        user,
        auth: {
            signIn: () => { window.location.href = "/auth/google"; },
            signOut: async () => {
                await fetch("/auth/session", { method: "DELETE" });
                window.location.reload();
            }
        }
    };
}

const routes = [
    {
        method: "GET",
        pattern: new URLPattern({ pathname: "/auth/google" }),
        handler: ({ cookies, redirect }) => {
            const state = arctic.generateState();
            const codeVerifier = arctic.generateCodeVerifier();
            const scopes = ["openid", "profile", "email"];

            const url = google.createAuthorizationURL(state, codeVerifier, scopes);
            url.searchParams.set("prompt", "select_account");

            cookies.state = state;
            cookies.code_verifier = codeVerifier;

            return redirect(url.href);
        }
    },
    {
        method: "GET",
        pattern: new URLPattern({ pathname: "/auth/callback/google" }),
        handler: async ({ db, url, cookies, redirect, error }) => {
            const code = url.searchParams.get("code");
            const state = url.searchParams.get("state");

            const storedState = cookies.state;
            const storedCodeVerifier = cookies.code_verifier;

            if (!code || !state || !storedState || state !== storedState) {
                throw error(400, "Invalid OAuth request");
            }

            const tokens = await google.validateAuthorizationCode(code, storedCodeVerifier);
            const claims = arctic.decodeIdToken(tokens.idToken());

            // 1. Upsert User
            let [user] = await db`SELECT * FROM auth.users WHERE email = ${claims.email}`;
            if (!user) {
                [user] = await db`
                    INSERT INTO auth.users (name, email, email_verified, image) 
                    VALUES (${claims.name}, ${claims.email}, true, ${claims.picture}) 
                    RETURNING *
                `;
            }

            // 2. Link Account (if not already linked)
            const [account] = await db`SELECT * FROM auth.accounts WHERE provider_id = 'google' AND account_id = ${claims.sub}`;
            if (!account) {
                await db`
                    INSERT INTO auth.accounts (user_id, account_id, provider_id, access_token, id_token)
                    VALUES (${user.id}, ${claims.sub}, 'google', ${tokens.accessToken()}, ${tokens.idToken()})
                `;
            }

            // 3. Create Session
            const sessionToken = crypto.randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days

            await db`
                INSERT INTO auth.sessions (user_id, token, expires_at) 
                VALUES (${user.id}, ${sessionToken}, ${expiresAt})
            `;

            cookies.session = sessionToken;
            return redirect("/app");
        }
    },
    {
        method: "DELETE",
        pattern: new URLPattern({ pathname: "/auth/session" }),
        handler: async ({ db, cookies }) => {
            const token = cookies.session;
            if (token) {
                await db`DELETE FROM auth.sessions WHERE token = ${token}`;
            }
            delete cookies.session;
            return { success: true };
        }
    }
];

export { server, client, routes };