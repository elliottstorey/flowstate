import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { mistral } from "@ai-sdk/mistral";
import { deepseek } from "@ai-sdk/deepseek";
import { ollama } from "ai-sdk-ollama";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY }).chat;

const providers = { openai, anthropic, google, mistral, deepseek, ollama, openrouter };

const [provider, modelId] = process.env.MODEL.split(/\/(.*)/);

const model = providers[provider](modelId);

function server() {
    return { model };
}

export { server };