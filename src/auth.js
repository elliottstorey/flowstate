export default {
    providers: ["google"],
    redirect: "/auth/google",
    authorize: {
        "/app": ({ user }) => !user ? "/auth/google" : true,
        "/app/adaptive": async ({ payments }) => payments.features.questions || payments.subscribe("monthly"),
        "/api": ({ user }) => user,
        "/api/webhooks": true
    }
}