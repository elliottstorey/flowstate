const DOM = {
    dayPeriod: document.getElementById("day-period"),
    stats: {
        predicted: {
            value: document.querySelector('.stat:nth-child(1) .metric span'),
            context: document.querySelector('.stat:nth-child(1) .context'),
            meter: document.getElementById('predicted-meter')
        },
        progress: {
            value: document.querySelector('.stat:nth-child(2) .metric span'),
            context: document.querySelector('.stat:nth-child(2) .context'),
            meter: document.getElementById('progress-meter')
        },
        velocity: {
            metric: document.querySelector('.stat:nth-child(3) .metric'),
            context: document.querySelector('.stat:nth-child(3) .context')
        },
        distance: {
            value: document.querySelector('.stat:nth-child(4) .metric span'),
            context: document.querySelector('.stat:nth-child(4) .context')
        }
    }
};

function dayPeriod() {
    const now = new Date();
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now);

    const hour = now.getHours(); // Returns 0-23
    let period;

    if (hour >= 5 && hour < 12) {
        period = 'morning';
    } else if (hour >= 12 && hour < 17) {
        period = 'afternoon';
    } else if (hour >= 17 && hour < 21) {
        period = 'evening';
    } else {
        period = 'night';
    }

    DOM.dayPeriod.textContent = `${day} ${period}`;
}

// Require them to answer roughly 20 questions before unlocking predictions
const CONFIDENCE_THRESHOLD = 0.25;
const FULL_TEST_QUESTIONS = 76;

async function score() {
    try {
        const response = await fetch("/api/score");
        if (!response.ok) throw new Error("Failed to fetch score data");

        const data = await response.json();

        // --- 1. HANDLE LOW CONFIDENCE (CALIBRATING STATE) ---
        if (data.confidence < CONFIDENCE_THRESHOLD) {
            const questionsRemaining = Math.ceil((CONFIDENCE_THRESHOLD - data.confidence) * FULL_TEST_QUESTIONS);
            const percentComplete = (data.confidence / CONFIDENCE_THRESHOLD) * 100;

            // Mask Predicted Score
            DOM.stats.predicted.value.textContent = "?";
            DOM.stats.predicted.context.textContent = `Answer ~${questionsRemaining} more questions for prediction`;
            if (DOM.stats.predicted.meter) DOM.stats.predicted.meter.style.setProperty('--fill', `${Math.min(100, Math.max(0, percentComplete))}%`);

            // Mask Progress
            DOM.stats.progress.value.textContent = "?";
            DOM.stats.progress.context.textContent = `Answer ~${questionsRemaining} more questions for prediction`;
            if (DOM.stats.progress.meter) DOM.stats.progress.meter.style.setProperty('--fill', `${Math.min(100, Math.max(0, percentComplete))}%`);

            // Velocity can still show! (Questions/week is a pure volume metric)
            const currentV = data.velocity.currentWeek;
            const lastV = data.velocity.lastWeek;
            const vTrend = currentV >= lastV ? 'up' : 'down';
            DOM.stats.velocity.metric.innerHTML = `<span>?</span> questions/week`;
            DOM.stats.velocity.context.textContent = `Answer ~${questionsRemaining} more questions for prediction`;

            // Mask Distance
            DOM.stats.distance.value.textContent = `?`;
            DOM.stats.distance.context.textContent = `Answer ~${questionsRemaining} more questions for prediction`;

            return; // Exit early so we don't render the calculated values below
        }

        // --- 2. HANDLE HIGH CONFIDENCE (NORMAL STATE) ---

        // Predicted Score
        const baseline = data.predicted - data.progress.points;
        DOM.stats.predicted.value.textContent = data.predicted;
        DOM.stats.predicted.context.textContent = `Started at ${baseline}`;

        if (DOM.stats.predicted.meter) {
            const predictedPercent = ((data.predicted - 120) / (180 - 120)) * 100;
            DOM.stats.predicted.meter.style.width = `${Math.min(100, Math.max(0, predictedPercent))}%`;
        }

        // Progress
        DOM.stats.progress.value.textContent = `+${data.progress.points}`;

        if (DOM.stats.progress.meter) {
            const totalPossibleGain = 180 - baseline;
            const progressPercent = totalPossibleGain > 0 ? (data.progress.points / totalPossibleGain) * 100 : 0;
            DOM.stats.progress.meter.style.width = `${Math.min(100, Math.max(0, progressPercent))}%`;
        }

        // Velocity 
        const currentV = data.velocity.currentWeek;
        const lastV = data.velocity.lastWeek;
        const vTrend = currentV >= lastV ? 'up' : 'down';

        DOM.stats.velocity.metric.innerHTML = `<span>${currentV}</span> questions/week`;
        DOM.stats.velocity.context.textContent = `${vTrend} from ${lastV} last week`;

        // Distance
        DOM.stats.distance.value.textContent = `~${data.distance.questionsLeft}`;
        DOM.stats.distance.context.textContent = `left to reach ${data.distance.nextMilestone}`;

    } catch (error) {
        console.error("Error updating dashboard:", error);
    }
}

dayPeriod();
score();