import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import confetti from "https://esm.sh/canvas-confetti@1.9.3";
import DOMPurify from "https://esm.sh/dompurify@3";

const DOM = {
    tabs: document.getElementById("tabs"),
    tabChat: document.getElementById("tab-chat"),
    question: document.getElementById("question"),
    reference: document.getElementById("reference"),
    passage: document.getElementById("passage"),
    problem: document.getElementById("problem"),
    problemHeading: document.getElementById("problem-heading"),
    stimulus: document.getElementById("stimulus"),
    stem: document.getElementById("stem"),
    choices: document.getElementById("choices"),
    choiceButtons: document.querySelectorAll(".choice"),
    showAnswer: document.getElementById("show-answer"),
    next: document.getElementById("next"),
    chat: document.getElementById("chat"),
    messages: document.getElementById("messages"),
    chatInput: document.getElementById("chat-input"),
    messageCounter: document.getElementById("message-counter"),
    messagesLeft: document.getElementById("messages-left"),
    highlight: document.getElementById("highlight")
};

let questionId = null;
let answerId = null;
let questionsCount = 0;
let correctChoiceId = null; // letter of the correct choice for the current question, once known
let selectedChoiceId = null; // letter of the choice the user picked, once known

function updateLimitsUI() {
    if ($.activeProducts.includes("monthly")) {
        DOM.messageCounter.hidden = true;
    } else {
        DOM.messageCounter.hidden = false;
        DOM.messagesLeft.textContent = $.features.messages;
    }
}

// --- Show Answer / Next button state machine -------------------------------

function showAnswerButtonState() {
    DOM.showAnswer.hidden = false;
    DOM.showAnswer.disabled = false;
    DOM.next.hidden = true;
}

function showNextButtonState() {
    DOM.showAnswer.hidden = true;
    DOM.next.hidden = false;
    DOM.next.disabled = false;
}

function hideBothButtons() {
    DOM.showAnswer.hidden = true;
    DOM.showAnswer.disabled = false;
    DOM.next.hidden = true;
    DOM.next.disabled = true;
}

// Reveals the correct choice, the relevant rationale(s), and swaps to the Next button.
function revealAnswer() {
    if (correctChoiceId) {
        const btn = document.getElementById(correctChoiceId);
        if (btn && !btn.classList.contains("correct")) btn.classList.add("correct");
    }

    DOM.choiceButtons.forEach((button) => {
        const rationale = button.querySelector(".rationale");
        const text = rationale?.querySelector(".rationale-text");
        const toggle = rationale?.querySelector(".rationale-toggle");
        if (!rationale || !text || !text.textContent) return;

        rationale.hidden = false;

        // ONLY the correct answer starts expanded; everything else stays collapsed.
        const shouldExpand = button.id === correctChoiceId;

        text.hidden = !shouldExpand;
        toggle.textContent = shouldExpand ? "Hide rationale" : "Show rationale";
    });

    showNextButtonState();
}

// 1. Detect when the user finishes selecting text
document.addEventListener('mouseup', (e) => {
    // Get the current text selection
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // If text is actually selected, show the button
    if (selectedText.length > 0) {
        DOM.highlight.hidden = false;
        // Position the button slightly above the cursor
        DOM.highlight.style.left = `${e.pageX}px`;
        DOM.highlight.style.top = `${e.pageY - 10}px`;
    } else {
        // If no text is selected, hide the button
        DOM.highlight.hidden = true;
    }
});

// 2. Hide the button if the user clicks anywhere else on the page
document.addEventListener('mousedown', (e) => {
    // Check if the click target is NOT the button itself
    if (e.target.id !== 'highlight') {
        DOM.highlight.hidden = true;
    }
});

