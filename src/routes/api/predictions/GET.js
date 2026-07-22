import { subtypeWeights } from "#lib/lsat";

const GLOBAL_QUESTIONS_PER_POINT = 60;
const GOAL_SCORE = 180;

export default async function handler({ db, user }) {
    let currentRaw = 0, baselineRaw = 0, currentConfidence = 0;

    // 1. Fetch Current (DESC) and Baseline (ASC) answers in parallel
    const processedSubtypes = await Promise.all(
        Object.entries(subtypeWeights).map(async ([subtype, weight]) => {
            const [current, baseline] = await Promise.all([
                db`SELECT a.selected_choice, q.answer FROM answers a JOIN questions q ON a.question_id = q.id WHERE a.user_id = ${user.id} AND q.subtype = ${subtype} ORDER BY a.answered_at DESC LIMIT ${weight}`,
                db`SELECT a.selected_choice, q.answer FROM answers a JOIN questions q ON a.question_id = q.id WHERE a.user_id = ${user.id} AND q.subtype = ${subtype} ORDER BY a.answered_at ASC LIMIT ${weight}`
            ]);
            return { weight, current, baseline };
        })
    );

    // 2. Calculate Raw Scores
    for (const { weight, current, baseline } of processedSubtypes) {
        // Helper to calculate accuracy + guessing baseline for missing questions
        const calcRaw = (answers) => (answers.filter(a => a.selected_choice === a.answer).length + (0.5 * (weight - answers.length))) / weight;
        
        currentRaw += weight * calcRaw(current);
        baselineRaw += weight * calcRaw(baseline);
        currentConfidence += current.length;
    }

    const scale = (raw) => Math.max(120, Math.min(180, 120 + Math.round((raw - 11) * 0.93 + 3.5 * Math.sin((raw / 75) * Math.PI))));

    const predicted = scale(currentRaw);
    const baseline = scale(baselineRaw);
    const confidence = currentConfidence / 76; // Assumes 76 is total test weight

    // 3. Fetch Velocity and Total Volume
    const [stats] = await db`
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE answered_at >= NOW() - INTERVAL '7 days') as curr_week,
            COUNT(*) FILTER (WHERE answered_at >= NOW() - INTERVAL '14 days' AND answered_at < NOW() - INTERVAL '7 days') as prev_week
        FROM answers
        WHERE user_id = ${user.id};
    `;

    // 4. Compute Progress & Milestones
    const totalAnswered = Number(stats?.total || 0);
    const pointsGained = Math.max(0, predicted - baseline);
    const score = Math.min(GOAL_SCORE, Math.ceil((predicted + 1) / 5) * 5);
    
    // Personalize grind rate if enough historical data exists
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
            questionsRemaining: (score - predicted) * questionsPerPoint
        }
    };
}