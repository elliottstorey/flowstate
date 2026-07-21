import { generateText, jsonSchema, stepCountIs, tool } from "ai";

async function handler({ db, user, model, params, body }) {
	const { id } = params;
	const { content } = await body();

	// 1. Save user message
	await db`
        INSERT INTO messages (user_id, answer_id, role, content) 
        VALUES (${user.id}, ${id}, 'user', ${content});
    `;

	// 2. Fetch context
	const [answer] = await db`
        SELECT * FROM answers WHERE id = ${id} AND user_id = ${user.id}
    `;
	const [question] = await db`
        SELECT * FROM questions WHERE id = ${answer.question_id}
    `;
	const [passage] = await db`
        SELECT * FROM passages WHERE id = ${question.passage_id}
    `;
	const choices = await db`
        SELECT * FROM choices WHERE question_id = ${question.id}
    `;
	const messages = await db`
        SELECT role, content FROM messages
        WHERE answer_id = ${id}
        ORDER BY created_at ASC;
    `;

	// 3. Update System Prompt with explicit tool instructions
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

	let unlockNextQuestion = false;

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
                        UPDATE answers
                        SET reviewed = true
                        WHERE user_id = ${user.id} AND question_id = ${question.id}
                    `;
                    unlockNextQuestion = true;
                    return "Success: Question unlocked."; 
                },
            }),
        },
	});

	// Fallback just in case the model only called the tool and returned no text
	const finalContent =
		text ||
		(unlockNextQuestion
			? "Great job! You've got it. Let's move on to the next one."
			: "Let's keep trying.");

	// 5. Save assistant message
	await db`
        INSERT INTO messages (user_id, answer_id, role, content) 
        VALUES (${user.id}, ${id}, 'assistant', ${finalContent});
    `;

	return {
		content: finalContent,
		unlockNextQuestion,
		answer: unlockNextQuestion ? question.answer : undefined,
	};
}

export default handler;
