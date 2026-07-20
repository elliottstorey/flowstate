import { subtypeWeights } from "#lib/lsat";

const GLOBAL_QUESTIONS_PER_POINT = 60;
const GOAL_SCORE = 180;

async function handler({ db, user }) {
    let currentRaw = 0;
    let baselineRaw = 0;
    let currentConfidence = 0;

    // 1. Fetch Current (DESC) and Baseline (ASC) answers in parallel for speed
    const subtypePromises = Object.entries(subtypeWeights).map(async ([subtype, weight]) => {
        const [currentAnswers, baselineAnswers] = await Promise.all([
            // Newest answers for current predicted score
            db`
                SELECT a.selected_choice, q.answer
                FROM answers a JOIN questions q ON a.question_id = q.id
                WHERE a.user_id = ${user.id} AND q.subtype = ${subtype}
                ORDER BY a.answered_at DESC LIMIT ${weight};
            `,
            // Oldest answers for the starting baseline score
            db`
                SELECT a.selected_choice, q.answer
                FROM answers a JOIN questions q ON a.question_id = q.id
                WHERE a.user_id = ${user.id} AND q.subtype = ${subtype}
                ORDER BY a.answered_at ASC LIMIT ${weight};
            `
        ]);
        return { weight, currentAnswers, baselineAnswers };
    });

    const processedSubtypes = await Promise.all(subtypePromises);

    // 2. Calculate both raw scores
    for (const { weight, currentAnswers, baselineAnswers } of processedSubtypes) {
        // Calculate Current
        const currentCorrect = currentAnswers.filter(a => a.selected_choice === a.answer).length;
        const currentAccuracy = (currentCorrect + (0.5 * (weight - currentAnswers.length))) / weight;
        currentRaw += weight * currentAccuracy;
        currentConfidence += currentAnswers.length;

        // Calculate Baseline
        const baselineCorrect = baselineAnswers.filter(a => a.selected_choice === a.answer).length;
        const baselineAccuracy = (baselineCorrect + (0.5 * (weight - baselineAnswers.length))) / weight;
        baselineRaw += weight * baselineAccuracy;
    }

    // Apply your LSAT curve formula
    const calculateScaled = (raw) => Math.max(120, Math.min(180, 120 + Math.round((raw - 11) * 0.93 + 3.5 * Math.sin((raw / 75) * Math.PI))));

    const predicted = calculateScaled(currentRaw);
    const baseline = calculateScaled(baselineRaw);
    const confidence = currentConfidence / 76;

    // 3. Fetch Velocity and Total Volume
    const [stats] = await db`
        SELECT 
            COUNT(*) as total_answered,
            COUNT(*) FILTER (WHERE answered_at >= NOW() - INTERVAL '7 days') as this_week,
            COUNT(*) FILTER (WHERE answered_at >= NOW() - INTERVAL '14 days' AND answered_at < NOW() - INTERVAL '7 days') as last_week
        FROM answers
        WHERE user_id = ${user.id};
    `;

    const totalAnswered = Number(stats?.total_answered || 0);
    const currentWeekCount = Number(stats?.this_week || 0);
    const lastWeekCount = Number(stats?.last_week || 0);

    // 4. Compute Progress Metrics
    const pointsSinceStart = Math.max(0, predicted - baseline);

    // Find the next multiple of 5 (e.g., if score is 162, milestone is 165)
    let nextMilestone = Math.ceil((predicted + 1) / 5) * 5;
    if (nextMilestone > GOAL_SCORE) nextMilestone = GOAL_SCORE;

    const pointsToMilestone = nextMilestone - predicted;

    // Personalize the grind rate if they have enough data
    let questionsPerPoint = GLOBAL_QUESTIONS_PER_POINT;
    if (pointsSinceStart >= 2 && totalAnswered > 100) {
        questionsPerPoint = Math.round(totalAnswered / pointsSinceStart);
    }

    const questionsToMilestone = pointsToMilestone * questionsPerPoint;

    return {
        predicted,
        confidence,
        progress: {
            points: pointsSinceStart
        },
        velocity: {
            currentWeek: currentWeekCount,
            lastWeek: lastWeekCount
        },
        distance: {
            questionsLeft: questionsToMilestone,
            nextMilestone: nextMilestone
        }
    };
}

export default handler;