// 3. Highlight the text when the button is clicked
DOM.highlight.addEventListener('click', () => {
    const selection = window.getSelection();

    // Ensure there is a valid range selected
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);

        // Create a new span element with our highlight class
        const span = document.createElement('span');
        span.className = 'highlighted';

        // Wrap the selected text in the span
        try {
            range.surroundContents(span);
        } catch (error) {
            console.log("Cannot highlight across multiple HTML elements.");
        }

        // Clean up: hide button and clear the selection highlight
        DOM.highlight.hidden = true;
        selection.removeAllRanges();
    }
});

DOM.next.addEventListener("click", next);
DOM.showAnswer.addEventListener("click", revealAnswer);

DOM.choices.addEventListener("click", (event) => {
    // 1. Mask toggle: must come first so it never counts as picking an answer
    const mask = event.target.closest(".mask");
    if (mask) {
        event.stopPropagation();
        if (answerId) return; // locked once answered
        mask.closest(".choice").classList.toggle("masked");
        return;
    }

    const toggle = event.target.closest(".rationale-toggle");
    if (toggle) {
        event.stopPropagation();
        const rationale = toggle.closest(".rationale");
        const text = rationale.querySelector(".rationale-text");
        const isHidden = text.hidden;
        text.hidden = !isHidden;
        toggle.textContent = isHidden ? "Hide rationale" : "Show rationale";
        return;
    }

    const choice = event.target.closest(".choice");
    if (!choice || !questionId || answerId) return;
    if (choice.classList.contains("masked")) return; // can't pick a masked choice
    answer(choice.id);
});

DOM.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    setTab(button.dataset.tab);
});

DOM.chatInput.addEventListener("keydown", (event) => {
    const content = DOM.chatInput.value.trim();
    if (event.key !== "Enter" || content === "") return;
    DOM.chatInput.value = "";
    chat(content);
});

function setTab(tab) {
    DOM.tabs.querySelectorAll("button").forEach((b) =>
        b.classList.toggle("active", b.dataset.tab === tab)
    );
    DOM.reference.classList.toggle("tab-off", tab !== "reference");
    DOM.problem.classList.toggle("tab-off", tab !== "problem");
    DOM.chat.classList.toggle("tab-off", tab !== "chat");
    DOM.question.classList.toggle("tab-off", tab === "chat");
}

function appendUserMessage(content) {
    const msg = document.createElement("p");
    msg.className = "user";
    msg.textContent = content;
    DOM.messages.appendChild(msg);
}

function appendAssistantMessage(content) {
    const msg = document.createElement("div");
    msg.innerHTML = DOMPurify.sanitize(marked.parse(content));
    DOM.messages.appendChild(msg);
}

