import { generateText, jsonSchema, Output, NoObjectGeneratedError } from "ai";
import { subtypeWeights } from "#lib/lsat";

async function getTarget({ db, user }) {
    const unansweredSlots = [];
    const missedSlots = [];

    for (const [subtype, weights] of Object.entries(subtypeWeights)) {
        for (let i = 0; i < weights.length; i++) {
            const difficulty = i + 1;
            const weight = weights[i];
            if (weight === 0) continue;

            const answers = await db`
                SELECT (answers.selected_choice = questions.answer) AS is_correct
                FROM answers
                JOIN questions ON answers.question_id = questions.id
                WHERE questions.subtype = ${subtype}
                  AND questions.difficulty = ${difficulty}
                  AND answers.user_id = ${user.id}
                  AND answers.selected_choice IS NOT NULL
                ORDER BY answers.created_at DESC
                LIMIT ${weight}
            `;

            if (answers.length < weight) {
                const unanswered = weight - answers.length;
                unansweredSlots.push(...Array(unanswered).fill({ subtype, difficulty }));
                continue;
            }

            const correct = answers.filter(a => a.is_correct).length;
            const deficit = weight - correct;
            missedSlots.push(...Array(deficit).fill({ subtype, difficulty }));
        }
    }

    if (unansweredSlots.length) {
        return unansweredSlots[Math.floor(Math.random() * unansweredSlots.length)];
    }

    if (missedSlots.length) {
        return missedSlots[Math.floor(Math.random() * missedSlots.length)];
    }

    const subtypes = Object.keys(subtypeWeights);
    return {
        subtype: subtypes[Math.floor(Math.random() * subtypes.length)],
        difficulty: 4
    };
}

const LETTERS = ["A", "B", "C", "D", "E"];
const MAX_ATTEMPTS = 3;

// ---------- JSON schemas ----------

const choiceProps = {
    content: { type: "string", description: "Answer choice text. Never reference other choices by letter." },
    rationale: { type: "string", description: "Why this choice is correct or incorrect. Never reference choices by letter." },
};
const choiceSchema = {
    type: "object",
    properties: choiceProps,
    required: ["content", "rationale"],
    additionalProperties: false,
};

const questionProps = {
    stem: { type: "string", description: "The question stem, e.g. 'Which one of the following...'" },
    correct: choiceSchema,
    distractors: { type: "array", items: choiceSchema, description: "Exactly 4 incorrect choices." },
};

function isValidQuestion(q) {
    return (
        q &&
        typeof q.stem === "string" &&
        q.correct?.content &&
        Array.isArray(q.distractors) &&
        q.distractors.length === 4
    );
}

const lrSchema = jsonSchema(
    {
        type: "object",
        properties: {
            stimulus: { type: "string", description: "The argument or passage the question is about." },
            ...questionProps,
        },
        required: ["stimulus", "stem", "correct", "distractors"],
        additionalProperties: false,
    },
    {
        validate: (value) =>
            typeof value?.stimulus === "string" && isValidQuestion(value)
                ? { success: true, value }
                : { success: false, error: new Error("Invalid LR question: need stimulus and exactly 4 distractors") },
    }
);

const rcSchema = (n) =>
    jsonSchema(
        {
            type: "object",
            properties: {
                passage: { type: "string" },
                questions: {
                    type: "array",
                    description: `Exactly ${n} questions, in the same order as the example.`,
                    items: {
                        type: "object",
                        properties: questionProps,
                        required: ["stem", "correct", "distractors"],
                        additionalProperties: false,
                    },
                },
            },
            required: ["passage", "questions"],
            additionalProperties: false,
        },
        {
            validate: (value) =>
                typeof value?.passage === "string" &&
                    Array.isArray(value.questions) &&
                    value.questions.length === n &&
                    value.questions.every(isValidQuestion)
                    ? { success: true, value }
                    : { success: false, error: new Error(`Invalid RC set: need passage and exactly ${n} valid questions`) },
        }
    );

const solveSchema = jsonSchema(
    {
        type: "object",
        properties: {
            answer: { type: "string", enum: LETTERS },
        },
        required: ["answer"],
        additionalProperties: false,
    },
    {
        validate: (value) =>
            LETTERS.includes(value?.answer)
                ? { success: true, value }
                : { success: false, error: new Error("Invalid answer letter") },
    }
);

