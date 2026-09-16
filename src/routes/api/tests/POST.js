async function handler({ db, user }) {
    const tests = await db`
        select * from tests
        where user_id = ${user.id}
        and completed_at is null
    `;

    if (tests.length) throw new Error("Complete existing test(s) first!");

    const testId = await db.begin(async tx => {
        const [test] = await tx`
            insert into tests (user_id)
            values (${user.id})
            returning id
        `;

        const variableType = Math.random() > 0.5 ? "Logical Reasoning" : "Reading Comprehension";

        const sections = [
            { type: "Logical Reasoning", variable: false },
            { type: "Logical Reasoning", variable: false },
            { type: "Reading Comprehension", variable: false },
            { type: variableType, variable: true }
        ].sort(() => Math.random() - 0.5);

        let sectionNum = 1;
        for (const secLayout of sections) {
            const [section] = await tx`
                insert into sections (test_id, position, type, variable)
                values (${test.id}, ${sectionNum}, ${secLayout.type}, ${secLayout.variable})
                returning id, type
            `;

            sectionNum++;

            if (section.type === "Logical Reasoning") {
                const questions = await tx`
                    select id, difficulty from questions 
                    where type = 'Logical Reasoning' 
                    and id not in (select question_id from answers where user_id = ${user.id})
                    order by random() limit 25
                `;

                questions.sort((a, b) => a.difficulty - b.difficulty);

                let qPosition = 1;
                for (const question of questions) {
                    await tx`
                        insert into answers (user_id, question_id, section_id, position)
                        values (${user.id}, ${question.id}, ${section.id}, ${qPosition})
                    `;
                    qPosition++;
                }

            } else if (section.type === "Reading Comprehension") {
                // Fix 3: Changed userId to user.id
                const rcQuestions = await tx`
                    with RandomPassages as (
                        select id from passages 
                        where id not in (
                            select p.id from passages p
                            join questions q on q.passage_id = p.id
                            join answers a on a.question_id = q.id
                            where a.user_id = ${user.id}
                        )
                        order by random() limit 4
                    )
                    select id, passage_id, difficulty from questions 
                    where passage_id in (select id from RandomPassages)
                `;

                // Fix 4: The missing RC grouping logic
                // Find the 4 unique passage IDs
                const passageIds = [...new Set(rcQuestions.map(q => q.passage_id))];
                const orderedQuestions = [];

                // Group the questions by passage, sort by difficulty, and push to the final array
                for (const pid of passageIds) {
                    const passageQs = rcQuestions
                        .filter(q => q.passage_id === pid)
                        .sort((a, b) => a.difficulty - b.difficulty);

                    orderedQuestions.push(...passageQs);
                }

                let qPosition = 1;
                for (const question of orderedQuestions) {
                    await tx`
                        insert into answers (user_id, question_id, section_id, position)
                        values (${user.id}, ${question.id}, ${section.id}, ${qPosition})
                    `;
                    qPosition++;
                }
            }
        }

        // Return the test.id out of the transaction block
        return test.id;
    });

    return testId;
}

export default handler;