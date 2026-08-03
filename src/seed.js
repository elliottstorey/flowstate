import fs from "fs/promises";
import path from "path";

async function seedLsatContent(db) {
    const [{ count }] = await db`SELECT count(*)::int FROM questions`;

    if (count > 0) {
        console.log(`[SKIP] Found ${count} questions in DB. Skipping LSAT content seed.`);
        return;
    }

    const dataPath = path.join(process.cwd(), 'data', 'lsat_data.json');
    console.log(`Loading ${dataPath}...`);

    try {
        const rawData = await fs.readFile(dataPath, 'utf-8');
        const tests = JSON.parse(rawData);

        for (const test of tests) {
            try {
                await db.begin(async (tx) => {
                    await Promise.all(test.sections.filter(s => s.number <= 4).map(async (sec) => {
                        const pMap = {};

                        if (sec.type === 'Reading Comprehension') {
                            await Promise.all(sec.passages.map(async (p) => {
                                const [{ id: pId }] = await tx`INSERT INTO passages (content) VALUES (${p.text}) RETURNING id`;
                                pMap[p.number] = pId;
                            }));
                        }

                        await Promise.all(sec.questions.map(async (q) => {
                            const isLR = sec.type === 'Logical Reasoning';

                            const [{ id: qId }] = await tx`
                                INSERT INTO questions (type, subtype, passage_id, stimulus, stem, answer, difficulty) 
                                VALUES (${sec.type}, ${q.subtype}, ${isLR ? null : pMap[q.passage_number]}, ${isLR ? q.stimulus : null}, ${q.stem}, ${q.answer}, ${q.difficulty}) RETURNING id`;

                            if (q.choices?.length) {
                                const choices = q.choices.map(c => ({
                                    question_id: qId,
                                    letter: c.letter,
                                    content: c.text,
                                    rationale: c.rationale
                                }));
                                await tx`INSERT INTO choices ${tx(choices, 'question_id', 'letter', 'content', 'rationale')}`;
                            }
                        }));
                    }));
                });
                console.log(`[OK] Content from ${test.name} seeded`);
            } catch (err) {
                console.error(`[FAIL] DB Error [${test.name}]:`, err.message);
            }
        }
    } catch (err) {
        console.error(`[SKIP] Could not read test data at ${dataPath}`);
    }
}

async function seedLessons(db) {
    const [{ count }] = await db`SELECT count(*)::int FROM lessons`;

    if (count > 0) {
        console.log(`[SKIP] Found ${count} lessons in DB. Skipping lessons seed.`);
        return;
    }

    const lessonsFile = path.join(process.cwd(), 'data', 'lessons.json');
    console.log(`Loading ${lessonsFile}...`);

    try {
        const rawData = await fs.readFile(lessonsFile, 'utf-8');
        const lessons = JSON.parse(rawData);

        if (lessons.length === 0) {
            console.log(`[SKIP] No lessons found in JSON.`);
            return;
        }

        for (const lesson of lessons) {
            try {
                await db`
                    INSERT INTO lessons (title, type, subtype, content) 
                    VALUES (${lesson.title}, ${lesson.type}, ${lesson.subtype}, ${lesson.content})
                `;
                console.log(`[OK] Lesson seeded: ${lesson.title}`);
            } catch (err) {
                console.error(`[FAIL] Error seeding lesson [${lesson.title}]:`, err.message);
            }
        }
    } catch (err) {
        console.error(`[SKIP] Could not read lessons file at ${lessonsFile}`);
    }
}

export default async function seed({ db }) {
    console.log("Starting seed process...");

    await seedLsatContent(db);
    await seedLessons(db);

    console.log('Pipeline complete.');
}