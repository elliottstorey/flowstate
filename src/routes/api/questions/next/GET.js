import { subtypeWeights } from "#lib/lsat";

async function handler({ db, user }) {
    let pool = [];
    let totalDeficitTickets = 0;

    for (const [subtype, weight] of Object.entries(subtypeWeights)) {
        const answers = await db`
            SELECT a.selected_choice, q.answer
            FROM answers a JOIN questions q ON a.question_id = q.id
            WHERE a.user_id = ${user.id} AND q.subtype = ${subtype}
            ORDER BY a.answered_at DESC LIMIT ${weight};
        `;

        const correct = answers.filter(answer => answer.selected_choice == answer.answer);
        const deficit = weight - correct.length;

        if (deficit > 0) {
            pool.push({ subtype, deficit });
            totalDeficitTickets += deficit;
        }
    }

    let nextSubtype = null;

    if (pool.length == 0) {
        const subtypes = Object.keys(subtypeWeights);
        nextSubtype = subtypes[Math.floor(Math.random() * subtypes.length)];
    } else {
        let winningTicket = Math.random() * totalDeficitTickets;
        for (const item of pool) {
            winningTicket -= item.deficit;
            if (winningTicket <= 0) {
                nextSubtype = item.subtype;
                break;
            }
        }
    }

    const [question] = await db`
        SELECT * FROM questions
        WHERE subtype = ${nextSubtype} 
          AND id NOT IN (SELECT question_id FROM answers WHERE user_id = ${user.id})
        LIMIT 1;
    `;

    if (!question) throw new Error("AI question gen: Not implemented");

    const choices = await db`
        SELECT letter, text FROM choices
        WHERE question_id = ${question.id}
        ORDER BY letter;
    `;

    let passage = null;
    if (question.passage_id) {
        const [result] = await db`
            SELECT text FROM passages
            WHERE id = ${question.passage_id};
        `;
        passage = result.text;
    }

    return { ...question, passage, choices };
}

export default handler;