// ---------- helpers ----------

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Loads the source question, plus (for RC) its passage and sibling questions, all with choices
async function loadSource(db, { subtype, difficulty }) {
    // Prefer human-written originals as seeds so generated content doesn't drift
    const [source] = await db`
    SELECT id, type, subtype, difficulty, passage_id
    FROM questions
    WHERE subtype = ${subtype} AND difficulty = ${difficulty}
    ORDER BY generated ASC, random()
    LIMIT 1
  `;
    if (!source) return null;

    let passage = null;
    let questions;

    if (source.type === "Reading Comprehension") {
        [passage] = await db`SELECT content FROM passages WHERE id = ${source.passage_id}`;
        questions = await db`
      SELECT id, type, subtype, difficulty, stimulus, stem, answer
      FROM questions
      WHERE passage_id = ${source.passage_id}
      ORDER BY id
    `;
    } else {
        questions = await db`
      SELECT id, type, subtype, difficulty, stimulus, stem, answer
      FROM questions
      WHERE id = ${source.id}
    `;
    }

    const choices = await db`
    SELECT question_id, letter, content, rationale
    FROM choices
    WHERE question_id IN ${db(questions.map((q) => q.id))}
    ORDER BY question_id, letter
  `;
    for (const q of questions) {
        q.choices = choices.filter((c) => c.question_id === q.id);
    }

    return { source, passage, questions };
}

function formatExample(q, i) {
    return [
        `QUESTION ${i + 1} (subtype: ${q.subtype}, difficulty: ${q.difficulty}/5)`,
        q.stimulus ? `Stimulus: ${q.stimulus}` : null,
        `Stem: ${q.stem}`,
        ...q.choices.map(
            (c) => `(${c.letter})${c.letter === q.answer ? " [CORRECT]" : ""} ${c.content}\n   Rationale: ${c.rationale}`
        ),
    ]
        .filter(Boolean)
        .join("\n");
}

// Turns a model draft into a question with shuffled, lettered choices
function buildQuestion(draft) {
    const shuffled = shuffle([
        { ...draft.correct, isCorrect: true },
        ...draft.distractors.map((d) => ({ ...d, isCorrect: false })),
    ]);
    return {
        stimulus: draft.stimulus ?? null,
        stem: draft.stem,
        answer: LETTERS[shuffled.findIndex((c) => c.isCorrect)],
        choices: shuffled.map((c, i) => ({
            letter: LETTERS[i],
            content: c.content,
            rationale: c.rationale,
        })),
    };
}

// ---------- generation ----------

const GENERATE_SYSTEM = `You are an expert LSAT question writer. You write original LSAT questions that mirror the
logical structure, reasoning pattern, and difficulty of a given example, but with entirely new content.

Rules:
- Change the subject matter, scenario, names, and wording completely. Do not reuse sentences or distinctive phrases from the example.
- Preserve the exact question subtype, reasoning structure, stem format, and difficulty (1 = easiest, 5 = hardest).
- Exactly one choice must be unambiguously correct; the four distractors must be clearly wrong yet tempting in the ways real LSAT distractors are (scope shifts, reversals, extreme language, irrelevant but plausible).
- Write a rationale for every choice. Never refer to choices by letter, since order will be shuffled.
- Match official LSAT tone, length, and register.`;

const SOLVE_SYSTEM = `You are an expert LSAT test taker. Answer the question using only the information given.
Choose the single best answer.`;

async function draftSet({ model, source, passage, questions }) {
    if (source.type === "Reading Comprehension") {
        const { output } = await generateText({
            model,
            system: GENERATE_SYSTEM,
            output: Output.object({ schema: rcSchema(questions.length) }),
            prompt: `Write a new Reading Comprehension passage and exactly ${questions.length} questions based on the example below.
Write the new questions in the same order, keeping each one's subtype and difficulty identical to its counterpart.
The new passage must have similar length and structure to the original but cover a different topic.

EXAMPLE PASSAGE:
${passage.content}

${questions.map(formatExample).join("\n\n")}`,
        });
        return {
            passage: output.passage,
            questions: output.questions.map(buildQuestion),
        };
    }

    const { output } = await generateText({
        model,
        system: GENERATE_SYSTEM,
        output: Output.object({ schema: lrSchema }),
        prompt: `Write one new Logical Reasoning question based on the example below.

${formatExample(questions[0], 0)}`,
    });
    return { passage: null, questions: [buildQuestion(output)] };
}

