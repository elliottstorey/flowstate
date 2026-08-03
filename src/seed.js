import fs from "fs/promises";
import path from "path";

async function seedTests(db) {
    // Check if tests already exist. postgres.js returns counts as strings, so we cast to int.
    const [{ count }] = await db`SELECT count(*)::int FROM tests`;

    if (count > 0) {
        console.log(`[SKIP] Found ${count} tests in DB. Skipping tests seed.`);
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
                    const [{ id: testId }] = await tx`INSERT INTO tests (name) VALUES (${test.name}) RETURNING id`;

                    await Promise.all(test.sections.filter(s => s.number <= 4).map(async (sec) => {
                        const [{ id: secId }] = await tx`
                            INSERT INTO sections (test_id, number, type, is_variable)
                            VALUES (${testId}, ${sec.number}, ${sec.type}, ${sec.is_variable}) RETURNING id`;

                        const pMap = {};
                        if (sec.type === 'Reading Comprehension') {
                            await Promise.all(sec.passages.map(async (p) => {
                                const [{ id: pId }] = await tx`INSERT INTO passages (text) VALUES (${p.text}) RETURNING id`;
                                pMap[p.number] = pId;
                                await tx`INSERT INTO section_passages (section_id, passage_id, number) VALUES (${secId}, ${pId}, ${p.number})`;
                            }));
                        }

                        await Promise.all(sec.questions.map(async (q) => {
                            const isLR = sec.type === 'Logical Reasoning';
                            const [{ id: qId }] = await tx`
                                INSERT INTO questions (type, subtype, passage_id, stimulus, stem, answer, difficulty) 
                                VALUES (${sec.type}, ${q.subtype}, ${isLR ? null : pMap[q.passage_number]}, ${isLR ? q.stimulus : null}, ${q.stem}, ${q.answer}, ${q.difficulty}) RETURNING id`;

                            await tx`INSERT INTO section_questions (section_id, question_id, number) VALUES (${secId}, ${qId}, ${q.number})`;

                            if (q.choices?.length) {
                                const choices = q.choices.map(c => ({ question_id: qId, ...c }));
                                await tx`INSERT INTO choices ${tx(choices, 'question_id', 'letter', 'text', 'rationale')}`;
                            }
                        }));
                    }));
                });
                console.log(`[OK] ${test.name} seeded`);
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

    const lessonsDir = path.join(process.cwd(), 'data', 'library', 'lessons');
    console.log(`Scanning ${lessonsDir}...`);

    try {
        const files = await fs.readdir(lessonsDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        if (jsonFiles.length === 0) {
            console.log(`[SKIP] No JSON lesson files found.`);
            return;
        }

        for (const file of jsonFiles) {
            try {
                const filePath = path.join(lessonsDir, file);
                const rawData = await fs.readFile(filePath, 'utf-8');
                const lesson = JSON.parse(rawData);

                await db`
                    INSERT INTO lessons (title, type, subtype, content) 
                    VALUES (${lesson.title}, ${lesson.type}, ${lesson.subtype}, ${lesson.content})
                `;
                console.log(`[OK] Lesson seeded: ${lesson.title}`);
            } catch (err) {
                console.error(`[FAIL] Error seeding lesson [${file}]:`, err.message);
            }
        }
    } catch (err) {
        console.error(`[SKIP] Could not read lessons directory at ${lessonsDir}`);
    }
}

export default async function seed({ db }) {
    console.log("Starting seed process...");

    await seedTests(db);
    await seedLessons(db);

    console.log('Pipeline complete.');
}