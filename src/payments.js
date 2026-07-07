export default {
    successUrl: "/app",
    cancelUrl: "/",
    products: {
        vault: {}
    },
    subscriptions: {
        monthly: {
            product: "vault",
            priceId: process.env.STRIPE_PRICE_ID // 60/month
        }
    },
}