async function handler({ db, user, params }) {
    const { id } = params;

    // 1. Get the question first
    const [question] = await db`
        select * from questions
        where id = ${id}
    `;

    // 2. Get the choices
    const choices = await db`
        select * from choices
        where question_id = ${id}
        order by letter
    `;

    // 3. FIX: Get the passage using question.passage_id (if it exists)
    let passage = null;
    if (question.passage_id) {
        const result = await db`
            select * from passages
            where id = ${question.passage_id}
        `;
        passage = result[0];
    }

    // 4. Get the user's answer (if any)
    const [answer] = await db`
        select * from answers
        where question_id = ${id}
        and user_id = ${user.id}
    `;

    // 5. Get the chat messages (only if they have an answer ID)
    const messages = answer ? await db`
        select * from messages
        where answer_id = ${answer.id}
        order by created_at
    ` : [];

    return { passage, question, choices, answer, messages };
}

export default handler;