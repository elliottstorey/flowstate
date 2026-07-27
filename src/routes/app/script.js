const DOM = {
    dayPeriod: document.getElementById("day-period"),
    name: document.getElementById("name"),
    start: document.getElementById("start"),
    subscribe: document.getElementById("subscribe"),
    answers: document.getElementById("answers"),
    predicted: document.getElementById("predicted"),
    predictedMeter: document.getElementById("predicted-meter"),
    predictedContext: document.getElementById("predicted-context"),
    progress: document.getElementById("progress"),
    progressMeter: document.getElementById("progress-meter"),
    progressContext: document.getElementById("progress-context"),
    velocity: document.getElementById("velocity"),
    velocityContext: document.getElementById("velocity-context"),
    distance: document.getElementById("distance"),
    distanceContext: document.getElementById("distance-context")
};

function dayPeriod() {
    const hours = new Date().getHours();
    const period = hours < 12 ? "morning" : hours < 17 ? "afternoon" : hours < 21 ? "evening" : "night";
    DOM.dayPeriod.textContent = `${new Intl.DateTimeFormat("en-US", { weekday: "long" }).format()} ${period}`;
}

async function predictions() {
    const setFill = (element, percentage) => element?.style.setProperty("--fill", `${Math.max(0, Math.min(100, percentage))}%`);

    const response = await fetch("/api/predictions");
    if (!response.ok) return;

    const { predicted, confidence, baseline, questions, milestone } = await response.json();

    // predicted

    const predictedMeter = (predicted - 120) / (180 - 120) * 100;
    DOM.predicted.innerText = `${predicted}`;
    setFill(DOM.predictedMeter, predictedMeter);
    DOM.predictedContext.innerText = `started at ${baseline}`;

    // progress

    const progress = predicted - baseline;
    const progressMeter = (predicted - baseline) / (180 - baseline) * 100;
    DOM.progress.innerText = `${progress}`;
    setFill(DOM.progressMeter, progressMeter);
    DOM.progressContext.innerText = `since you started`;

    // velocity

    const { currWeek, prevWeek } = questions;
    const trend = currWeek > prevWeek ? "up from" : currWeek < prevWeek ? "down from" : "even with";
    DOM.velocity.innerText = `${questions.currWeek}`;
    DOM.velocityContext.innerText = `${trend} +${prevWeek} last week`;

    // distance

    const { score, questionsRemaining } = milestone;
    DOM.distance.innerText = `${questionsRemaining}`;
    DOM.distanceContext.innerText = `remaining to reach ${score}`;

    // non-confident stats

    if (confidence < 0.5) {
        const questions = Math.ceil(76 * (0.5 - confidence));
        const progress = (confidence / 0.5) * 100;
        DOM.predicted.classList.add("hidden");
        setFill(DOM.predictedMeter, progress);
        DOM.predictedContext.innerText = `~${questions} questions to unlock initial prediction`;
        DOM.distance.innerText = `${questions}`;
        DOM.distanceContext.innerText = `remaining to unlock initial prediction`;
    } else if (confidence < 1) {
        const questions = Math.ceil(76 * (1 - confidence));
        const progress = ((confidence - 0.5) / 0.5) * 100;
        setFill(DOM.predictedMeter, progress);
        DOM.predictedContext.innerText = `~${questions} questions to reach full confidence`;
        DOM.distance.innerText = `${questions}`;
        DOM.distanceContext.innerText = `remaining to reach full confidence`;
    }
}

async function trial() {
    DOM.name.textContent = $.user.name.split(" ")[0];

    if ($.activeProducts.includes("monthly")) return;

    DOM.answers.innerText = $.features.questions;
    DOM.subscribe.hidden = false;

    if (!$.features.questions) {
        DOM.start.innerText = "🔓 Upgrade now -->";
        DOM.start.onclick = () => $.subscribe("monthly");
    }
}

dayPeriod();
predictions();
trial();