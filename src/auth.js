export default {
    providers: ["google"],
    redirect: "/auth/google",
    authorize: {
        "/app": ({ user, payments }) =>
            !user ? "/auth/google" :
                !payments.subscriptions.length ? payments.subscribe("monthly") :
                    true,
        "/api": ({ payments }) => payments.subscriptions.length,
        "/api/webhooks": true
    }
}