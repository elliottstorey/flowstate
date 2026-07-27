import { generateText, jsonSchema, stepCountIs, tool } from "ai";

async function handler({ db, user, payments, model, params, body }) {
	const { id } = params;
	const { content } = await body();

	await db`
        insert into messages (user_id, answer_id, role, content) 
        values (${user.id}, ${id}, 'user', ${content});
    `;

	const [answer] = await db`
        select * from answers
        where id = ${id}
        and user_id = ${user.id}
    `;

	const [question] = await db`
        select * from questions
        where id = ${answer.question_id}
    `;

	const [passage] = await db`
        select * from passages
        where id = ${question.passage_id}
    `;

	const choices = await db`
        select * from choices
        where question_id = ${question.id}
    `;

	const messages = await db`
        select role, content from messages
        where answer_id = ${id}
        order by created_at asc;
    `;

	const system = `You are a very personable expert LSAT tutor. Provide concise socratic tutoring based on the question below. Do not give away the correct answer (${question.answer}), and make sure the student actually learns from the question for the future. Keep responses concise and plaintext.

        CRITICAL INSTRUCTION: When the student demonstrates clear understanding of the reasoning, you MUST call the "unlockNextQuestion" tool to let them proceed. Do not make them wait once they get it right.

        QUESTION DATA:
        Type: ${question.type}
        Passage: ${passage?.text || "N/A"}
        Stimulus: ${question.stimulus || "N/A"}
        Stem: ${question.stem}
        
        Choices & Rationales:
        ${choices.map(({ letter, text, rationale }) => `${letter}) ${text}\nRationale: ${rationale}`).join("\n\n")}
        
        Correct Answer: ${question.answer}`;

	let reviewed = false;

	// 4. Run Generation with stepCountIs and correct tool schema format
	const { text } = await generateText({
		model,
		system,
		messages,
		stopWhen: stepCountIs(2), // Allows AI to call the tool, then generate a final response
		tools: {
			unlockNextQuestion: tool({
				description:
					"Call this tool IMMEDIATELY when the student demonstrates clear understanding of the correct answer.",
				inputSchema: jsonSchema({
					type: "object",
					properties: {},
					additionalProperties: false,
				}),
				execute: async () => {
					// FIX: Unlock ALL answers for this question so old incorrect guesses don't trap them
					await db`
                        update answers
                        set reviewed = true
                        where question_id = ${question.id}
                        and user_id = ${user.id}
                    `;
					reviewed = true;
					return "Success: Question unlocked.";
				},
			}),
		},
	});

	// Fallback just in case the model only called the tool and returned no text
	let finalContent =
		text ||
		(reviewed
			? "Great job! You've got it. Let's move on to the next one."
			: "Let's keep trying.");

	// 5. Save assistant message
	await db`
        insert into messages (user_id, answer_id, role, content) 
        values (${user.id}, ${id}, 'assistant', ${finalContent});
    `;

    if (payments.features.messages <= 0 && !reviewed) {
        await db`
            update answers
            set reviewed = true
            where id = ${id}
        `;
        reviewed = true;
        
        // Optional UX improvement: Append a note so they aren't confused 
        // why the AI suddenly stopped tutoring and revealed the answer.
        finalContent += "\n\n*(Note: You are out of messages! The correct answer has been revealed so you can move on.)*";
    }

	return {
		content: finalContent,
		reviewed,
		answer: reviewed ? question.answer : undefined,
	};
}

export default handler;
