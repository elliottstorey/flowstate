const DOM = {
    tabs: document.querySelectorAll("#tabs button"),
    reference: document.getElementById("reference"),
    passage: document.getElementById("passage"),
    problem: document.getElementById("problem"),
    problemHeading: document.getElementById("problem-heading"),
    stimulus: document.getElementById("stimulus"),
    stem: document.getElementById("stem"),
    choices: document.querySelectorAll(".choice"),
    next: document.getElementById("next")
};

let test = null;
let sIdx = 0; // Section Index
let aIdx = 0; // Answer Index

async function init() {
    // Extract test ID from URL (e.g., /tests/123)
    const testId = window.location.pathname.split('/').pop();

    const res = await fetch(`/api/tests/${testId}`);
    if (!res.ok) return alert("Failed to load test");

    test = await res.json();

    // Smart Resume: Find the first unsubmitted section
    sIdx = test.sections.findIndex(s => !s.completed_at);
    if (sIdx === -1) return ($.url = "/app"); // Test is fully complete

    if (!test.sections[sIdx].answers.length) {
        return alert("This practice test has no questions.");
    }

    // Smart Resume: Find the first unanswered question in this section
    aIdx = Math.max(0, test.sections[sIdx].answers.findIndex(a => !a.selected_choice));

    render();
}

function render() {
    const section = test.sections[sIdx];
    const answer = section.answers[aIdx];
    if (!answer || !answer.question) {
        return alert("This practice test question could not be loaded.");
    }
    const q = answer.question;

    // 1. Text Content
    const sectionNumber = section.position ?? section.number ?? sIdx + 1;
    DOM.problemHeading.innerText = `Section ${sectionNumber} — Question ${aIdx + 1} of ${section.answers.length}`;
    DOM.stimulus.innerText = q.stimulus || "";
    DOM.stem.innerText = q.stem;

    // 2. Passage Handling (RC vs LR)
    if (q.passage) {
        DOM.reference.hidden = false;
        DOM.passage.innerText = q.passage.content;
        document.querySelector('[data-tab="reference"]').hidden = false;
    } else {
        DOM.reference.hidden = true;
        document.querySelector('[data-tab="reference"]').hidden = true;
    }

    // 3. Choices
    DOM.choices.forEach(btn => {
        const letter = btn.id;
        const choiceData = q.choices.find(c => c.letter === letter);

        btn.querySelector('.content').innerText = choiceData ? choiceData.content : "";
        btn.classList.toggle("selected", answer.selected_choice === letter);

        btn.onclick = () => selectChoice(letter);
    });

    // 4. Next Button State
    if (aIdx === section.answers.length - 1) {
        DOM.next.innerText = sIdx === test.sections.length - 1 ? "Submit Test" : "Submit Section";
    } else {
        DOM.next.innerText = "Next Question -->";
    }
}

async function selectChoice(letter) {
    const answer = test.sections[sIdx].answers[aIdx];
    answer.selected_choice = letter; // Update local state instantly

    // Optimistic UI update
    DOM.choices.forEach(btn => btn.classList.toggle("selected", btn.id === letter));

    // Fire and forget save to backend
    fetch(`/api/answers/${answer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedChoice: letter })
    }).catch(console.error);
}

// Next / Submit Button Logic
DOM.next.onclick = async () => {
    const section = test.sections[sIdx];

    // Normal Next Question
    if (aIdx < section.answers.length - 1) {
        aIdx++;
        render();
        return;
    }

    // Submit Section / Test Logic
    DOM.next.disabled = true;
    DOM.next.innerText = "Submitting...";

    const res = await fetch(`/api/sections/${section.id}/submit`, { method: 'POST' });
    if (!res.ok) return alert("Failed to submit section");

    if (sIdx < test.sections.length - 1) {
        // Move to next section
        sIdx++;
        aIdx = 0;
        DOM.next.disabled = false;
        render();
    } else {
        // Finished the entire test
        await fetch(`/api/tests/${test.id}/submit`, { method: 'POST' });
        $.url = `/app`; // Route back to dashboard
    }
};

// Mobile Tabs Logic
DOM.tabs.forEach(tab => {
    tab.onclick = () => {
        DOM.tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const target = tab.dataset.tab;
        DOM.reference.classList.toggle('tab-off', target !== 'reference');
        DOM.problem.classList.toggle('tab-off', target !== 'problem');
    }
});

// Kick it off
init();