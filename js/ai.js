import { buildChatPrompt, buildMemoryPrompt, buildMomentPrompt } from "./prompt.js?v=4";

const REQUEST_TIMEOUT_MS = 60000;

export class ApiNotConfiguredError extends Error {
  constructor(message = "还没有连接 API，请先到“我 → AI 设置”填写 API Key，并拉取模型。") {
    super(message);
    this.name = "ApiNotConfiguredError";
  }
}

export function isApiReady(settings) {
  return Boolean(settings?.apiKey?.trim() && settings?.apiBase?.trim() && settings?.model?.trim());
}

function extractJSON(text) {
  if (!text) throw new Error("空回复");
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("模型没有返回 JSON");
  }
}

function chatEndpoint(apiBase) {
  const value = (apiBase || "https://api.openai.com/v1/chat/completions").trim().replace(/\/+$/, "");
  if (value.endsWith("/chat/completions")) return value;
  return `${value}/chat/completions`;
}

function modelsEndpoint(apiBase) {
  return chatEndpoint(apiBase).replace(/\/chat\/completions$/, "/models");
}

async function fetchWithReadableError(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("请求超时，模型接口 60 秒内没有响应。请稍后再发一次，或检查接口地址/网络。");
    }
    throw new Error(`网络或跨域请求失败。请确认接口地址可从浏览器访问，并支持 CORS：${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function callChatCompletions(settings, messages, temperature = 0.85) {
  if (!isApiReady(settings)) throw new ApiNotConfiguredError();
  const endpoint = chatEndpoint(settings.apiBase);
  const res = await fetchWithReadableError(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || "gpt-4o-mini",
      messages,
      temperature,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`模型调用失败：${res.status} ${text.slice(0, 180)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function fetchAvailableModels(settings) {
  if (!settings.apiKey?.trim()) throw new ApiNotConfiguredError("还没有填写 API Key，请先到“我 → AI 设置”填写。");
  const res = await fetchWithReadableError(modelsEndpoint(settings.apiBase), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`模型列表拉取失败：${res.status} ${text.slice(0, 180)}`);
  }

  const data = await res.json();
  const rawModels = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
  const models = rawModels
    .map((item) => (typeof item === "string" ? item : item?.id || item?.name))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  if (!models.length) throw new Error("接口没有返回可用模型");
  return models;
}

export async function generateChatReply(payload) {
  const { settings } = payload;
  if (!isApiReady(settings)) throw new ApiNotConfiguredError();

  const prompt = buildChatPrompt(payload);
  const raw = await callChatCompletions(settings, prompt, 1.15);
  const parsed = extractJSON(raw);
  return {
    messages: Array.isArray(parsed.messages) && parsed.messages.length ? parsed.messages.map(String).slice(0, 6) : [String(parsed.message || "嗯嗯，我在。")],
    mood: parsed.mood || "normal",
    shouldPat: Boolean(parsed.shouldPat),
    shouldRemember: Boolean(parsed.shouldRemember),
    memoryCandidate: parsed.memoryCandidate || "",
  };
}

export async function generateMoment(payload) {
  const { settings } = payload;
  if (!isApiReady(settings)) throw new ApiNotConfiguredError();
  const raw = await callChatCompletions(settings, buildMomentPrompt(payload), 0.86);
  const parsed = extractJSON(raw);
  return { content: String(parsed.content || "今天也冒个泡。") };
}

export async function summarizeMemories(payload) {
  const { settings } = payload;
  if (!isApiReady(settings)) throw new ApiNotConfiguredError();
  const raw = await callChatCompletions(settings, buildMemoryPrompt(payload), 0.4);
  const parsed = extractJSON(raw);
  return Array.isArray(parsed.memories) ? parsed.memories.slice(0, 8) : [];
}
