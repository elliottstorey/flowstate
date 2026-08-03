import { scale } from "#lib/lsat";

async function handler({ db, user, params }) {
    const { id } = params;

    return await db.begin(async tx => {
        // 1. Verify test belongs to user and isn't already graded
        const [test] = await tx`
            select id, completed_at from tests 
            where id = ${id} and user_id = ${user.id}
        `;

        if (!test) throw new Error("Test not found");
        if (test.completed_at) throw new Error("Test already submitted");

        // 2. Fetch user's answers joined with the CORRECT answers and section data
        const gradedAnswers = await tx`
            select 
                a.id as answer_id, 
                a.selected_choice, 
                q.answer as correct_choice,
                s.variable as is_experimental
            from answers a
            join questions q on a.question_id = q.id
            join sections s on a.section_id = s.id
            where s.test_id = ${id}
        `;

        // 3. Calculate Raw Score (in Javascript)
        let rawScore = 0;
        let totalScoredQuestions = 0;

        for (const ans of gradedAnswers) {
            // Ignore the experimental section!
            if (ans.is_experimental) continue;

            totalScoredQuestions++;

            // If they got it right, add a point
            if (ans.selected_choice === ans.correct_choice) {
                rawScore++;
            }
        }

        // 4. Calculate Scaled Score (120 - 180)
        let scaledScore = scale(rawScore)

        // Ensure standard bounds
        if (scaledScore > 180) scaledScore = 180;
        if (scaledScore < 120) scaledScore = 120;

        // 5. Save the final results and lock the test
        const [finalTest] = await tx`
            update tests
            set 
                raw_score = ${rawScore},
                scaled_score = ${scaledScore},
                completed_at = now()
            where id = ${id}
            returning id, raw_score, scaled_score, completed_at
        `;

        // Optional MVP cleanup: Lock all sections too
        await tx`
            update sections 
            set completed_at = now() 
            where test_id = ${id} and completed_at is null
        `;

        return finalTest;
    });
}

export default handler;