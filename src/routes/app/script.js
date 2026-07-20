const DOM = {
    dayPeriod: document.getElementById("day-period"),
    name: document.getElementById("name"),
    start: document.getElementById("start"),
    subscribe: document.getElementById("subscribe"),
    answers: document.getElementById("answers"),
    stats: {
        predicted: {
            metric: document.querySelector('.stat:nth-child(1) .metric'),
            context: document.querySelector('.stat:nth-child(1) .context'),
            meter: document.getElementById('predicted-meter')
        },
        progress: {
            metric: document.querySelector('.stat:nth-child(2) .metric'),
            context: document.querySelector('.stat:nth-child(2) .context'),
            meter: document.getElementById('progress-meter')
        },
        velocity: {
            metric: document.querySelector('.stat:nth-child(3) .metric'),
            context: document.querySelector('.stat:nth-child(3) .context')
        },
        distance: {
            metric: document.querySelector('.stat:nth-child(4) .metric'),
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

async function score() {
    try {
        const response = await fetch("/api/predictions");
        if (!response.ok) throw new Error("Failed to fetch score data");

        const data = await response.json();
        const baseline = data.predicted - data.progress.points;

        // ==========================================
        // 1. VELOCITY
        // ==========================================
        const currentV = data.velocity.currentWeek;
        const lastV = data.velocity.lastWeek;
        
        let vTrendText = 'same as';
        if (currentV > lastV) vTrendText = 'up from';
        else if (currentV < lastV) vTrendText = 'down from';

        DOM.stats.velocity.metric.innerHTML = `<span>${currentV}</span> questions/week`;
        DOM.stats.velocity.context.textContent = `${vTrendText} ${lastV} last week`;

        // ==========================================
        // 2. DYNAMIC STATE MACHINE (1/3 Splits)
        // ==========================================
        
        if (data.confidence < 0.33) {
            
            // --- STATE 1: Calibrating (Clean Empty State) ---
            
            // DISTANCE: Manually calculate questions left to 0.33 threshold (76 total questions)
            const questionsLeft = Math.max(1, Math.round(76 * (0.33 - data.confidence)));
            DOM.stats.distance.metric.innerHTML = `<span>~${questionsLeft}</span> questions`;
            DOM.stats.distance.context.textContent = `left to unlock your score`;

            // PREDICTED: Em-dash format
            DOM.stats.predicted.metric.innerHTML = `<span>—</span> / 180`;
            DOM.stats.predicted.context.textContent = `~${questionsLeft} questions to unlock prediction`;
            
            if (DOM.stats.predicted.meter) {
                const percentCalibrated = Math.min(100, Math.round((data.confidence / 0.33) * 100));
                DOM.stats.predicted.meter.style.setProperty('--fill', `${percentCalibrated}%`);
            }

            // PROGRESS: Em-dash format
            DOM.stats.progress.metric.innerHTML = `<span>—</span> points`;
            DOM.stats.progress.context.textContent = `unlock prediction to start tracking growth`;
            
            if (DOM.stats.progress.meter) {
                DOM.stats.progress.meter.hidden = true;
            }

        } else if (data.confidence < 0.66) {
            
            // --- STATE 2: Sensitive Straight-Mapping ---
            
            // DISTANCE: Manually calculate questions left to 0.66 threshold (76 total questions)
            const questionsLeft = Math.max(1, Math.round(76 * (0.66 - data.confidence)));
            DOM.stats.distance.metric.innerHTML = `<span>~${questionsLeft}</span> questions`;
            DOM.stats.distance.context.textContent = `left to lock in confidence`;

            // PREDICTED: Restores standard format
            DOM.stats.predicted.metric.innerHTML = `<span>${data.predicted}</span> / 180`;
            DOM.stats.predicted.context.textContent = `prediction may fluctuate`;
            
            if (DOM.stats.predicted.meter) {
                const predictedPercent = ((data.predicted - 120) / (180 - 120)) * 100;
                DOM.stats.predicted.meter.style.setProperty('--fill', `${Math.min(100, Math.max(0, predictedPercent))}%`);
            }
            
            // PROGRESS: Unhides and restores standard format
            DOM.stats.progress.metric.innerHTML = `<span>+${data.progress.points}</span> points`;
            DOM.stats.progress.context.textContent = `estimated growth so far`;
            
            if (DOM.stats.progress.meter) {
                DOM.stats.progress.meter.hidden = false;
                const totalPossibleGain = 180 - baseline;
                const progressPercent = totalPossibleGain > 0 ? (data.progress.points / totalPossibleGain) * 100 : 0;
                DOM.stats.progress.meter.style.setProperty('--fill', `${Math.min(100, Math.max(0, progressPercent))}%`);
            }

        } else {
            
            // --- STATE 3: Locked Anchor ---
            
            // DISTANCE: Engine is confident, hand control back to the API for standard milestones
            DOM.stats.distance.metric.innerHTML = `<span>~${data.distance.questionsLeft}</span> questions`;
            DOM.stats.distance.context.textContent = `left to reach ${data.distance.nextMilestone.toLowerCase()}`;

            // PREDICTED: Standard format
            DOM.stats.predicted.metric.innerHTML = `<span>${data.predicted}</span> / 180`;
            DOM.stats.predicted.context.textContent = `started at ${baseline}`;
            
            if (DOM.stats.predicted.meter) {
                const predictedPercent = ((data.predicted - 120) / (180 - 120)) * 100;
                DOM.stats.predicted.meter.style.setProperty('--fill', `${Math.min(100, Math.max(0, predictedPercent))}%`);
            }
            
            // PROGRESS: Standard format
            DOM.stats.progress.metric.innerHTML = `<span>+${data.progress.points}</span> points`;
            DOM.stats.progress.context.textContent = `since you started`;
            
            if (DOM.stats.progress.meter) {
                DOM.stats.progress.meter.hidden = false;
                const totalPossibleGain = 180 - baseline;
                const progressPercent = totalPossibleGain > 0 ? (data.progress.points / totalPossibleGain) * 100 : 0;
                DOM.stats.progress.meter.style.setProperty('--fill', `${Math.min(100, Math.max(0, progressPercent))}%`);
            }
        }

    } catch (error) {
        console.error("Error updating dashboard:", error);
    }
}

async function account() {
    DOM.name.textContent = $.user.name.split(' ')[0];
    if ($.subscriptions.length) return;

    const response = await fetch("/api/account");
    const { answers } = await response.json();

    DOM.answers.innerText = 10 - answers;
    DOM.subscribe.hidden = false;

    if (answers >= 10) {
        DOM.start.innerText = "🔓 Upgrade now -->";
    }
}

dayPeriod();
score();
account();