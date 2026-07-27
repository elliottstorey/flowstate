import { subtypeWeights } from "#lib/lsat";

async function getSubtype({ db, user }) {
    const unansweredSubtypes = [];
	const missedSubtypes = [];

	for (const [subtype, weight] of Object.entries(subtypeWeights)) {
		const answers = await db`
            select answers.* from answers
            join questions on answers.question_id = questions.id
            where questions.subtype = ${subtype}
            and answers.user_id = ${user.id}
            order by answers.created_at desc
            limit ${weight}
        `;

        if (answers.length < weight) {
            const unanswered = weight - answers.length;
            unansweredSubtypes.push(...Array(unanswered).fill(subtype)); 
            continue;
        }

		let correct = 0;
		for (const answer of answers) {
			const [question] = await db`
                select * from questions
                where id = ${answer.question_id}
            `;

			if (question.answer == answer.selected_choice) correct += 1;
		}

		const deficit = weight - correct;

		missedSubtypes.push(...Array(deficit).fill(subtype));
	}

    if (unansweredSubtypes.length) {
        return unansweredSubtypes[Math.floor(Math.random() * unansweredSubtypes.length)];
    }

    if (missedSubtypes.length) {
        return missedSubtypes[Math.floor(Math.random() * missedSubtypes.length)];
    }

    const subtypes = Object.keys(subtypeWeights);
    return subtypes[Math.floor(Math.random() * subtypes.length)];
}

async function handler({ db, user }) {
	const [answer] = await db`
        select * from answers
        where reviewed = false
        and user_id = ${user.id}
    `;

    if (answer) {
        const [question] = await db`
            select * from questions
            where id = ${answer.question_id}
        `;

        const { id, type, subtype, difficulty } = question;

        return { id, type, subtype, difficulty };
    }

	const subtype = await getSubtype({ db, user });

    const [question] = await db`
        select * from questions
        where subtype = ${subtype}
        and id not in (
            select question_id from answers
            where user_id = ${user.id}
        )
        order by random()
        limit 1
    `;

    // TODO if !question, generate one and return info!

    const { id, type, difficulty } = question;

    return { id, type, subtype, difficulty };
}

export default handler;