// Blind solve: the checker never sees the intended answer or the rationales
async function solves({ model, passage, question }) {
    const { output } = await generateText({
        model,
        system: SOLVE_SYSTEM,
        output: Output.object({ schema: solveSchema }),
        prompt: [
            passage ? `PASSAGE:\n${passage}` : null,
            question.stimulus ? `STIMULUS:\n${question.stimulus}` : null,
            `QUESTION: ${question.stem}`,
            ...question.choices.map((c) => `(${c.letter}) ${c.content}`),
        ]
            .filter(Boolean)
            .join("\n\n"),
    });
    return output.answer === question.answer;
}

async function passesQualityCheck({ model, set }) {
    const results = await Promise.all(
        set.questions.map((question) => solves({ model, passage: set.passage, question }))
    );
    return results.every(Boolean);
}

async function generateQuestion({ db, model, target }) {
    const loaded = await loadSource(db, target);
    if (!loaded) {
        const [{ count }] = await db`select count(*)::int as count from questions`; if (count === 0) return null; throw new Error(`No source question for ${target.subtype} @ difficulty ${target.difficulty}`);
    }
    const { source, passage, questions } = loaded;

    let set = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const candidate = await draftSet({ model, source, passage, questions });
            if (await passesQualityCheck({ model, set: candidate })) {
                set = candidate;
                break;
            }
            console.warn(`Generated question failed blind-solve check (attempt ${attempt}/${MAX_ATTEMPTS})`);
        } catch (err) {
            if (!NoObjectGeneratedError.isInstance?.(err)) throw err;
            console.warn(`Structured output failed (attempt ${attempt}/${MAX_ATTEMPTS})`, err.message);
        }
    }
    if (!set) {
        throw new Error(`Failed to generate a valid question for ${target.subtype} @ ${target.difficulty}`);
    }

    // Persist atomically; discard nothing until everything has passed
    const rows = await db.begin(async (tx) => {
        let passageId = null;
        if (set.passage) {
            [{ id: passageId }] = await tx`
        INSERT INTO passages (content, generated) VALUES (${set.passage}, true)
        RETURNING id
      `;
        }

        const inserted = [];
        for (let i = 0; i < set.questions.length; i++) {
            const q = set.questions[i];
            const original = questions[i];

            const [row] = await tx`
        INSERT INTO questions (type, subtype, passage_id, stimulus, stem, answer, difficulty, generated)
        VALUES (
          ${original.type}, ${original.subtype}, ${passageId},
          ${q.stimulus}, ${q.stem}, ${q.answer}, ${original.difficulty}, true
        )
        RETURNING id, type, subtype, difficulty
      `;

            await tx`
        INSERT INTO choices ${tx(
                q.choices.map((c) => ({
                    question_id: row.id,
                    letter: c.letter,
                    content: c.content,
                    rationale: c.rationale,
                }))
            )}
      `;

            inserted.push({ row, sourceId: original.id });
        }
        return inserted;
    });

    // For RC the whole set is saved; return the counterpart of the question we sampled
    return rows.find((r) => r.sourceId === source.id).row;
}

// ---------- handler ----------

export default async function handler({ db, user, ai, payments }) { if (typeof payments?.features?.questions === "number" && payments.features.questions <= 0) { return new Response(JSON.stringify({ error: "Question quota exhausted" }), { status: 403, headers: { "Content-Type": "application/json" } }); }
    const target = await getTarget({ db, user });
    const { subtype, difficulty } = target;

    let [question] = await db`
    SELECT id, type, subtype, difficulty
    FROM questions
    WHERE subtype = ${subtype}
      AND difficulty = ${difficulty}
      AND id NOT IN (
        SELECT question_id FROM answers WHERE user_id = ${user.id}
      )
    ORDER BY random()
    LIMIT 1
  `;

    // Nothing unseen for this target, so generate a fresh one
    if (!question) {
        question = await generateQuestion({ db, model: ai.model, target }); if (!question) { return new Response(JSON.stringify({ error: "No questions are available. The database needs seeding." }), { status: 404, headers: { "Content-Type": "application/json" } }); }
    }

    return {
        id: question.id,
        type: question.type,
        subtype: question.subtype,
        difficulty: question.difficulty, questionsRemaining: payments?.features?.questions, messagesRemaining: payments?.features?.messages,
    };
}
