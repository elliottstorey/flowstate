import { subtypeWeights } from "#lib/lsat";

const GLOBAL_QUESTIONS_PER_POINT = 60;
const GOAL_SCORE = 180;
// Dynamically calculate the total test weight (assumed to be 76)
const TOTAL_TEST_WEIGHT = Object.values(subtypeWeights).reduce((sum, w) => sum + w, 0);

export default async function handler({ db, user }) {
    // 1. Fetch ALL answers chronologically in a SINGLE query
    // This is much faster than running 2 * N queries in parallel
    const answers = await db`
        SELECT a.selected_choice, q.answer, q.subtype 
        FROM answers a 
        JOIN questions q ON a.question_id = q.id 
        WHERE a.user_id = ${user.id} 
        ORDER BY a.created_at ASC
    `;

    // 2. Initialize rolling buffers for each subtype
    const rollingState = {};
    for (const [subtype, weight] of Object.entries(subtypeWeights)) {
        rollingState[subtype] = { weight, history: [] };
    }

    const scale = (raw) => Math.max(120, Math.min(180, 120 + Math.round((raw - 11) * 0.93 + 3.5 * Math.sin((raw / 75) * Math.PI))));

    let minHistoricalScore = 180;
    let hasFilledTest = false;

    // 3. Replay history to find the true lowest score over a rolling window
    for (const { selected_choice, answer, subtype } of answers) {
        if (!rollingState[subtype]) continue; // Ignore obsolete subtypes

        const isCorrect = selected_choice === answer;
        const state = rollingState[subtype];

        // Push new answer, maintain the sliding window size
        state.history.push(isCorrect);
        if (state.history.length > state.weight) {
            state.history.shift();
        }

        // Calculate score at this exact moment in time
        let tempRaw = 0;
        let tempConfidence = 0;

        for (const key in rollingState) {
            const { weight, history } = rollingState[key];
            const correct = history.filter(Boolean).length;
            const missing = weight - history.length;
            
            // Formula: correct + (0.5 for each missing question for guessing baseline)
            tempRaw += weight * ((correct + (0.5 * missing)) / weight);
            tempConfidence += history.length;
        }

        // "After test has been completely filled"
        // Only track the baseline once they've answered a full test's worth of questions
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
        const { weight, history } = rollingState[key];
        const correct = history.filter(Boolean).length;
        const missing = weight - history.length;
        
        currentRaw += weight * ((correct + (0.5 * missing)) / weight);
        currentConfidenceCount += history.length;
    }

    const predicted = scale(currentRaw);
    const confidence = currentConfidenceCount / TOTAL_TEST_WEIGHT;
    
    // If they haven't answered a full test yet, the baseline is just their current predicted score
    const baseline = hasFilledTest ? minHistoricalScore : predicted;

    // 5. Fetch Velocity and Total Volume
    const [stats] = await db`
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as curr_week,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days') as prev_week
        FROM answers
        WHERE user_id = ${user.id};
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