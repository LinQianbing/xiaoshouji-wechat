import { buildChatPrompt, buildMemoryPrompt, buildMomentPrompt } from "./prompt.js";
import { getTimeContext } from "./time.js";

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

async function callChatCompletions(settings, messages, temperature = 0.85) {
  if (!settings.apiKey) throw new Error("还没有填写 API Key");
  const endpoint = chatEndpoint(settings.apiBase);
  const res = await fetch(endpoint, {
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
  if (!settings.apiKey) throw new Error("还没有填写 API Key");
  const res = await fetch(modelsEndpoint(settings.apiBase), {
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

function localChatFallback({ role, settings, mode, userText }) {
  const time = getTimeContext();
  const name = role.name || "我";
  const level = Number(settings.talkLevel || 5);
  const messages = [];

  if (time.period === "凌晨") messages.push("你还没睡啊……");
  else if (/早|起床|醒/.test(userText)) messages.push("早呀");
  else if (/累|烦|难受|哭|崩/.test(userText)) messages.push("过来，我先听你说。");
  else messages.push(mode === "offline" ? "嗯，我在。" : "我看到啦。");

  if (level >= 4) messages.push(`${settings.userName || "你"}刚刚说的这个，我会按 ${name} 的感觉接住。`);
  if (level >= 8) messages.push("不过你先别急着一口气全扛完。慢慢来嘛。");

  return {
    messages: messages.slice(0, level <= 3 ? 1 : level >= 8 ? 3 : 2),
    mood: "normal",
    shouldRemember: /重要|记住|生日|讨厌|喜欢|以后/.test(userText),
    memoryCandidate: /重要|记住|生日|讨厌|喜欢|以后/.test(userText) ? userText.slice(0, 80) : "",
  };
}

export async function generateChatReply(payload) {
  const { settings } = payload;
  if (!settings.apiKey) return localChatFallback(payload);

  const prompt = buildChatPrompt(payload);
  const raw = await callChatCompletions(settings, prompt, 0.9);
  const parsed = extractJSON(raw);
  return {
    messages: Array.isArray(parsed.messages) && parsed.messages.length ? parsed.messages.map(String).slice(0, 6) : [String(parsed.message || "嗯嗯，我在。")],
    mood: parsed.mood || "normal",
    shouldRemember: Boolean(parsed.shouldRemember),
    memoryCandidate: parsed.memoryCandidate || "",
  };
}

export async function generateMoment(payload) {
  const { settings, role } = payload;
  if (!settings.apiKey) {
    const time = getTimeContext();
    return { content: `${time.period}的小记录。${role.name}今天也在手机里偷偷冒泡一下。` };
  }
  const raw = await callChatCompletions(settings, buildMomentPrompt(payload), 0.86);
  const parsed = extractJSON(raw);
  return { content: String(parsed.content || "今天也冒个泡。") };
}

export async function summarizeMemories(payload) {
  const { settings } = payload;
  if (!settings.apiKey) {
    const recentUserText = payload.recentMessages
      .filter((msg) => msg.sender === "user")
      .slice(-3)
      .map((msg) => msg.content)
      .join("；");
    return recentUserText ? [{ content: `最近用户提到：${recentUserText.slice(0, 90)}`, importance: 3, emotionWeight: 3 }] : [];
  }
  const raw = await callChatCompletions(settings, buildMemoryPrompt(payload), 0.4);
  const parsed = extractJSON(raw);
  return Array.isArray(parsed.memories) ? parsed.memories.slice(0, 8) : [];
}
