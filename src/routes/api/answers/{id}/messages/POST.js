import { generateText, tool, jsonSchema } from "ai";

async function handler({ db, user, model, params, body }) {
    const { id } = params;
    const { content } = await body();

    await db`
        INSERT INTO messages (user_id, answer_id, role, content) 
        VALUES (${user.id}, ${id}, 'user', ${content});
    `;

    const [answer] = await db`
        SELECT * FROM answers
        WHERE id = ${id}
        AND user_id = ${user.id}
    `;

    const [question] = await db`
        SELECT * FROM questions
        WHERE id = ${answer.question_id}
    `;

    const [passage] = await db`
        SELECT * FROM passages
        WHERE id = ${question.passage_id}
    `;

    const choices = await db`
        SELECT * FROM choices
        WHERE question_id = ${question.id}
    `;

    const messages = await db`
        SELECT role, content FROM messages
        WHERE answer_id = ${id}
        ORDER BY created_at ASC;
    `;

    const system = `You are a very personable expert LSAT tutor. Provide concise socratic tutoring based on the question below. Do not give away the correct answer (${question.answer}), and make sure the student actually learns from the question for the future. Keep responses concise and plaintext.

        QUESTION DATA:
        Type: ${question.type}
        Passage: ${passage?.text || 'N/A'}
        Stimulus: ${question.stimulus || 'N/A'}
        Stem: ${question.stem}
        
        Choices & Rationales:
        ${choices.map(({ letter, text, rationale }) => `${letter}) ${text}\nRationale: ${rationale}`).join("\n\n")}
        
        Correct Answer: ${question.answer}`;

    let unlockNextQuestion = false;

    const { text, toolCalls } = await generateText({
        model,
        system,
        messages,
        tools: {
            unlockNextQuestion: tool({
                description: "Call this tool when the student demonstrates clear understanding.",
                inputSchema: jsonSchema({
                    type: "object",
                    properties: {},
                    additionalProperties: false
                }),
                execute: async () => {
                    await db`
                        UPDATE answers
                        SET reviewed = true
                        WHERE id = ${id}
                    `;
                    unlockNextQuestion = true;
                }
            })
        }
    });

    await db`
        INSERT INTO messages (user_id, answer_id, role, content) 
        VALUES (${user.id}, ${id}, 'assistant', ${text});
    `;

    return { content: text, unlockNextQuestion, answer: unlockNextQuestion ? question.answer : undefined };
}

export default handler;