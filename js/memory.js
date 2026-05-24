import { addMemory, getCurrentRoleId, getRole, getChats, getSettings, getMemories, setMemories } from "./storage.js";
import { summarizeMemories } from "./ai.js";
import { nowISO } from "./time.js";

const MEMORY_LIMIT = 60;
const MEMORY_RELEVANCE_THRESHOLD = 0.16;
const ARCHIVE_AFTER_DAYS = 21;
const ARCHIVE_SCORE_THRESHOLD = 6.2;

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

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function inferKind(content = "", category = "other", source = "auto") {
  if (source === "role_feel") return "inner_feel";
  if (["profile", "preference", "boundary", "habit"].includes(category)) return "identity";
  if (category === "relationship") return /感觉|在意|别扭|委屈|冷落|靠近|疏远|吃醋|想念/.test(content) ? "relationship_state" : "identity";
  return "episode";
}

function inferValence(content = "") {
  if (/开心|喜欢|舒服|安心|期待|高兴|好点|和好|甜|满足|放心/.test(content)) return 0.55;
  if (/难过|焦虑|生气|委屈|累|压力|害怕|孤独|想哭|吵架|崩|烦|冷落|失望|不舒服/.test(content)) return -0.65;
  return 0;
}

function inferArousal(content = "", emotionWeight = 3) {
  const base = clamp(Number(emotionWeight || 3) / 5, 0, 1);
  if (/崩|哭|吵架|分手|害怕|生气|焦虑|压力|失眠|委屈|很难受|受不了|冷落/.test(content)) return Math.max(base, 0.75);
  if (/开心|期待|紧张|重要|生日|考试|面试|约好|承诺/.test(content)) return Math.max(base, 0.58);
  return base;
}

function inferUnresolved(content = "", category = "other") {
  if (category === "promise") return true;
  return /还没|没有解决|没说完|后来|等|下次|记得|提醒|答应|承诺|担心|别忘|悬着|放不下|吵架|冷落|委屈|焦虑|压力|考试|面试/.test(content);
}

