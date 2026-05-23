import { addMemory, getCurrentRoleId, getRole, getChats, getSettings, getMemories, setMemories } from "./storage.js";
import { summarizeMemories } from "./ai.js";
import { nowISO } from "./time.js";

const MEMORY_LIMIT = 60;
const MEMORY_RELEVANCE_THRESHOLD = 0.16;

const CATEGORY_RULES = [
  { category: "preference", label: "偏好", pattern: /喜欢|讨厌|爱吃|不吃|想要|偏好|最爱|雷点|接受不了/ },
  { category: "relationship", label: "关系", pattern: /朋友|恋人|对象|家人|同事|同学|关系|认识|分手|和好|吵架/ },
  { category: "promise", label: "约定", pattern: /记得|提醒|约好|答应|承诺|别忘|下次|以后|要做|计划/ },
  { category: "event", label: "事件", pattern: /今天|昨天|明天|上周|生日|考试|面试|工作|发生|去了|见了|买了/ },
  { category: "boundary", label: "边界", pattern: /不要|别再|不许|介意|敏感|隐私|不喜欢你.*说|别提/ },
  { category: "emotion", label: "情绪", pattern: /难过|开心|焦虑|生气|委屈|累|压力|害怕|孤独|想哭/ },
  { category: "profile", label: "资料", pattern: /我叫|名字|年龄|学校|公司|职业|住在|来自|生日是/ },
  { category: "habit", label: "习惯", pattern: /经常|总是|每天|习惯|作息|睡觉|起床|通勤/ },
];

export function memoryCategoryLabel(category = "other") {
  return CATEGORY_RULES.find((item) => item.category === category)?.label || "其他";
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\u4e00-\u9fff]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCategory(content = "") {
  return CATEGORY_RULES.find((item) => item.pattern.test(content))?.category || "other";
}

function extractKeywords(content = "") {
  const normalized = normalizeText(content);
  const stopwords = new Set(["用户", "自己", "这个", "那个", "事情", "以后", "已经", "还有", "没有", "但是", "因为", "所以"]);
  return [
    ...new Set(
      normalized
        .split(/\s+/)
        .flatMap((part) => {
          if (/^[a-z0-9]+$/i.test(part)) return [part];
          return part.match(/[\u4e00-\u9fff]{2,8}|[a-z0-9]{2,}/gi) || [];
        })
        .filter((item) => item.length >= 2 && !stopwords.has(item)),
    ),
  ].slice(0, 8);
}

function keywordScore(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const left = new Set(a);
  const right = new Set(b);
  const overlap = [...left].filter((item) => right.has(item)).length;
  return overlap / Math.max(left.size, right.size);
}

function charGramScore(a = "", b = "") {
  const grams = (value) => {
    const compact = normalizeText(value).replace(/\s+/g, "");
    const result = [];
    for (let i = 0; i < compact.length - 1; i += 1) result.push(compact.slice(i, i + 2));
    return new Set(result);
  };
  const left = grams(a);
  const right = grams(b);
  if (!left.size || !right.size) return 0;
  const overlap = [...left].filter((item) => right.has(item)).length;
  return overlap / Math.min(left.size, right.size);
}

function normalizeMemory(memory) {
  const content = String(memory.content || "").trim().slice(0, 140);
  const category = memory.category || inferCategory(content);
  const keywords = memory.keywords?.length ? memory.keywords.slice(0, 8) : extractKeywords(content);
  return {
    ...memory,
    content,
    category,
    keywords,
    confidence: Number(memory.confidence ?? 0.7),
    importance: Math.min(5, Math.max(1, Number(memory.importance ?? 3))),
    emotionWeight: Math.min(5, Math.max(1, Number(memory.emotionWeight ?? 3))),
  };
}

function mergeContent(oldContent, newContent) {
  if (oldContent.includes(newContent)) return oldContent;
  if (newContent.includes(oldContent)) return newContent;
  if (charGramScore(oldContent, newContent) >= 0.55 && newContent.length >= oldContent.length) return newContent;
  if (charGramScore(oldContent, newContent) >= 0.55 && oldContent.length > newContent.length) return oldContent;
  return `${oldContent}；${newContent}`.slice(0, 140);
}

function rankForRetention(memory) {
  const importance = Number(memory.importance || 3);
  const emotion = Number(memory.emotionWeight || 3);
  const confidence = Number(memory.confidence || 0.7);
  const age = Date.now() - new Date(memory.updatedAt || memory.createdAt || Date.now()).getTime();
  const agePenalty = Math.min(2, age / (1000 * 60 * 60 * 24 * 90));
  return importance * 2 + emotion + confidence * 2 - agePenalty;
}

