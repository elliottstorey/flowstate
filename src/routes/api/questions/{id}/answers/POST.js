export default async function handler({ db, user, payments, params, body }) {
    const { id } = params;
    const { selectedChoice } = await body();

    const [question] = await db`
        select id, answer from questions
        where id = ${id}
    `;
    if (!question) {
        return new Response(JSON.stringify({ error: "Question not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }

    const choices = await db`
        select letter from choices
        where question_id = ${id}
    `;
    if (!choices.some((c) => c.letter === selectedChoice)) {
        return new Response(JSON.stringify({ error: "Invalid choice" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    // Duplicate: return the existing result instead of inserting again.
    const [existing] = await db`
        select id, selected_choice, reviewed from answers
        where question_id = ${id}
        and user_id = ${user.id}
    `;
    if (existing) {
        const existingCorrect = existing.selected_choice == question.answer;
        return {
            id: existing.id,
            answer: existing.reviewed ? question.answer : undefined,
            correct: existingCorrect,
            questionsRemaining: payments?.features?.questions,
            messagesRemaining: payments?.features?.messages
        };
    }

    // Server-side quota: a question counts as used on answer submission.
    if (typeof payments?.features?.questions === "number" && payments.features.questions <= 0) {
        return new Response(JSON.stringify({ error: "Question quota exhausted" }), {
            status: 403,
            headers: { "Content-Type": "application/json" }
        });
    }

    const correct = selectedChoice == question.answer;
    const reviewed = correct;

    const [answer] = await db`
        insert into answers (user_id, question_id, selected_choice, reviewed) 
        values (${user.id}, ${id}, ${selectedChoice}, ${reviewed})
        returning id;
    `;

    const questionsRemaining = payments?.features?.questions === Infinity
        ? Infinity
        : (typeof payments?.features?.questions === "number" ? Math.max(0, payments.features.questions - 1) : undefined);

    return {
        id: answer.id,
        answer: reviewed ? question.answer : undefined,
        correct,
        questionsRemaining,
        messagesRemaining: payments?.features?.messages
    };
}
