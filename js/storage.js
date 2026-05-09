import { nowISO } from "./time.js";

const KEYS = {
  settings: "xiaoshouji.appSettings.v2",
  roles: "xiaoshouji.roles.v2",
  currentRoleId: "xiaoshouji.currentRoleId.v2",
  currentMode: "xiaoshouji.currentMode.v2",
  chatRecords: "xiaoshouji.chatRecords.v2",
  memories: "xiaoshouji.memories.v2",
  moments: "xiaoshouji.moments.v2",
  lastOpenAt: "xiaoshouji.lastOpenAt.v2",
  unread: "xiaoshouji.unread.v2",
};

export const DEFAULT_ROLE_AVATAR = "assets/avatar/default-role.svg";
export const DEFAULT_USER_AVATAR = "assets/avatar/default-user.svg";

const defaultSettings = {
  userName: "我",
  userAvatar: DEFAULT_USER_AVATAR,
  apiKey: "",
  apiBase: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o-mini",
  availableModels: [],
  talkLevel: 5,
  defaultMode: "online",
  allowProactiveMessage: true,
  allowMemory: true,
  allowMoments: true,
};

const defaultRole = {
  id: "role_default",
  name: "小手机",
  gender: "未设定",
  avatar: DEFAULT_ROLE_AVATAR,
  description: "像住在手机里的聊天搭子。说话自然，短句多一点，偶尔吐槽，关心用户的日常，但不要像 AI 助手一样总结。",
  createdAt: nowISO(),
  updatedAt: nowISO(),
};

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function read(key, fallback) {
  return safeParse(localStorage.getItem(key), fallback);
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function initStore() {
  if (!localStorage.getItem(KEYS.settings)) write(KEYS.settings, defaultSettings);
  if (!localStorage.getItem(KEYS.roles)) write(KEYS.roles, [defaultRole]);
  if (!localStorage.getItem(KEYS.currentRoleId)) write(KEYS.currentRoleId, defaultRole.id);
  if (!localStorage.getItem(KEYS.currentMode)) write(KEYS.currentMode, getSettings().defaultMode);
  if (!localStorage.getItem(KEYS.chatRecords)) write(KEYS.chatRecords, { [defaultRole.id]: [] });
  if (!localStorage.getItem(KEYS.memories)) write(KEYS.memories, { [defaultRole.id]: [] });
  if (!localStorage.getItem(KEYS.moments)) write(KEYS.moments, { [defaultRole.id]: [] });
  if (!localStorage.getItem(KEYS.unread)) write(KEYS.unread, {});
}

export function getSettings() {
  return { ...defaultSettings, ...read(KEYS.settings, defaultSettings) };
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  write(KEYS.settings, next);
  return next;
}

export function getRoles() {
  const roles = read(KEYS.roles, [defaultRole]);
  return Array.isArray(roles) && roles.length ? roles : [defaultRole];
}

export function getRole(roleId = getCurrentRoleId()) {
  return getRoles().find((role) => role.id === roleId) || getRoles()[0];
}

export function saveRole(role) {
  const roles = getRoles();
  const existingIndex = roles.findIndex((item) => item.id === role.id);
  const normalized = {
    id: role.id || uid("role"),
    name: role.name?.trim() || "未命名角色",
    gender: role.gender || "未设定",
    avatar: role.avatar || DEFAULT_ROLE_AVATAR,
    description: role.description || "",
    createdAt: role.createdAt || nowISO(),
    updatedAt: nowISO(),
  };

  if (existingIndex >= 0) roles[existingIndex] = normalized;
  else roles.push(normalized);
  write(KEYS.roles, roles);
  ensureRoleBuckets(normalized.id);
  return normalized;
}

export function deleteRole(roleId) {
  let roles = getRoles().filter((role) => role.id !== roleId);
  if (!roles.length) roles = [defaultRole];
  write(KEYS.roles, roles);

  for (const key of [KEYS.chatRecords, KEYS.memories, KEYS.moments, KEYS.unread]) {
    const data = read(key, {});
    delete data[roleId];
    write(key, data);
  }

  if (getCurrentRoleId() === roleId) setCurrentRoleId(roles[0].id);
}

export function getCurrentRoleId() {
  const id = read(KEYS.currentRoleId, defaultRole.id);
  return getRoles().some((role) => role.id === id) ? id : getRoles()[0].id;
}

export function setCurrentRoleId(roleId) {
  write(KEYS.currentRoleId, roleId);
  ensureRoleBuckets(roleId);
}

export function getCurrentMode() {
  return read(KEYS.currentMode, getSettings().defaultMode) || "online";
}

export function setCurrentMode(mode) {
  write(KEYS.currentMode, mode === "offline" ? "offline" : "online");
}

function ensureRoleBuckets(roleId) {
  for (const key of [KEYS.chatRecords, KEYS.memories, KEYS.moments]) {
    const data = read(key, {});
    if (!Array.isArray(data[roleId])) data[roleId] = [];
    write(key, data);
  }
}

export function getChats(roleId = getCurrentRoleId()) {
  const records = read(KEYS.chatRecords, {});
  return Array.isArray(records[roleId]) ? records[roleId] : [];
}

export function setChats(roleId, messages) {
  const records = read(KEYS.chatRecords, {});
  records[roleId] = messages;
  write(KEYS.chatRecords, records);
}

export function addChat(roleId, message) {
  const messages = getChats(roleId);
  const normalized = {
    id: message.id || uid("msg"),
    sender: message.sender,
    content: message.content,
    mode: message.mode || getCurrentMode(),
    createdAt: message.createdAt || nowISO(),
  };
  setChats(roleId, [...messages, normalized]);
  return normalized;
}

export function clearChats(roleId = getCurrentRoleId()) {
  setChats(roleId, []);
}

export function getMemories(roleId = getCurrentRoleId()) {
  const memories = read(KEYS.memories, {});
  return Array.isArray(memories[roleId]) ? memories[roleId] : [];
}

export function setMemories(roleId, items) {
  const memories = read(KEYS.memories, {});
  memories[roleId] = items;
  write(KEYS.memories, memories);
}

export function addMemory(roleId, memory) {
  const items = getMemories(roleId);
  const normalized = {
    id: memory.id || uid("memory"),
    roleId,
    content: memory.content,
    importance: Number(memory.importance ?? 3),
    emotionWeight: Number(memory.emotionWeight ?? 3),
    createdAt: memory.createdAt || nowISO(),
    updatedAt: nowISO(),
  };
  setMemories(roleId, [normalized, ...items].slice(0, 50));
  return normalized;
}

export function clearMemories(roleId = getCurrentRoleId()) {
  setMemories(roleId, []);
}

export function getMoments(roleId) {
  const moments = read(KEYS.moments, {});
  if (roleId) return Array.isArray(moments[roleId]) ? moments[roleId] : [];
  return moments;
}

export function setMoments(roleId, items) {
  const moments = read(KEYS.moments, {});
  moments[roleId] = items;
  write(KEYS.moments, moments);
}

export function addMoment(roleId, moment) {
  const items = getMoments(roleId);
  const normalized = {
    id: moment.id || uid("moment"),
    content: moment.content,
    createdAt: moment.createdAt || nowISO(),
    likes: Number(moment.likes ?? 0),
    comments: Array.isArray(moment.comments) ? moment.comments : [],
  };
  setMoments(roleId, [normalized, ...items]);
  return normalized;
}

export function updateMoment(roleId, momentId, patch) {
  const next = getMoments(roleId).map((item) => (item.id === momentId ? { ...item, ...patch } : item));
  setMoments(roleId, next);
}

export function getUnread() {
  return read(KEYS.unread, {});
}

export function setUnread(roleId, count) {
  const data = getUnread();
  data[roleId] = Math.max(0, Number(count) || 0);
  write(KEYS.unread, data);
}

export function getLastOpenAt() {
  return read(KEYS.lastOpenAt, null);
}

export function setLastOpenAt(value = nowISO()) {
  write(KEYS.lastOpenAt, value);
}

export function exportAllData() {
  return {
    appSettings: getSettings(),
    roles: getRoles(),
    currentRoleId: getCurrentRoleId(),
    currentMode: getCurrentMode(),
    chatRecords: read(KEYS.chatRecords, {}),
    memories: read(KEYS.memories, {}),
    moments: read(KEYS.moments, {}),
    lastOpenAt: getLastOpenAt(),
    unread: getUnread(),
    exportedAt: nowISO(),
  };
}

export function importAllData(data) {
  if (!data || typeof data !== "object") throw new Error("数据格式不正确");
  if (data.appSettings) write(KEYS.settings, { ...defaultSettings, ...data.appSettings });
  if (Array.isArray(data.roles) && data.roles.length) write(KEYS.roles, data.roles);
  if (data.currentRoleId) write(KEYS.currentRoleId, data.currentRoleId);
  if (data.currentMode) write(KEYS.currentMode, data.currentMode);
  if (data.chatRecords) write(KEYS.chatRecords, data.chatRecords);
  if (data.memories) write(KEYS.memories, data.memories);
  if (data.moments) write(KEYS.moments, data.moments);
  if (data.unread) write(KEYS.unread, data.unread);
}

export function createId(prefix) {
  return uid(prefix);
}
