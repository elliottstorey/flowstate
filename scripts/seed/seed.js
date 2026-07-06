import fs from 'node:fs/promises';
import postgres from 'postgres';

// Initialize the database connection
const sql = postgres('postgresql://postgres:password@localhost:5432/postgres', {
    max: 10,
});

async function seed() {
    try {
        console.log('📖 Loading lsat_data.json...');
        // Make sure the path accurately points to where your python script dumps the JSON
        const rawData = await fs.readFile('./scraper/lsat_data.json', 'utf-8');
        const tests = JSON.parse(rawData);

        console.log(`🚀 Starting database seed for ${tests.length} tests...`);

        // Wrap the entire seed in a transaction to ensure data integrity
        await sql.begin(async (tx) => {
            
            for (const test of tests) {
                console.log(`\n▶ Seeding ${test.name}`);

                // 1. Insert Test
                const [{ id: testId }] = await tx`
                    INSERT INTO tests (name)
                    VALUES (${test.name})
                    RETURNING id
                `;

                for (const section of test.sections) {
                    
                    // ⚠️ Note on Constraints: 
                    // Your schema has: "number integer not null check (number between 1 and 4)".
                    // LawHub PrepTests sometimes contain a 5th variable section. 
                    // If your scraper passes section.number = 5, this will throw an error.
                    // Make sure your JSON data complies with the 1-4 rule!

                    // 2. Insert Section
                    const [{ id: sectionId }] = await tx`
                        INSERT INTO sections (test_id, number, type, is_variable)
                        VALUES (${testId}, ${section.number}, ${section.type}, ${section.is_variable})
                        RETURNING id
                    `;

                    // 3. Handle Passages (Reading Comprehension)
                    const passageIdMap = {}; 
                    
                    if (section.type === 'Reading Comprehension' && section.passages && section.passages.length > 0) {
                        for (const passage of section.passages) {
                            // Insert Independent Passage
                            const [{ id: passageId }] = await tx`
                                INSERT INTO passages (text)
                                VALUES (${passage.text})
                                RETURNING id
                            `;
                            
                            // Map the JSON reference number to the DB ID for Question matching
                            passageIdMap[passage.number] = passageId;

                            // Connect Passage to Section (Junction Table)
                            await tx`
                                INSERT INTO section_passages (section_id, passage_id, number)
                                VALUES (${sectionId}, ${passageId}, ${passage.number})
                            `;
                        }
                    }

                    // 4. Handle Questions
                    for (const q of section.questions) {
                        const isLR = section.type === 'Logical Reasoning';
                        
                        // Strict Constraint Enforcement:
                        // (type = 'Logical Reasoning' and stimulus is not null and passage_id is null) or
                        // (type = 'Reading Comprehension' and passage_id is not null)
                        const dbPassageId = !isLR && q.passage_number ? passageIdMap[q.passage_number] : null;
                        
                        // Enforce stimulus is not null for LR (fallback to empty string if missing in JSON)
                        // Enforce stimulus IS null for RC
                        const dbStimulus = isLR ? (q.stimulus || '') : null;

                        // Insert Independent Question
                        const [{ id: questionId }] = await tx`
                            INSERT INTO questions (
                                type, subtype, passage_id, stimulus, stem, answer, difficulty
                            ) VALUES (
                                ${section.type}, 
                                ${q.subtype}, 
                                ${dbPassageId}, 
                                ${dbStimulus}, 
                                ${q.stem}, 
                                ${q.answer}, 
                                ${q.difficulty}
                            ) RETURNING id
                        `;

                        // Connect Question to Section (Junction Table)
                        await tx`
                            INSERT INTO section_questions (section_id, question_id, number)
                            VALUES (${sectionId}, ${questionId}, ${q.number})
                        `;

                        // 5. Handle Choices
                        if (q.choices && q.choices.length > 0) {
                            const choicesToInsert = q.choices.map(c => ({
                                question_id: questionId,
                                letter: c.letter,
                                text: c.text,
                                rationale: c.rationale || '' // Fallback to satisfy NOT NULL constraint
                            }));

                            // Batch insert all choices for this question
                            await tx`
                                INSERT INTO choices ${tx(choicesToInsert, 'question_id', 'letter', 'text', 'rationale')}
                            `;
                        }
                    }
                    console.log(`  ✓ Section ${section.number} (${section.type}) seeded`);
                }
            }
        });

        console.log('\n✅ Seeding completed successfully!');

    } catch (error) {
        console.error('\n❌ Seeding failed! Transaction rolled back.');
        console.error(error);
    } finally {
        await sql.end();
    }
}

seed();