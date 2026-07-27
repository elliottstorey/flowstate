import "urlpattern-polyfill";
import { text } from "node:stream/consumers";
import Stripe from "stripe";
import config from "#config/payments";

const DUMMY_BASE = "http://localhost";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function getProductKey(priceId) {
    return Object.keys(config.products || {}).find(k => config.products[k].priceId === priceId);
}

async function server({ url, user, db, redirect }) {
    let activeProducts = [];
    let periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    if (user) {
        const activeSubs = await db`
            SELECT stripe_price_id, current_period_start FROM payments.subscriptions 
            WHERE customer_id = (SELECT id FROM payments.customers WHERE user_id = ${user.id})
            AND status IN ('active', 'trialing')
        `;

        if (activeSubs.length) {
            periodStart = activeSubs[0].current_period_start;
            activeProducts = activeSubs.map(s => getProductKey(s.stripe_price_id)).filter(Boolean);
        }
    }

    if (!activeProducts.length) {
        const defaultProd = Object.keys(config.products).find(k => config.products[k].default);
        if (defaultProd) activeProducts.push(defaultProd);
    }

    const currentProduct = activeProducts[0];
    const limits = config.products[currentProduct]?.features || {};
    const features = {};

    // Get all possible feature keys from both the config logic and the current product limits
    const allFeatureKeys = new Set([
        ...Object.keys(config.features || {}),
        ...Object.keys(limits)
    ]);

    // Pre-calculate all feature access concurrently
    await Promise.all(
        Array.from(allFeatureKeys).map(async (feat) => {
            const limit = limits[feat] || 0;
            const checkUsage = config.features?.[feat];

            if (limit === Infinity) {
                features[feat] = Infinity;
            } else if (typeof limit === "number" && checkUsage && user) {
                const usage = await checkUsage({ db, user: user.id, periodStart });
                features[feat] = Math.max(0, limit - usage); // Returns remaining count
            } else {
                features[feat] = user ? limit : (typeof limit === "number" ? 0 : false);
            }
        })
    );

    async function subscribe(product) {
        if (!user) throw new Error("User required");
        const price = config.products[product]?.priceId;
        if (!price) throw new Error("Invalid product");

        let [{ id: customerId } = {}] = await db`SELECT id FROM payments.customers WHERE user_id = ${user.id}`;

        if (!customerId) {
            const stripeCustomer = await stripe.customers.create({ email: user.email });
            customerId = stripeCustomer.id;
            await db`INSERT INTO payments.customers (id, user_id) VALUES (${customerId}, ${user.id})`;
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: "subscription",
            line_items: [{ price, quantity: 1 }],
            allow_promotion_codes: true,
            success_url: new URL(config.successUrl, url.origin).href,
            cancel_url: new URL(config.cancelUrl, url.origin).href,
        });

        return redirect(session.url);
    }

    return { payments: { subscribe, activeProducts, features } };
}

async function client({ payments }) {
    return {
        ...payments, // Inherits activeProducts and features from the server payload
        async subscribe(product) {
            const res = await fetch("/payments/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product }),
            });
            const { url, error } = await res.json();
            
            if (url) {
                window.location.href = url;
            } else {
                console.error(error);
            }
        }
    };
}

const routes = [
    {
        method: "POST",
        pattern: new URLPattern({ pathname: "/payments/subscribe", baseURL: DUMMY_BASE }),
        handler: async ({ url, db, user, body }) => {
            if (!user) return { status: 401, body: { error: "Unauthorized" } };

            const { product } = await body();
            const price = config.products[product]?.priceId;
            if (!price) return { status: 400, body: { error: "Invalid product" } };

            let [{ id: customerId } = {}] = await db`SELECT id FROM payments.customers WHERE user_id = ${user.id}`;

            if (!customerId) {
                const stripeCustomer = await stripe.customers.create({ email: user.email });
                customerId = stripeCustomer.id;
                await db`INSERT INTO payments.customers (id, user_id) VALUES (${customerId}, ${user.id})`;
            }

            const session = await stripe.checkout.sessions.create({
                customer: customerId,
                mode: "subscription",
                line_items: [{ price, quantity: 1 }],
                allow_promotion_codes: true,
                success_url: new URL(config.successUrl, url.origin).href,
                cancel_url: new URL(config.cancelUrl, url.origin).href,
            });

            return { url: session.url };
        },
    },
    {
        method: "POST",
        pattern: new URLPattern({ pathname: "/payments/webhook", baseURL: DUMMY_BASE }),
        handler: async ({ db, request }) => {
            const rawBody = await text(request);
            const signature = request.headers["stripe-signature"];
            let event;

            try {
                event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
            } catch (err) {
                return { status: 400, body: `Webhook Error: ${err.message}` };
            }

            const existing = await db`SELECT id FROM payments.webhook_events WHERE id = ${event.id}`;
            if (existing.length) return { status: 200, body: "Already processed" };

            await db`INSERT INTO payments.webhook_events (id, type) VALUES (${event.id}, ${event.type})`;

            if (event.type.startsWith("customer.subscription.")) {
                const data = event.data.object;
                const item = data.items?.data?.[0];

                await db`
                    INSERT INTO payments.subscriptions (
                        id, customer_id, stripe_price_id, status, 
                        current_period_start, current_period_end, cancel_at_period_end
                    )
                    VALUES(
                        ${data.id}, ${data.customer}, ${item?.price?.id}, ${data.status}, 
                        to_timestamp(${item?.current_period_start}), 
                        to_timestamp(${item?.current_period_end}), 
                        ${data.cancel_at_period_end}
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        status = EXCLUDED.status,
                        stripe_price_id = EXCLUDED.stripe_price_id,
                        current_period_start = EXCLUDED.current_period_start,
                        current_period_end = EXCLUDED.current_period_end,
                        cancel_at_period_end = EXCLUDED.cancel_at_period_end
                `;
            }

            return { status: 200, body: "Processed" };
        },
    },
];

export { server, client, routes };