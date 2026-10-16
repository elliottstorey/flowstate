import "urlpattern-polyfill";
import config from "#config/auth";

const DUMMY_BASE = 'http://localhost';

const compiledRules = Object.entries(config.authorize || {})
    .flatMap(([path, rule]) => {
        const norm = path.replace(/\{([^}]+)\}/g, ':$1');
        const baseScore = (norm.split('/').length * 10) + (norm.includes(':') ? 0 : 2);
        const starPath = norm.endsWith('/') ? `${norm}*` : `${norm}/*`;
        return [
            { pattern: new URLPattern({ pathname: norm, baseURL: DUMMY_BASE }), rule, score: baseScore + 5 },
            { pattern: new URLPattern({ pathname: starPath, baseURL: DUMMY_BASE }), rule, score: baseScore }
        ];
    })
    .sort((a, b) => b.score - a.score);

async function server(context) {
    const { url, redirect, user } = context;

    // 1. Find the highest-scoring matching rule
    const match = compiledRules.find(r => r.pattern.test(url.pathname, DUMMY_BASE));

    // 2. Open by default if no rules match
    if (!match) return { user };

    // 3. Evaluate the rule using the raw request context
    const result = typeof match.rule === 'function'
        ? await match.rule(context)
        : match.rule;

    // 4. Handle the result (The True / String / False Engine)

    // Access Granted (true, or truthy numbers/objects)
    if (result === true || (typeof result === 'number' && result > 0)) {
        return { user };
    }

    // Access Denied: Soft Redirect (e.g., config returned "/pricing" or "/dashboard")
    if (typeof result === 'string') {
        return redirect(result);
    }

    // Access Denied: Default Redirect (Not logged in -> send to global redirect)
    if (!user && config.redirect) {
        return redirect(config.redirect);
    }

    // Access Denied: Hard Block (Logged in, but rule evaluated to false/0)
    return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
    });
}

export { server };
