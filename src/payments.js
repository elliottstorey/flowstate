export default {
    successUrl: "/app",
    cancelUrl: "/app",
    products: {
        vault: {}
    },
    subscriptions: {
        monthly: {
            product: "vault",
            priceId: process.env.STRIPE_PRICE_ID, // 60/month
            trialing: async ({ db }) => {
                const answers = (await db`
                    SELECT * FROM answers
                    WHERE user_id = ${user.id}
                `).length;

                return answers < 10;
            }
        }
    },
}