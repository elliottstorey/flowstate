import "urlpattern-polyfill";
import { text } from "node:stream/consumers";
import Stripe from "stripe";
import config from "#config/payments";

const DUMMY_BASE = 'http://localhost';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function getPlanKeyByPriceId(priceId) {
	return Object.keys(config.subscriptions || {}).find(
		(key) => config.subscriptions[key].priceId === priceId,
	);
}

async function server({ url, user, db, redirect }) {
	const products = [];
	let subscriptions = [];

	if (user) {
		const activeSubs = await db`
            SELECT stripe_price_id FROM payments.subscriptions 
            WHERE customer_id = (SELECT id FROM payments.customers WHERE user_id = ${user.id})
            AND status IN ('active', 'trialing')
        `;

		subscriptions = activeSubs
			.map((sub) => getPlanKeyByPriceId(sub.stripe_price_id))
			.filter(Boolean);
	}

	async function subscribe(subscription) {
		if (!user) throw new Error("User required to subscribe.");

		const price = config.subscriptions[subscription]?.priceId;
		if (!price) throw new Error(`Plan "${subscription}" not found in config.`);

		const customer =
			await db`SELECT id FROM payments.customers WHERE user_id = ${user.id}`;
		let customerId = customer[0]?.id;

		if (!customerId) {
			const stripeCustomer = await stripe.customers.create({
				email: user.email,
			});
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

	return { payments: { subscribe, products, subscriptions } };
}

async function client({ payments }) {
	async function subscribe(subscription) {
		const response = await fetch("/payments/subscribe", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ subscription }),
		});

		const data = await response.json();

		if (data.url) {
			window.location.href = data.url;
		} else {
			console.error(data.error);
		}
	}

	return {
		...payments,
		subscribe,
	};
}

const routes = [
	{
		method: "POST",
		pattern: new URLPattern({ pathname: "/payments/subscribe", baseURL: DUMMY_BASE }),
		handler: async ({ url, db, user, body }) => {
			if (!user) return { status: 401, body: { error: "Unauthorized" } };

			const { subscription } = await body();
			const price = config.subscriptions[subscription]?.priceId;

            if (!price) return { status: 400, body: { error: "Invalid plan" } };

			const customer =
				await db`SELECT id FROM payments.customers WHERE user_id = ${user.id}`;
			let customerId = customer[0]?.id;

			if (!customerId) {
				const stripeCustomer = await stripe.customers.create({
					email: user.email,
				});
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

			return { url: session.url  };
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
				event = stripe.webhooks.constructEvent(
					rawBody,
					signature,
					process.env.STRIPE_WEBHOOK_SECRET,
				);
			} catch (err) {
				return { status: 400, body: `Webhook Error: ${err.message} ` };
			}

			const existingEvent =
				await db`SELECT id FROM payments.webhook_events WHERE id = ${event.id}`;
			if (existingEvent.length > 0)
				return { status: 200, body: "Already processed" };

			await db`INSERT INTO payments.webhook_events (id, type) VALUES (${event.id}, ${event.type})`;

			const data = event.data.object;

			switch (event.type) {
				case "customer.subscription.created":
				case "customer.subscription.updated":
				case "customer.subscription.deleted": {
					// Extract the first item from the subscription items array
					const item = data.items?.data?.[0];

					await db`
                        INSERT INTO payments.subscriptions (
                            id, 
                            customer_id, 
                            stripe_price_id, 
                            status, 
                            current_period_start, 
                            current_period_end, 
                            cancel_at_period_end
                        )
                        VALUES(
                            ${data.id}, 
                            ${data.customer}, 
                            ${item?.price?.id}, 
                            ${data.status}, 
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
					break;
				}
			}

			return { status: 200, body: "Webhook processed successfully" };
		},
	},
];

export { server, client, routes };
