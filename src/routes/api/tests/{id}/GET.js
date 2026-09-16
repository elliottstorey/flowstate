async function handler({ db, user, params }) {
    const { id } = params;

    const [test] = await db`
        select id, completed_at, raw_score, scaled_score 
        from tests 
        where id = ${id} and user_id = ${user.id}
    `;

    if (!test) throw new Error("Test not found");

    // 2. Fetch the sections
    const sections = await db`
        select id, position, type, variable, completed_at
        from sections 
        where test_id = ${test.id} 
        order by position asc
    `;

    // 3. Fetch all answers, questions, and passages (OMITTING the `answer` column)
    const answersData = await db`
        select 
            a.id as answer_id, a.section_id, a.position, a.selected_choice,
            q.id as question_id, q.type, q.subtype, q.stimulus, q.stem,
            p.id as passage_id, p.content as passage_content
        from answers a
        join questions q on a.question_id = q.id
        left join passages p on q.passage_id = p.id
        where a.section_id in (select id from sections where test_id = ${test.id})
        order by a.position asc
    `;

    // 4. Fetch all choices for those questions (OMITTING the `rationale` column)
    const choices = await db`
        select id, question_id, letter, content
        from choices
        where question_id in (
            select question_id from answers a
            join sections s on a.section_id = s.id
            where s.test_id = ${test.id}
        )
        order by letter asc
    `;

    // ==========================================
    // JS LOGIC: Stitch it all together
    // ==========================================

    // Group choices by their question_id
    const choicesByQuestion = {};
    for (const choice of choices) {
        if (!choicesByQuestion[choice.question_id]) {
            choicesByQuestion[choice.question_id] = [];
        }
        choicesByQuestion[choice.question_id].push(choice);
    }

    // Group answers by their section_id, formatting the nested objects
    const answersBySection = {};
    for (const row of answersData) {
        const formattedAnswer = {
            id: row.answer_id,
            position: row.position,
            selected_choice: row.selected_choice,
            question: {
                id: row.question_id,
                type: row.type,
                subtype: row.subtype,
                stimulus: row.stimulus,
                stem: row.stem,
                // Only attach passage object if it's Reading Comprehension
                passage: row.passage_id
                    ? { id: row.passage_id, content: row.passage_content }
                    : null,
                choices: choicesByQuestion[row.question_id] || []
            }
        };

        if (!answersBySection[row.section_id]) {
            answersBySection[row.section_id] = [];
        }
        answersBySection[row.section_id].push(formattedAnswer);
    }

    // Attach the grouped answers to their respective sections
    for (const section of sections) {
        section.answers = answersBySection[section.id] || [];
    }

    // Attach sections to the main test object
    test.sections = sections;

    return test;
}

export default handler;