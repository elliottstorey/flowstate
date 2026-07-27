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
    next: document.getElementById("next"),
    chat: document.getElementById("chat"),
    messages: document.getElementById("messages"),
    chatInput: document.getElementById("chat-input"),
    messageCounter: document.getElementById("message-counter"),
    messagesLeft: document.getElementById("messages-left"),
};

let questionId = null;
let answerId = null;
let questionsCount = 0;

function updateLimitsUI() {
    if ($.activeProducts.includes("monthly")) {
        DOM.messageCounter.hidden = true;
    } else {
        DOM.messageCounter.hidden = false;
        DOM.messagesLeft.textContent = $.features.messages;
    }
}

DOM.next.addEventListener("click", next);

DOM.choices.addEventListener("click", (event) => {
    const choice = event.target.closest(".choice");
    if (!choice || !questionId || answerId) return;
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

    // Reset UI
    DOM.chat.hidden = true;
    DOM.tabChat.hidden = true;
    DOM.messages.innerHTML = "";
    DOM.choiceButtons.forEach((button) => {
        button.className = "choice"; 
        button.disabled = false;
        button.querySelector(".content").textContent = "";
    });

    // 1. Get next question metadata (or resume unreviewed)
    const metaRes = await fetch(`/api/questions/next`);
    const meta = await metaRes.json();
    
    // 2. Fetch full question state
    const dataRes = await fetch(`/api/questions/${meta.id}`);
    const { passage, question, choices, answer: prevAnswer, messages } = await dataRes.json();

    questionId = question.id;
    answerId = prevAnswer?.id || null;
    questionsCount++;

    DOM.problemHeading.innerText = `${question.type} • Question ${questionsCount} of ♾️ • ${meta.subtype} • Difficulty ${meta.difficulty}`;

    const isRC = question.type === "Reading Comprehension";
    DOM.tabs.hidden = false;
    DOM.tabs.querySelector('[data-tab="reference"]').hidden = !isRC;
    DOM.reference.hidden = !isRC;
    DOM.stimulus.hidden = isRC;

    setTab("problem");

    if (isRC && passage) {
        DOM.passage.textContent = passage.text;
    } else if (question.stimulus) {
        DOM.stimulus.textContent = question.stimulus;
    }

    DOM.stem.textContent = question.stem;

    choices.forEach((choice) => {
        const button = document.getElementById(choice.letter);
        if (button) button.querySelector(".content").textContent = choice.text;
    });

    // Restore state if returning to an unreviewed/answered question
    if (prevAnswer) {
        const oldChoice = prevAnswer.selected_choice;
        const oldButton = document.getElementById(oldChoice);
        
        if (oldButton) {
            const isCorrect = oldChoice === question.answer || prevAnswer.reviewed;
            oldButton.classList.add(isCorrect ? "correct" : "incorrect");
            
            if (isCorrect) {
                DOM.next.disabled = false;
            } else {
                DOM.chat.hidden = false;
                DOM.tabChat.hidden = false;
                
                if ($.features.messages <= 0) {
                    DOM.next.disabled = false;
                    const correctBtn = document.getElementById(question.answer);
                    if (correctBtn) correctBtn.classList.add("correct");
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

    DOM.chat.hidden = false;
    DOM.tabChat.hidden = false;

    if (data.correct) {
        document.getElementById(selectedChoice).classList.add("correct");
        confetti();
        DOM.next.disabled = false;
    } else {
        document.getElementById(selectedChoice).classList.add("incorrect");
        
        if (data.reviewed) { 
            // Triggered if out of messages on the backend
            const correctBtn = document.getElementById(data.answer);
            if (correctBtn) correctBtn.classList.add("correct");
            DOM.next.disabled = false; 
        }

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
        document.getElementById(data.answer).classList.add("correct");
        confetti();
        DOM.next.disabled = false;
    }

    DOM.chatInput.disabled = false;
    DOM.chatInput.focus();
    DOM.messages.scrollTop = DOM.messages.scrollHeight;
}

updateLimitsUI();
next();