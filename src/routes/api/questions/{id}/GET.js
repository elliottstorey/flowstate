async function handler({ db, user, params }) {
    const { id } = params;

    // 1. Get the question first: explicit columns only, never the correct answer.
    const [row] = await db`
        select id, type, stimulus, stem, passage_id from questions
        where id = ${id}
    `;
    if (!row) {
        return new Response(JSON.stringify({ error: "Question not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }
    const { passage_id: passageId, ...question } = row;

    // 2. Get the choices: explicit columns only, no rationales.
    const choices = await db`
        select letter, content from choices
        where question_id = ${id}
        order by letter
    `;

    // 3. Get the passage using the question's passage_id (content column).
    let passage = null;
    if (passageId) {
        const [passageRow] = await db`
            select content from passages
            where id = ${passageId}
        `;
        passage = passageRow || null;
    }

    // 4. Get the user's answer (if any)
    const [answer] = await db`
        select id, selected_choice, reviewed from answers
        where question_id = ${id}
        and user_id = ${user.id}
    `;

    // 5. Get the chat messages (only if they have an answer ID)
    const messages = answer ? await db`
        select role, content from messages
        where answer_id = ${answer.id}
        order by created_at
    ` : [];

    return { passage, question, choices, answer, messages };
}

export default handler;