export function shouldSaveFeelingMemory(content = "", triggerText = "", options = {}) {
  const text = String(content || "").trim();
  if (text.length < 8 || text.length > 140) return false;

  const normalized = normalizeText(text);
  const trigger = normalizeText(triggerText);
  const roleText = String(options.roleText || "");
  const explicitCrushSetting = /暗恋|喜欢用户|喜欢你|喜欢我|恋人|对象/.test(roleText);
  const emotionPattern = /担心|安心|放心|在意|别扭|委屈|心疼|失落|难过|尴尬|不舒服|生气|着急|紧张|放松|开心|靠近|疏远|冷落|松了一口气/;
  if (!emotionPattern.test(text)) return false;

  const vaguePattern = /更了解用户|更加了解|关系更近|关系变好|有点感觉|复杂的感觉|说不清|小情绪|心里波动|被触动|产生了感受|留下了印象/;
  if (vaguePattern.test(text)) return false;

  const overDramaPattern = explicitCrushSetting
    ? /爱上|离不开|占有欲|独占欲|无法自拔|命中注定|灵魂伴侣|深深爱|强烈嫉妒|必须拥有/
    : /暗恋|爱上|离不开|占有欲|独占欲|无法自拔|命中注定|灵魂伴侣|深深爱|强烈嫉妒|必须拥有/;
  if (overDramaPattern.test(text)) return false;

  const hasAnchor = ["因为", "看到", "听到", "用户", "对方", "这次", "刚才", "朋友圈", "提到", "说"].some((item) => text.includes(item));
  if (!hasAnchor) return false;

  const contentKeywords = extractKeywords(text);
  const triggerKeywords = extractKeywords(trigger);
  const overlap = keywordScore(contentKeywords, triggerKeywords);
  const relatedToTrigger = normalized.includes(trigger) || overlap >= 0.15 || charGramScore(text, trigger) >= 0.12;
  if (trigger && !relatedToTrigger) return false;

  return Boolean(normalized);
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
  const emotionWeight = Math.min(5, Math.max(1, Number(memory.emotionWeight ?? 3)));
  const kind = memory.kind || inferKind(content, category, memory.source);
  const unresolved = memory.resolvedAt ? false : Boolean(memory.unresolved ?? inferUnresolved(content, category));
  return {
    ...memory,
    content,
    category,
    kind,
    keywords,
    confidence: Number(memory.confidence ?? 0.7),
    importance: Math.min(5, Math.max(1, Number(memory.importance ?? 3))),
    emotionWeight,
    valence: clamp(memory.valence ?? inferValence(content), -1, 1),
    arousal: clamp(memory.arousal ?? inferArousal(content, emotionWeight), 0, 1),
    unresolved,
    resolvedAt: memory.resolvedAt || "",
    archived: Boolean(memory.archived),
    activationCount: Number(memory.activationCount ?? 0),
    lastActivatedAt: memory.lastActivatedAt || "",
    rawRefs: Array.isArray(memory.rawRefs) ? memory.rawRefs.slice(0, 8) : [],
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
  const arousal = Number(memory.arousal || 0);
  const confidence = Number(memory.confidence || 0.7);
  const activation = Number(memory.activationCount || 0);
  const age = Date.now() - new Date(memory.updatedAt || memory.createdAt || Date.now()).getTime();
  const ageDays = Math.max(0, age / (1000 * 60 * 60 * 24));
  const agePenalty = Math.min(4, ageDays / (memory.unresolved ? 110 : 55));
  return importance * 1.8 + emotion + arousal * 2 + confidence * 2 + Math.pow(activation + 1, 0.35) - agePenalty;
}

function withLifecycle(memory) {
  const normalized = normalizeMemory(memory);
  const age = Date.now() - new Date(normalized.updatedAt || normalized.createdAt || Date.now()).getTime();
  const ageDays = Math.max(0, age / (1000 * 60 * 60 * 24));
  const shouldArchive =
    normalized.source !== "manual" &&
    !normalized.unresolved &&
    ageDays >= ARCHIVE_AFTER_DAYS &&
    rankForRetention(normalized) < ARCHIVE_SCORE_THRESHOLD;
  return { ...normalized, archived: normalized.archived || shouldArchive };
}

export function rememberText(roleId, content, importance = 3, emotionWeight = 3, options = {}) {
  const candidate = normalizeMemory({
    content,
    importance,
    emotionWeight,
    category: options.category,
    kind: options.kind,
    valence: options.valence,
    arousal: options.arousal,
    unresolved: options.unresolved,
    resolvedAt: options.resolvedAt,
    rawRefs: options.rawRefs,
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
      valence: Math.abs(candidate.valence || 0) >= Math.abs(existing.valence || 0) ? candidate.valence : existing.valence,
      arousal: Math.max(existing.arousal || 0, candidate.arousal || 0),
      unresolved: Boolean(existing.unresolved || candidate.unresolved) && !candidate.resolvedAt,
      resolvedAt: candidate.resolvedAt || existing.resolvedAt || "",
      rawRefs: [...new Set([...(existing.rawRefs || []), ...(candidate.rawRefs || [])])].slice(0, 8),
      archived: false,
      confidence: Math.max(existing.confidence || 0.7, candidate.confidence || 0.7),
      source: existing.source === "manual" ? "manual" : candidate.source,
      updatedAt: nowISO(),
    });
    const next = [merged, ...memories.filter((_, index) => index !== existingIndex)]
      .map(withLifecycle)
      .sort((a, b) => rankForRetention(b) - rankForRetention(a))
      .slice(0, MEMORY_LIMIT);
    setMemories(roleId, next);
    return merged;
  }

  const added = addMemory(roleId, candidate);
  const next = getMemories(roleId)
    .map(withLifecycle)
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
    .map(withLifecycle)
    .map((memory) => {
      const relevance = keywordScore(memory.keywords, queryKeywords);
      const semanticRelevance = charGramScore(memory.content, queryContext);
      const finalRelevance = Math.max(relevance, semanticRelevance);
      const score =
        finalRelevance * 8 +
        Number(memory.importance || 3) * 1.2 +
        Number(memory.emotionWeight || 3) * 0.7 +
        Number(memory.arousal || 0) * 1.6 +
        (memory.unresolved ? 1.4 : 0) +
        Number(memory.confidence || 0.7);
      return { ...memory, relevance: finalRelevance, score };
    })
    .filter((memory) => !memory.archived || memory.unresolved || memory.relevance >= 0.42)
    .filter((memory) => memory.relevance >= MEMORY_RELEVANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export function selectSurfacingMemories(memories = [], query = "", recentMessages = []) {
  const queryContext = [
    query,
    ...recentMessages
      .slice(-6)
      .filter((message) => (message.type || "text") === "text" && !message.isRevoked)
      .map((message) => message.content || ""),
  ].join(" ");
  const queryKeywords = extractKeywords(queryContext);
  const hasQuerySignal = Boolean(queryKeywords.length || normalizeText(queryContext).length >= 4);
  const now = Date.now();
  const candidates = memories
    .map(withLifecycle)
    .filter((memory) => !memory.archived)
    .filter((memory) => memory.unresolved || memory.kind === "inner_feel" || Number(memory.arousal || 0) >= 0.65)
    .map((memory) => {
      const relevance = Math.max(keywordScore(memory.keywords, queryKeywords), charGramScore(memory.content, queryContext));
      const lastActivated = memory.lastActivatedAt ? new Date(memory.lastActivatedAt).getTime() : 0;
      const quietDays = lastActivated ? Math.max(0, (now - lastActivated) / (1000 * 60 * 60 * 24)) : 30;
      const freshnessPenalty = quietDays < 1 ? 1.5 : quietDays < 3 ? 0.8 : 0;
      const canSurfaceUnresolved =
        !memory.unresolved ||
        (hasQuerySignal && relevance >= 0.12) ||
        (quietDays >= 10 && Number(memory.arousal || 0) >= 0.72 && relevance >= 0.06);
      const score =
        (memory.unresolved ? 2.2 : 0) +
        Number(memory.arousal || 0) * 3 +
        Number(memory.importance || 3) +
        relevance * 5 -
        freshnessPenalty;
      const surfacingReason = memory.unresolved ? "这件事还悬着" : memory.kind === "inner_feel" ? "TA心里还有一点感觉" : "这段旧事有情绪余温";
      return { ...memory, relevance, score, surfacingReason, canSurfaceUnresolved };
    })
    .filter((memory) => memory.canSurfaceUnresolved)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const picked = [];
  let unresolvedCount = 0;
  for (const memory of candidates) {
    if (memory.unresolved) {
      if (unresolvedCount >= 1) continue;
      unresolvedCount += 1;
    }
    picked.push(memory);
    if (picked.length >= 2) break;
  }
  return picked.map(({ canSurfaceUnresolved, ...memory }) => memory);
}

export function selectContextMemories(memories = [], query = "", recentMessages = []) {
  const selected = [...selectSurfacingMemories(memories, query, recentMessages), ...selectRelevantMemories(memories, query, recentMessages)];
  const byId = new Map();
  for (const memory of selected) {
    if (!memory?.id || byId.has(memory.id)) continue;
    byId.set(memory.id, memory);
  }
  return [...byId.values()].slice(0, 10);
}

export function touchMemories(roleId, memoryIds = []) {
  const ids = new Set(memoryIds.filter(Boolean));
  if (!ids.size) return;
  const next = getMemories(roleId).map((memory) =>
    ids.has(memory.id)
      ? {
          ...memory,
          activationCount: Number(memory.activationCount || 0) + 1,
          lastActivatedAt: nowISO(),
        }
      : memory,
  );
  setMemories(roleId, next.map(withLifecycle).sort((a, b) => rankForRetention(b) - rankForRetention(a)).slice(0, MEMORY_LIMIT));
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
        kind: item.kind,
        valence: item.valence,
        arousal: item.arousal,
        unresolved: item.unresolved,
        confidence: item.confidence,
        source: "summary",
      }),
    )
    .filter(Boolean);
}
