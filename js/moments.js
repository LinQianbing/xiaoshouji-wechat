import { addMoment, getChats, getCurrentRoleId, getMemories, getRole, getSettings, getRoles, getMoments, updateMoment } from "./storage.js";
import { generateMoment } from "./ai.js";

export async function createMomentForRole(roleId = getCurrentRoleId()) {
  const settings = getSettings();
  if (!settings.allowMoments) throw new Error("朋友圈生成开关已关闭");
  const role = getRole(roleId);
  const recentMessages = getChats(roleId).slice(-18);
  const memories = getMemories(roleId).slice(0, 10);
  const result = await generateMoment({ role, settings, recentMessages, memories });
  return addMoment(roleId, { content: result.content });
}

export function getAllMoments() {
  const roles = getRoles();
  const byRole = getMoments();
  return roles
    .flatMap((role) =>
      (byRole[role.id] || []).map((moment) => ({ ...moment, role })),
    )
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
