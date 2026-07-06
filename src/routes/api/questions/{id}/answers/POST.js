async function handler({ db, user, params, body }) {
    const { id } = params;
    const { selectedChoice } = await body();

    const [question] = await db`
        SELECT * FROM questions
        WHERE id = ${id};
    `;

    const correct = selectedChoice == question.answer;

    const choices = await db`
        SELECT * FROM choices
        WHERE question_id = ${question.id};
    `;

    const [answer] = await db`
        INSERT INTO answers (user_id, question_id, selected_choice, reviewed) 
        VALUES (${user.id}, ${id}, ${selectedChoice}, ${correct})
        RETURNING *;
    `;

    return { correct, choices, answerId: answer.id };
}

export default handler;