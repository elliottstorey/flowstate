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
    const h = new Date().getHours();
    const period = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
    DOM.dayPeriod.textContent = `${new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format()} ${period}`;
}

async function score() {
    try {
        const response = await fetch("/api/predictions");
        if (!response.ok) return;

        const { predicted, confidence, baseline, questions, milestone } = await response.json();
        const { predicted: p, progress: pr, velocity: v, distance: d } = DOM.stats;

        // --- 1. VELOCITY (Always standard) ---
        const { currWeek, prevWeek } = questions;
        const vTrend = currWeek > prevWeek ? 'up from' : currWeek < prevWeek ? 'down from' : 'even with';
        
        v.metric.innerHTML = `<span>${currWeek}</span> questions/week`;
        v.context.textContent = `${vTrend} ${prevWeek} last week`;

        // --- 2. DYNAMIC STATE MACHINE ---
        const setFill = (el, pct) => el?.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
        const TOTAL_QS = 76; 

        if (confidence < 0.5) {
            // STATE 1: Calibrating (< 50%)
            const qLeft = Math.max(1, Math.round(TOTAL_QS * (0.5 - confidence)));
            
            p.metric.innerHTML = `<span>🔒</span> / 180`;
            p.context.textContent = `~${qLeft} questions to unlock prediction`;
            setFill(p.meter, (confidence / 0.5) * 100);

            pr.metric.innerHTML = `<span>+0</span> points`;
            pr.context.textContent = `unlock prediction to start tracking progress`;
            if (pr.meter) pr.meter.hidden = true;

            d.metric.innerHTML = `<span>~${qLeft}</span> questions`;
            d.context.textContent = `remaining to unlock your score`;

        } else {
            // SHARED LOGIC: > 50% and 100% 
            const points = Math.max(0, predicted - baseline);

            p.metric.innerHTML = `<span>${predicted}</span> / 180`;
            setFill(p.meter, ((predicted - 120) / 60) * 100);

            pr.metric.innerHTML = `<span>+${points}</span> points`;
            pr.context.textContent = `since you started`;
            
            if (pr.meter) {
                pr.meter.hidden = false;
                setFill(pr.meter, ((predicted - baseline) / (180 - baseline)) * 100 || 0);
            }

            if (confidence < 1) {
                // STATE 2: Calibrated but Unlocked (50% - 99%)
                const qLeft = Math.max(1, Math.round(TOTAL_QS * (1 - confidence)));
                
                p.context.textContent = `~${qLeft} questions to reach high confidence`;
                d.metric.innerHTML = `<span>~${qLeft}</span> questions`;
                d.context.textContent = `remaining to reach high confidence`;

            } else {
                // STATE 3: Fully Locked In (100%)
                p.context.textContent = `started at ${baseline}`;
                d.metric.innerHTML = `<span>~${milestone.questionsRemaining}</span> questions`;
                d.context.textContent = `left to reach ${milestone.score}`;
            }
        }
    } catch (error) {
        console.error("Error updating dashboard:", error);
    }
}

async function account() {
    DOM.name.textContent = $.user.name.split(' ')[0];
    if ($.subscriptions.length) return;

    const { answers } = await (await fetch("/api/account")).json();

    DOM.answers.innerText = Math.max(0, 10 - answers);
    DOM.subscribe.hidden = false;

    if (answers >= 10) DOM.start.innerText = "🔓 Upgrade now -->";
}

dayPeriod();
score();
account();