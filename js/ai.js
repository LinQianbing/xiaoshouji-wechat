import { buildChatPrompt, buildMemoryPrompt, buildMomentPrompt, buildMomentReactionPrompt } from "./prompt.js?v=13";

const REQUEST_TIMEOUT_MS = 60000;
const CACHE_STATS_KEY = "xiaoshouji.cacheStats.v1";

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

function isOfficialDeepSeekEndpoint(endpoint) {
  try {
    return new URL(endpoint).hostname.toLowerCase() === "api.deepseek.com";
  } catch {
    return false;
  }
}

function readCacheStats() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_STATS_KEY) || "{}");
  } catch {
    return {};
  }
}

function recordCacheUsage(settings, usage = {}) {
  const hit = Number(usage.prompt_cache_hit_tokens || 0);
  const miss = Number(usage.prompt_cache_miss_tokens || 0);
  const prompt = Number(usage.prompt_tokens || hit + miss || 0);
  if (!hit && !miss && !prompt) return;
  const key = `${settings.model || "unknown"} @ ${chatEndpoint(settings.apiBase)}`;
  const stats = readCacheStats();
  const item = stats[key] || {
    model: settings.model || "unknown",
    endpoint: chatEndpoint(settings.apiBase),
    requests: 0,
    promptTokens: 0,
    promptCacheHitTokens: 0,
    promptCacheMissTokens: 0,
    lastHitRate: 0,
    updatedAt: "",
  };
  item.requests += 1;
  item.promptTokens += prompt;
  item.promptCacheHitTokens += hit;
  item.promptCacheMissTokens += miss;
  const total = item.promptCacheHitTokens + item.promptCacheMissTokens;
  item.lastHitRate = total ? item.promptCacheHitTokens / total : 0;
  item.updatedAt = new Date().toISOString();
  stats[key] = item;
  localStorage.setItem(CACHE_STATS_KEY, JSON.stringify(stats));
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
  const body = {
    model: settings.model || "gpt-4o-mini",
    messages,
    temperature,
    response_format: { type: "json_object" },
    max_tokens: 600,
  };
  if (isOfficialDeepSeekEndpoint(endpoint)) body.thinking = { type: "disabled" };
  const res = await fetchWithReadableError(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`模型调用失败：${res.status} ${text.slice(0, 180)}`);
  }

  const data = await res.json();
  recordCacheUsage(settings, data.usage);
  return data.choices?.[0]?.message?.content || "";
}

function chatMessageLimit(talkLevel = 5) {
  const level = Number(talkLevel) || 5;
  if (level <= 2) return 2;
  if (level <= 4) return 2;
  if (level <= 6) return 3;
  if (level <= 8) return 4;
  return 5;
}

function chatTemperature(talkLevel = 5) {
  const level = Number(talkLevel) || 5;
  if (level <= 4) return 0.85;
  if (level <= 7) return 0.9;
  return 0.95;
}

function cleanPatEcho(message = "") {
  return String(message)
    .replace(/^(你|我|用户|对方)?刚刚?拍了拍(你|我|对方|TA|他|她)?[。！!，,\s]*/g, "")
    .replace(/^(你|用户|对方)拍了拍(我|你|对方|TA|他|她)[。！!，,\s]*/g, "")
    .replace(/^我被(你|用户|对方)拍了拍[。！!，,\s]*/g, "")
    .replace(/^(拍一拍|这是拍一拍动作)[。！!，,\s]*/g, "")
    .trim();
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
  const raw = await callChatCompletions(settings, prompt, chatTemperature(settings.talkLevel));
  const parsed = extractJSON(raw);
  const limit = chatMessageLimit(settings.talkLevel);
  const messages = Array.isArray(parsed.messages) && parsed.messages.length ? parsed.messages : [parsed.message || "嗯嗯，我在。"];
  const cleanedMessages = messages
    .map(String)
    .map((item) => (payload.userEventType === "pat" ? cleanPatEcho(item) : item.trim()))
    .filter((item) => item.trim());
  return {
    messages: (cleanedMessages.length ? cleanedMessages : ["嗯嗯，我在。"]).slice(0, limit),
    mood: parsed.mood || "normal",
    shouldPat: Boolean(parsed.shouldPat),
    shouldRemember: Boolean(parsed.shouldRemember),
    memoryCandidate: parsed.memoryCandidate || "",
    feelingMemoryCandidate: parsed.feelingMemoryCandidate || "",
  };
}

export async function generateMoment(payload) {
  const { settings } = payload;
  if (!isApiReady(settings)) throw new ApiNotConfiguredError();
  const raw = await callChatCompletions(settings, buildMomentPrompt(payload), 0.86);
  const parsed = extractJSON(raw);
  return { content: String(parsed.content || "今天也冒个泡。") };
}

export async function generateMomentReaction(payload) {
  const { settings } = payload;
  if (!isApiReady(settings)) throw new ApiNotConfiguredError();
  const raw = await callChatCompletions(settings, buildMomentReactionPrompt(payload), 1.02);
  const parsed = extractJSON(raw);
  return {
    comment: String(parsed.comment || "").trim().slice(0, 80),
    message: String(parsed.message || "").trim().slice(0, 140),
    memoryCandidate: String(parsed.memoryCandidate || "").trim().slice(0, 140),
    feelingMemoryCandidate: String(parsed.feelingMemoryCandidate || "").trim().slice(0, 140),
  };
}

export async function summarizeMemories(payload) {
  const { settings } = payload;
  if (!isApiReady(settings)) throw new ApiNotConfiguredError();
  const raw = await callChatCompletions(settings, buildMemoryPrompt(payload), 0.4);
  const parsed = extractJSON(raw);
  return Array.isArray(parsed.memories) ? parsed.memories.slice(0, 8) : [];
}