export function rememberText(roleId, content, importance = 3, emotionWeight = 3, options = {}) {
  const candidate = normalizeMemory({
    content,
    importance,
    emotionWeight,
    category: options.category,
    confidence: options.confidence,
    source: options.source || "auto",
  });
  if (!candidate.content || candidate.content.length < 4) return null;

  const memories = getMemories(roleId).map(normalizeMemory);
  const existingIndex = memories.findIndex((memory) => {
    const overlap = keywordScore(memory.keywords, candidate.keywords);
    const memoryText = normalizeText(memory.content);
    const candidateText = normalizeText(candidate.content);
    const sharedStrongKeyword =
      memory.keywords.some((keyword) => keyword.length >= 3 && candidateText.includes(normalizeText(keyword))) ||
      candidate.keywords.some((keyword) => keyword.length >= 3 && memoryText.includes(normalizeText(keyword)));
    if (memory.category !== candidate.category && overlap < 0.6) return false;
    if (memory.content.includes(candidate.content) || candidate.content.includes(memory.content)) return true;
    if (memory.category === candidate.category && sharedStrongKeyword) return true;
    if (memory.category === candidate.category && charGramScore(memory.content, candidate.content) >= 0.45) return true;
    return overlap >= (memory.category === candidate.category ? 0.3 : 0.5);
  });

  if (existingIndex >= 0) {
    const existing = memories[existingIndex];
    const merged = normalizeMemory({
      ...existing,
      content: mergeContent(existing.content, candidate.content),
      keywords: [...new Set([...(existing.keywords || []), ...candidate.keywords])].slice(0, 8),
      importance: Math.max(existing.importance || 3, candidate.importance || 3),
      emotionWeight: Math.max(existing.emotionWeight || 3, candidate.emotionWeight || 3),
      confidence: Math.max(existing.confidence || 0.7, candidate.confidence || 0.7),
      source: existing.source === "manual" ? "manual" : candidate.source,
      updatedAt: nowISO(),
    });
    const next = [merged, ...memories.filter((_, index) => index !== existingIndex)]
      .sort((a, b) => rankForRetention(b) - rankForRetention(a))
      .slice(0, MEMORY_LIMIT);
    setMemories(roleId, next);
    return merged;
  }

  const added = addMemory(roleId, candidate);
  const next = getMemories(roleId)
    .map(normalizeMemory)
    .sort((a, b) => rankForRetention(b) - rankForRetention(a))
    .slice(0, MEMORY_LIMIT);
  setMemories(roleId, next);
  return added;
}

export function selectRelevantMemories(memories = [], query = "", recentMessages = []) {
  const queryContext = [
    query,
    ...recentMessages
      .slice(-6)
      .filter((message) => (message.type || "text") === "text" && !message.isRevoked)
      .map((message) => message.content || ""),
  ].join(" ");
  const queryKeywords = extractKeywords(queryContext);
  return memories
    .map(normalizeMemory)
    .map((memory) => {
      const relevance = keywordScore(memory.keywords, queryKeywords);
      const semanticRelevance = charGramScore(memory.content, queryContext);
      const finalRelevance = Math.max(relevance, semanticRelevance);
      const score =
        finalRelevance * 8 +
        Number(memory.importance || 3) * 1.2 +
        Number(memory.emotionWeight || 3) * 0.7 +
        Number(memory.confidence || 0.7);
      return { ...memory, relevance: finalRelevance, score };
    })
    .filter((memory) => memory.relevance >= MEMORY_RELEVANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export async function summarizeRecentChatToMemory(roleId = getCurrentRoleId()) {
  const settings = getSettings();
  if (!settings.allowMemory) throw new Error("长期记忆开关已关闭");
  const role = getRole(roleId);
  const recentMessages = getChats(roleId).slice(-20);
  const existing = getMemories(roleId).map(normalizeMemory).slice(0, 24);
  const result = await summarizeMemories({ role, settings, recentMessages, existing });
  return result
    .filter((item) => item?.content)
    .map((item) =>
      rememberText(roleId, item.content, Number(item.importance ?? 3), Number(item.emotionWeight ?? 3), {
        category: item.category,
        confidence: item.confidence,
        source: "summary",
      }),
    )
    .filter(Boolean);
}
