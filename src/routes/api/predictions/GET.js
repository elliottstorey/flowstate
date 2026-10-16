import { subtypeWeights } from "#lib/lsat";

const GLOBAL_QUESTIONS_PER_POINT = 60;
const GOAL_SCORE = 180;
const TOTAL_TEST_WEIGHT = Object.values(subtypeWeights)
    .flat()
    .reduce((sum, w) => sum + w, 0); // 76

export default async function handler({ db, user }) {
    // 1. Fetch ALL answers chronologically in a SINGLE query
    const answers = await db`
        SELECT a.selected_choice, q.answer, q.subtype, q.difficulty
        FROM answers a 
        JOIN questions q ON a.question_id = q.id 
        WHERE a.user_id = ${user.id} 
          AND a.selected_choice IS NOT NULL
        ORDER BY a.created_at ASC
    `;

    // 2. Initialize rolling buffers for each (subtype, difficulty) slot
    const rollingState = {};
    for (const [subtype, weights] of Object.entries(subtypeWeights)) {
        rollingState[subtype] = {
            weights, // e.g., [2, 3, 2, 1] for difficulties 1..4
            history: [[], [], [], []]
        };
    }

    const scale = (raw) => Math.max(120, Math.min(180, 120 + Math.round((raw - 11) * 0.93 + 3.5 * Math.sin((raw / 75) * Math.PI))));

    let minHistoricalScore = 180;
    let hasFilledTest = false;

    // 3. Replay history to find the true lowest score over a rolling window
    for (const { selected_choice, answer, subtype, difficulty } of answers) {
        const state = rollingState[subtype];
        const idx = difficulty - 1; // 0, 1, 2, or 3
        if (!state || !state.weights[idx]) continue;

        const isCorrect = selected_choice === answer;
        const bucket = state.history[idx];
        const maxWeight = state.weights[idx];

        // Push new answer into its specific difficulty slot
        bucket.push(isCorrect);
        if (bucket.length > maxWeight) {
            bucket.shift();
        }

        // Calculate score at this exact moment in time
        let tempRaw = 0;
        let tempConfidence = 0;

        for (const key in rollingState) {
            const { weights, history } = rollingState[key];
            for (let i = 0; i < 4; i++) {
                const weight = weights[i];
                if (weight === 0) continue;

                const correct = history[i].filter(Boolean).length;
                const missing = weight - history[i].length;

                tempRaw += correct + (0.5 * missing);
                tempConfidence += history[i].length;
            }
        }

        if (tempConfidence >= TOTAL_TEST_WEIGHT) {
            hasFilledTest = true;
            const currentScoreAtThisTime = scale(tempRaw);
            if (currentScoreAtThisTime < minHistoricalScore) {
                minHistoricalScore = currentScoreAtThisTime;
            }
        }
    }

    // 4. Extract final state from the buffers
    let currentRaw = 0;
    let currentConfidenceCount = 0;

    for (const key in rollingState) {
        const { weights, history } = rollingState[key];
        for (let i = 0; i < 4; i++) {
            const weight = weights[i];
            if (weight === 0) continue;

            const correct = history[i].filter(Boolean).length;
            const missing = weight - history[i].length;

            currentRaw += correct + (0.5 * missing);
            currentConfidenceCount += history[i].length;
        }
    }

    const predicted = scale(currentRaw);
    const confidence = currentConfidenceCount / TOTAL_TEST_WEIGHT;
    const baseline = hasFilledTest ? minHistoricalScore : predicted;

    // 5. Fetch Velocity and Total Volume
    const [stats] = await db`
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as curr_week,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days') as prev_week
        FROM answers
        WHERE user_id = ${user.id}
          AND selected_choice IS NOT NULL
    `;

    // 6. Compute Progress & Milestones
    const totalAnswered = Number(stats?.total || 0);
    const pointsGained = Math.max(0, predicted - baseline);
    const score = Math.min(GOAL_SCORE, Math.ceil((predicted + 1) / 5) * 5);

    const questionsPerPoint = (pointsGained >= 2 && totalAnswered > 100)
        ? Math.round(totalAnswered / pointsGained)
        : GLOBAL_QUESTIONS_PER_POINT;

    return {
        predicted,
        confidence,
        baseline,
        questions: {
            currWeek: Number(stats?.curr_week || 0),
            prevWeek: Number(stats?.prev_week || 0)
        },
        milestone: {
            score,
            questionsRemaining: Math.max(0, (score - predicted) * questionsPerPoint)
        }
    };
}