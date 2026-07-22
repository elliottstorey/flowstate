import { subtypeWeights } from "#lib/lsat";

async function handler({ db, user }) {
    let targetQuestionId = null;

    // 1. Check for Unreviewed Answer First
    const [unreviewedAnswer] = await db`
        SELECT a.id as answer_id, q.id as question_id 
        FROM answers a
        JOIN questions q ON a.question_id = q.id
        WHERE a.user_id = ${user.id} AND a.reviewed = false
        ORDER BY a.answered_at DESC  /* FIX: Prioritize newest mistakes */
        LIMIT 1;
    `;

    if (unreviewedAnswer) {
        // Set the target question to the one they need to review
        targetQuestionId = unreviewedAnswer.question_id;
    } else {
        // 2. Calculate Subtype Deficits (Only if no unreviewed question)
        const pool = [];
        let totalDeficitTickets = 0;

        for (const [subtype, weight] of Object.entries(subtypeWeights)) {
            const answers = await db`
                SELECT a.selected_choice, q.answer
                FROM answers a JOIN questions q ON a.question_id = q.id
                WHERE a.user_id = ${user.id} AND q.subtype = ${subtype}
                ORDER BY a.answered_at DESC LIMIT ${weight};
            `;

            const correct = answers.filter(
                (answer) => answer.selected_choice == answer.answer,
            );
            const deficit = weight - correct.length;

            if (deficit > 0) {
                pool.push({ subtype, deficit });
                totalDeficitTickets += deficit;
            }
        }

        // 3. Select Next Subtype (Probabilistic)
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

        // 4. Find the next new question ID
        const [nextQuestion] = await db`
            SELECT id FROM questions
            WHERE subtype = ${nextSubtype} 
              AND id NOT IN (SELECT question_id FROM answers WHERE user_id = ${user.id})
            ORDER BY RANDOM() /* FIX: Shuffle the pool of remaining questions */
            LIMIT 1;
        `;

        if (!nextQuestion) throw new Error("AI question gen: Not implemented");
        targetQuestionId = nextQuestion.id;
    }

    // 5. Fetch the Question Details (Runs for both unreviewed and new questions)
    const [question] = await db`
        SELECT * FROM questions
        WHERE id = ${targetQuestionId};
    `;

    const choices = await db`
        SELECT letter, text FROM choices
        WHERE question_id = ${targetQuestionId}
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

    // Return the unified format
    return { ...question, passage, choices };
}

export default handler;