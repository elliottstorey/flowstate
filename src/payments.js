export default {
    successUrl: "/app",
    cancelUrl: "/app",
    features: {
        questions:  async ({ db, user, periodStart }) => {
            const questions = await db`
                select * from answers
                where user_id=${user}
                and created_at >= ${periodStart}
            `;
            return questions.length;
        },
        messages: async ({ db, user, periodStart }) => {
            const messages = await db`
                select * from messages
                where user_id=${user}
                and created_at >= ${periodStart}
            `;
            return messages.length;
        }
    },
    products: {
        default: {
            default: true,
            features: {
                questions: 100,
                messages: 25
            }
        },
        monthly: {
            price: 60,
            interval: "monthly",
            priceId: process.env.STRIPE_PRICE_ID, // 60/month
            features: {
                questions: Infinity,
                messages: Infinity
            }
        }
    }
}