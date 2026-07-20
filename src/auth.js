export default {
    providers: ["google"],
    redirect: "/auth/google",
    authorize: {
        "/app": ({ user }) => !user ? "/auth/google" : true,
        "/app/adaptive": async ({ db, user, payments }) => {
            if (payments.subscriptions.length) return true;
            const answers = (await db`
                SELECT * FROM answers
                WHERE user_id = ${user.id}
            `).length;
            return answers < 10 ? true : payments.subscribe("monthly");
        },
        "/api": async ({ db, user, payments }) => {
            if (payments.subscriptions.length) return true;
            const answers = (await db`
                SELECT * FROM answers
                WHERE user_id = ${user.id}
            `).length;
            return answers < 10;
        },
        "/api/webhooks": true
    }
}