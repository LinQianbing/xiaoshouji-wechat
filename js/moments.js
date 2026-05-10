import {
  DEFAULT_USER_AVATAR,
  addMoment,
  getChats,
  getCurrentRoleId,
  getMemories,
  getRole,
  getSettings,
  getRoles,
  getMoments,
  setMoments,
  updateMoment,
} from "./storage.js";
import { generateMoment } from "./ai.js";

export const USER_MOMENTS_ID = "__user__";

export async function createMomentForRole(roleId = getCurrentRoleId()) {
  const settings = getSettings();
  if (!settings.allowMoments) throw new Error("朋友圈生成开关已关闭");
  const role = getRole(roleId);
  const recentMessages = getChats(roleId).slice(-18);
  const memories = getMemories(roleId).slice(0, 10);
  const result = await generateMoment({ role, settings, recentMessages, memories });
  return addMoment(roleId, { content: result.content });
}

export function createUserMoment({ content, images = [], visibility = "public", location = "", mentions = [] }) {
  const text = content?.trim() || "";
  if (!text && !images.length) throw new Error("先写点什么，或选一张图片");
  return addMoment(USER_MOMENTS_ID, {
    authorType: "user",
    content: text,
    images,
    visibility,
    location,
    mentions,
  });
}

export function updateUserMoment(momentId, patch) {
  updateMoment(USER_MOMENTS_ID, momentId, patch);
}

export function deleteMoment(roleId, momentId) {
  setMoments(roleId, getMoments(roleId).filter((moment) => moment.id !== momentId));
}

export function getAllMoments() {
  const roles = getRoles();
  const settings = getSettings();
  const byRole = getMoments();
  const userRole = {
    id: USER_MOMENTS_ID,
    name: settings.userName || "我",
    avatar: settings.userAvatar || DEFAULT_USER_AVATAR,
    isUser: true,
  };
  return [
    ...(byRole[USER_MOMENTS_ID] || []).map((moment) => ({ ...moment, role: userRole, authorType: "user" })),
    ...roles.flatMap((role) => (byRole[role.id] || []).map((moment) => ({ ...moment, role, authorType: moment.authorType || "role" }))),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function likeMoment(roleId, momentId) {
  const item = getMoments(roleId).find((moment) => moment.id === momentId);
  if (!item) return;
  updateMoment(roleId, momentId, { likes: Number(item.likes || 0) + 1 });
}

export function commentMoment(roleId, momentId, text, userName = "我") {
  const item = getMoments(roleId).find((moment) => moment.id === momentId);
  if (!item || !text?.trim()) return;
  updateMoment(roleId, momentId, {
    comments: [...(item.comments || []), { userName, text: text.trim(), createdAt: new Date().toISOString() }],
  });
}
