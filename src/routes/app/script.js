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
    distanceContext: document.getElementById("distance-context"),
    tests: document.getElementById("tests"),
    testStart: document.getElementById("test-start"),
    lessons: document.getElementById("lessons")
};

function dayPeriod() {
    const hours = new Date().getHours();
    const period = hours < 12 ? "morning" : hours < 17 ? "afternoon" : hours < 21 ? "evening" : "night";
    DOM.dayPeriod.textContent = `${new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date())} ${period}`;
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

    DOM.tests.hidden = true;
    DOM.testStart.hidden = true;
    DOM.lessons.hidden = true;

    for (const element of document.getElementsByClassName("trial")) {
        element.hidden = false;
    }
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

async function tests() {
    const response = await fetch("/api/tests");
    if (!response.ok) return;

    // Assumes backend returns tests sorted chronologically (oldest to newest)
    const data = await response.json();

    const listContainer = document.getElementById("tests");
    const parentContainer = document.getElementById("tests-container");

    let html = "";
    let previousScore = null;
    let inProgressTestId = null;
    let testCount = 1;

    for (const test of data) {
        const isCompleted = !!test.completed_at;

        // Track the in-progress test ID for the main button
        if (!isCompleted) {
            inProgressTestId = test.id;
        }

        const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(test.created_at));
        const message = isCompleted ? (test.tutor_message || "Test completed") : "In progress — resume where you left off";

        // Calculate the score delta (+25, -2, etc.) only if completed
        let deltaHtml = "";
        let scoreHtml = `<p class="score">---</p>`;

        if (isCompleted) {
            if (previousScore !== null && test.scaled_score) {
                const delta = test.scaled_score - previousScore;
                const sign = delta > 0 ? "+" : "";
                deltaHtml = `<p class="delta">${sign}${delta}</p>`;
            }
            scoreHtml = `<p class="score">${test.scaled_score || '---'}</p>`;

            // Only update previous score if this test actually has a score
            if (test.scaled_score) previousScore = test.scaled_score;
        }

        html += `
        <div class="test" style="cursor: pointer;" onclick="$.url += '/tests/${test.id}'">
            <div class="summary">
                <p class="title">Practice test ${testCount}</p>
                <p class="date">${date}</p>
                <p class="content">${message}</p>
            </div>
            <div class="details">
                ${deltaHtml}
                ${scoreHtml}
            </div>
        </div>`;

        testCount++;
    }



    // 1. Inject only the tests into the scrollable list container
    listContainer.innerHTML = html;

    if (!data.length) {
        const elem = document.createElement("p");
        elem.innerText = "No past tests. Create your first test now!";
        DOM.tests.append(elem);
    }

    // 2. Handle the CTA Button in the outer parent container
    let btn = document.getElementById("test-start");

    // If the button isn't in the HTML, create it and append it to the parent container
    if (!btn) {
        btn = document.createElement("button");
        btn.id = "test-start";
        parentContainer.appendChild(btn);
    }

    // Update the button text dynamically
    btn.innerText = inProgressTestId ? "Resume practice test" : "New practice test";

    // 3. Wire up the dynamic button click
    btn.onclick = async () => {
        if (inProgressTestId) {
            // Route to the existing test
            $.url += `/tests/${inProgressTestId}`;
        } else {
            // Disable button and show loading state while backend builds the test
            btn.disabled = true;
            btn.innerText = "Building test...";

            const res = await fetch("/api/tests", { method: "POST" });

            if (res.ok) {
                const newTest = await res.json();
                $.url += `/tests/${newTest}`;
            } else {
                btn.disabled = false;
                btn.innerText = "New practice test";
            }
        }
    };
}

async function lessons() {
    const response = await fetch("/api/lessons");
    if (!response.ok) return;

    const data = await response.json();

    for (const lesson of data) {
        const button = document.createElement("button");
        button.onclick = () => $.url += `/lessons/${lesson.id}`;
        button.innerText = lesson.title;
        DOM.lessons.appendChild(button);
    }
}

dayPeriod();
trial();
predictions();
tests();
lessons();