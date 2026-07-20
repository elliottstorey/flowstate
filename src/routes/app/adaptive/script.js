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
};

let question = null;
let questionId = null;
let answerId = null;
let questions = 0;

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
	if (event.key != "Enter" || content == "") return;
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

async function next() {
	questionId = null;
	answerId = null;

	DOM.next.disabled = true;
	DOM.chat.hidden = true;
	DOM.tabChat.hidden = true;
	DOM.messages.innerHTML = "";

	const accountResponse = await fetch("/api/account");
	const { answers } = await accountResponse.json();

	if (answers >= 10 && !$.subscriptions.length) {
		$.url = "/app";
		return;
	}

	const response = await fetch(`/api/questions/next`);
	const data = await response.json();

	question = data;
	questionId = question.id;
	questions += 1;

	DOM.problemHeading.innerText = `${question.type} • Question ${questions} of ♾️`;

	const isRC = question.type == "Reading Comprehension";
	DOM.tabs.hidden = false;
	DOM.tabs.querySelector('[data-tab="reference"]').hidden = !isRC;
	DOM.reference.hidden = !isRC;
	DOM.stimulus.hidden = isRC;

	setTab("problem");

	if (isRC) {
		DOM.passage.textContent = question.passage;
	} else {
		DOM.stimulus.textContent = question.stimulus;
	}

	DOM.stem.textContent = question.stem;

	DOM.choiceButtons.forEach((button) => {
		button.className = "choice";
		button.disabled = false;
		button.querySelector(".content").textContent = "";
		button.querySelector(".rationale").textContent = "";
		button.querySelector(".rationale").hidden = true;
	});

	question.choices.forEach((choice) => {
		const button = document.getElementById(choice.letter);
		button.querySelector(".content").textContent = choice.text;
	});
}

async function answer(selectedChoice) {
	const response = await fetch(`/api/questions/${questionId}/answers`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ selectedChoice }),
	});

	const data = await response.json();
	answerId = data.answerId;

	DOM.problemHeading.innerText = `${question.type} • Question ${questions} of ♾️ • ${question.subtype} • Difficulty ${question.difficulty}`;

	DOM.chat.hidden = false;
	DOM.tabChat.hidden = false;

	if (data.correct) {
		document.getElementById(selectedChoice).classList.add("correct");
		confetti();
		DOM.next.disabled = false;
	} else {
		document.getElementById(selectedChoice).classList.add("incorrect");
		setTab("chat");
		chat(`I picked ${selectedChoice}. Can you help me understand why this is wrong?`);
	}
}

async function chat(content) {
	DOM.chatInput.disabled = true;

	const userMessage = document.createElement("p");
	userMessage.className = "user";
	userMessage.textContent = content;
	DOM.messages.appendChild(userMessage);
	DOM.messages.scrollTop = DOM.messages.scrollHeight;

	const response = await fetch(`/api/answers/${answerId}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content }),
	});

	const data = await response.json();

	const assistantMessage = document.createElement("div");
	assistantMessage.innerHTML = DOMPurify.sanitize(marked.parse(data.content));
	DOM.messages.appendChild(assistantMessage);

	if (data.unlockNextQuestion) {
		document.getElementById(data.answer).classList.add("correct");
		confetti();
		DOM.next.disabled = false;
	}

	DOM.chatInput.disabled = false;
	DOM.chatInput.focus();
	DOM.messages.scrollTop = DOM.messages.scrollHeight;
}

next();