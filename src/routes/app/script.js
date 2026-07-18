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

async function score() {
    try {
        const response = await fetch("/api/score");
        if (!response.ok) throw new Error("Failed to fetch score data");

        const data = await response.json();
        const baseline = data.predicted - data.progress.points;

        // ==========================================
        // 1. VELOCITY (Always active, supports ==)
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
            
            // --- STATE 1: Calibrating (0% - 33%) ---
            // Distance is hijacked to show a strict percentage of calibration progress
            const percentCalibrated = Math.min(100, Math.round((data.confidence / 0.33) * 100));
            DOM.stats.distance.value.textContent = `${percentCalibrated}%`;
            DOM.stats.distance.context.textContent = `calibration complete`;

            // Predictive metrics are locked with a clean ?
            DOM.stats.predicted.value.textContent = "?";
            DOM.stats.predicted.context.textContent = `Calculating initial baseline...`;
            
            DOM.stats.progress.value.textContent = "?";
            DOM.stats.progress.context.textContent = `Calculating initial baseline...`;

            // Meters act as a loading bar for the calibration phase
            if (DOM.stats.predicted.meter) {
                DOM.stats.predicted.meter.style.setProperty('--fill', `${percentCalibrated}%`);
                DOM.stats.predicted.meter.style.opacity = "1.0"; 
            }
            if (DOM.stats.progress.meter) {
                DOM.stats.progress.meter.style.setProperty('--fill', `${percentCalibrated}%`);
                DOM.stats.progress.meter.style.opacity = "1.0";
            }

        } else if (data.confidence < 0.66) {
            
            // --- STATE 2: Sensitive Straight-Mapping (33% - 66%) ---
            // Distance switches back to standard milestone tracking
            DOM.stats.distance.value.textContent = `~${data.distance.questionsLeft}`;
            DOM.stats.distance.context.textContent = `left to reach ${data.distance.nextMilestone}`;

            // Score is mapped but dimmed
            DOM.stats.predicted.value.textContent = data.predicted;
            DOM.stats.predicted.value.style.opacity = "0.4";
            DOM.stats.predicted.context.textContent = `Engine highly sensitive. Keep practicing.`;
            
            // Progress is mapped but dimmed
            DOM.stats.progress.value.textContent = `+${data.progress.points}`;
            DOM.stats.progress.value.style.opacity = "0.4";
            DOM.stats.progress.context.textContent = `Estimated points gained`;

            // Meters map to actual scale, but visually dimmed to match text
            if (DOM.stats.predicted.meter) {
                const predictedPercent = ((data.predicted - 120) / (180 - 120)) * 100;
                DOM.stats.predicted.meter.style.setProperty('--fill', `${Math.min(100, Math.max(0, predictedPercent))}%`);
                DOM.stats.predicted.meter.style.opacity = "0.4";
            }
            if (DOM.stats.progress.meter) {
                const totalPossibleGain = 180 - baseline;
                const progressPercent = totalPossibleGain > 0 ? (data.progress.points / totalPossibleGain) * 100 : 0;
                DOM.stats.progress.meter.style.setProperty('--fill', `${Math.min(100, Math.max(0, progressPercent))}%`);
                DOM.stats.progress.meter.style.opacity = "0.4";
            }

        } else {
            
            // --- STATE 3: Locked Anchor (66%+) ---
            DOM.stats.distance.value.textContent = `~${data.distance.questionsLeft}`;
            DOM.stats.distance.context.textContent = `left to reach ${data.distance.nextMilestone}`;

            // Metrics reach full opacity
            DOM.stats.predicted.value.textContent = data.predicted;
            DOM.stats.predicted.value.style.opacity = "1.0"; 
            DOM.stats.predicted.context.textContent = `Confidence threshold reached. Started at ${baseline}.`;
            
            DOM.stats.progress.value.textContent = `+${data.progress.points}`;
            DOM.stats.progress.value.style.opacity = "1.0";
            DOM.stats.progress.context.textContent = `Points since baseline`;

            // Meters map to actual scale, full opacity
            if (DOM.stats.predicted.meter) {
                const predictedPercent = ((data.predicted - 120) / (180 - 120)) * 100;
                DOM.stats.predicted.meter.style.setProperty('--fill', `${Math.min(100, Math.max(0, predictedPercent))}%`);
                DOM.stats.predicted.meter.style.opacity = "1.0";
            }
            if (DOM.stats.progress.meter) {
                const totalPossibleGain = 180 - baseline;
                const progressPercent = totalPossibleGain > 0 ? (data.progress.points / totalPossibleGain) * 100 : 0;
                DOM.stats.progress.meter.style.setProperty('--fill', `${Math.min(100, Math.max(0, progressPercent))}%`);
                DOM.stats.progress.meter.style.opacity = "1.0";
            }
        }

    } catch (error) {
        console.error("Error updating dashboard:", error);
    }
}

dayPeriod();
score();