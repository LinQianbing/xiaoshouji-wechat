import { addMemory, getCurrentRoleId, getRole, getChats, getSettings, getMemories } from "./storage.js";
import { summarizeMemories } from "./ai.js";

export function rememberText(roleId, content, importance = 3, emotionWeight = 3) {
  if (!content || !content.trim()) return null;
  return addMemory(roleId, {
    content: content.trim().slice(0, 120),
    importance,
    emotionWeight,
  });
}

export async function summarizeRecentChatToMemory(roleId = getCurrentRoleId()) {
  const settings = getSettings();
  if (!settings.allowMemory) throw new Error("长期记忆开关已关闭");
  const role = getRole(roleId);
  const recentMessages = getChats(roleId).slice(-20);
  const existing = getMemories(roleId);
  const result = await summarizeMemories({ role, settings, recentMessages, existing });
  return result
    .filter((item) => item?.content)
    .map((item) =>
      rememberText(
        roleId,
        item.content,
        Number(item.importance ?? 3),
        Number(item.emotionWeight ?? 3),
      ),
    )
    .filter(Boolean);
}