async function next() {
    DOM.next.disabled = true;

    $.features.questions--;
    questionId = null;
    answerId = null;
    correctChoiceId = null;
    selectedChoiceId = null;

    // Reset UI
    DOM.chat.hidden = true;
    DOM.tabChat.hidden = true;
    DOM.messages.innerHTML = "";
    DOM.choices.classList.remove("locked");
    hideBothButtons();
    DOM.choiceButtons.forEach((button) => {
        button.className = "choice";
        button.disabled = false;
        button.querySelector(".content").textContent = "";
        const rationale = button.querySelector(".rationale");
        const text = rationale.querySelector(".rationale-text");
        const toggle = rationale.querySelector(".rationale-toggle");
        text.textContent = "";
        text.hidden = true;
        toggle.textContent = "Show rationale";
        rationale.hidden = true;
    });

    // 1. Get next question metadata (or resume unreviewed)
    const metaRes = await fetch(`/api/questions/next`);
    const meta = await metaRes.json();

    // 2. Fetch full question state
    const dataRes = await fetch(`/api/questions/${meta.id}`);
    const { passage, question, choices, answer: prevAnswer, messages } = await dataRes.json();

    questionId = question.id;
    answerId = prevAnswer?.id || null;
    correctChoiceId = question.answer;
    questionsCount++;

    DOM.problemHeading.innerText = `Question ${questionsCount} • ${question.type} • ${meta.subtype} • Difficulty ${meta.difficulty}`;

    const isRC = question.type === "Reading Comprehension";
    DOM.tabs.hidden = false;
    DOM.tabs.querySelector('[data-tab="reference"]').hidden = !isRC;
    DOM.reference.hidden = !isRC;
    DOM.stimulus.hidden = isRC;

    setTab("problem");

    if (isRC && passage) {
        DOM.passage.textContent = passage.content;
    } else if (question.stimulus) {
        DOM.stimulus.textContent = question.stimulus;
    }

    DOM.stem.textContent = question.stem;

    choices.forEach((choice) => {
        const button = document.getElementById(choice.letter);
        if (!button) return;
        button.querySelector(".content").textContent = choice.content;
        const rationale = button.querySelector(".rationale");
        if (rationale) {
            rationale.querySelector(".rationale-text").textContent = choice.rationale || "";
        }
    });

    // Restore state if returning to an unreviewed/answered question
    if (prevAnswer) {
        const oldChoice = prevAnswer.selected_choice;
        const oldButton = document.getElementById(oldChoice);
        selectedChoiceId = oldChoice;

        if (oldButton) {
            const isCorrect = oldChoice === question.answer || prevAnswer.reviewed;
            oldButton.classList.add(isCorrect ? "correct" : "incorrect");

            if (isCorrect) {
                // Right (or already reviewed) - just show the Next button.
                revealAnswer();
            } else {
                DOM.chat.hidden = false;
                DOM.tabChat.hidden = false;

                if ($.features.messages <= 0) {
                    // No messages left to talk it through - reveal and let them move on.
                    revealAnswer();
                } else {
                    showAnswerButtonState();
                }
            }
        }

        if (messages?.length) {
            messages.forEach((msg) => {
                if (msg.role === "user") appendUserMessage(msg.content);
                if (msg.role === "assistant") appendAssistantMessage(msg.content);
            });
            requestAnimationFrame(() => DOM.messages.scrollTop = DOM.messages.scrollHeight);
        }
    }
}

async function answer(selectedChoice) {
    const response = await fetch(`/api/questions/${questionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedChoice }),
    });

    const data = await response.json();
    if (data.error) return alert(data.error);

    answerId = data.id;
    DOM.choices.classList.add("locked");
    correctChoiceId = data.answer || correctChoiceId;
    selectedChoiceId = selectedChoice;

    DOM.chat.hidden = false;
    DOM.tabChat.hidden = false;

    if (data.correct) {
        document.getElementById(selectedChoice).classList.add("correct");
        confetti();
        revealAnswer(); // auto-reveal + go straight to "Next question"
    } else {
        document.getElementById(selectedChoice).classList.add("incorrect");

        // Don't reveal the correct answer yet - let them try the tutor first.
        showAnswerButtonState();

        setTab("chat");
        chat(`I picked ${selectedChoice}. Can you help me understand why this is wrong?`);
    }
}

async function chat(content) {
    if ($.features.messages <= 0) {
        if (!DOM.messages.querySelector(".cta")) {
            const btn = document.createElement("button");
            btn.className = "cta";
            btn.textContent = "🔓 Upgrade now -->";
            btn.style.margin = "auto";
            btn.onclick = () => $.subscribe('monthly');
            DOM.messages.appendChild(btn);
            DOM.messages.scrollTop = DOM.messages.scrollHeight;
        }
        DOM.chatInput.disabled = true;
        revealAnswer(); // can't keep talking it through - let them move on
        return;
    }

    $.features.messages--;
    updateLimitsUI();
    DOM.chatInput.disabled = true;

    appendUserMessage(content);
    DOM.messages.scrollTop = DOM.messages.scrollHeight;

    const response = await fetch(`/api/answers/${answerId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
    });

    const data = await response.json();
    appendAssistantMessage(data.content);

    if (data.reviewed && data.answer) {
        correctChoiceId = data.answer;
        confetti();
        revealAnswer();
    }

    DOM.chatInput.disabled = false;
    DOM.chatInput.focus();
    DOM.messages.scrollTop = DOM.messages.scrollHeight;
}

updateLimitsUI();
next();