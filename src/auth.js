export default {
    providers: ["google"],
    redirect: "/auth/google",
    authorize: {
        "/app": ({ user }) => !user ? "/auth/google" : true,
        "/app/adaptive": async ({ payments }) => payments.features.questions || payments.subscribe("monthly"),
        "/app/tests": async ({ payments }) => payments.activeProducts.includes("monthly") || "/app",
        "/app/lessons": async ({ payments }) => payments.activeProducts.includes("monthly") || "/app",
        "/api": ({ user }) => user,
        "/api/webhooks": true
    }
}