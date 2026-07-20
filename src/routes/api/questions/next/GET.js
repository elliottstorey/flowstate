import { subtypeWeights } from "#lib/lsat";

async function handler({ db, user }) {
	// 1. Enforce Tutor Review First
	const [unreviewedAnswer] = await db`
        SELECT a.id as answer_id, q.id as question_id 
        FROM answers a
        JOIN questions q ON a.question_id = q.id
        WHERE a.user_id = ${user.id} AND a.reviewed = false
        LIMIT 1;
    `;

	if (unreviewedAnswer) {
		// Return a specific payload so the frontend can route them to the tutor
		return {
			requireReview: true,
			answerId: unreviewedAnswer.answer_id,
			questionId: unreviewedAnswer.question_id,
			error: "You must review your previous question before continuing.",
		};
	}

	// 2. Calculate Subtype Deficits
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

	// 4. Fetch the Question
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
