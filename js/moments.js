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

const MOMENT_REPLY_TEMPLATES = [
  "看到啦。",
  "你一说我就想回你了。",
  "嗯嗯，我刚刚也在想这个。",
  "好，我记住你这句了。",
  "你评论我当然要回呀。",
  "被你抓到了。",
  "这条评论我要收藏一下。",
  "你怎么这么会说。",
];

function pickMomentReply(role, text = "") {
  const value = String(text).trim();
  if (/想你|喜欢|爱你|亲|抱抱|贴贴|亲亲/.test(value)) return "那我也要回你一下，贴贴。";
  if (/哈哈|笑死|xswl|好笑|乐/.test(value)) return "你笑我也想笑了。";
  if (/为什么|咋|怎么|吗|？|\?/.test(value)) return "我认真想了一下，感觉你说得有点对。";
  if (/过分|坏|气|哼|讨厌/.test(value)) return "不许生气，我回你了。";
  if (/好看|可爱|喜欢/.test(value)) return "被你夸到了，心情变好了。";
  const seed = [...value].reduce((sum, ch) => sum + ch.charCodeAt(0), role?.name?.length || 0);
  return MOMENT_REPLY_TEMPLATES[seed % MOMENT_REPLY_TEMPLATES.length];
}

const USER_MOMENT_COMMENT_TEMPLATES = [
  "看到了。",
  "这条我赞同。",
  "你这会儿还挺有精神。",
  "不错，给你点一下。",
  "我刚好刷到。",
  "这条留名。",
  "嗯，记住了。",
  "有点像你会发的。",
];

function pickUserMomentComment(role, content = "") {
  const value = String(content).trim();
  if (/累|困|睡|熬夜|晚安|不想动/.test(value)) return "早点休息，别硬撑。";
  if (/开心|高兴|好耶|快乐|舒服/.test(value)) return "看出来你心情不错。";
  if (/烦|难受|生气|崩|哭|委屈/.test(value)) return "我在，别自己憋着。";
  if (/好看|照片|自拍|拍/.test(value)) return "这张可以。";
  if (/吃|饭|奶茶|咖啡|甜/.test(value)) return "下次带我一个。";
  const seed = [...value].reduce((sum, ch) => sum + ch.charCodeAt(0), role?.name?.length || 0);
  return USER_MOMENT_COMMENT_TEMPLATES[seed % USER_MOMENT_COMMENT_TEMPLATES.length];
}

function buildAutoInteractionsForUserMoment({ content, visibility, mentions = [] }) {
  if (visibility === "private") return { likedBy: [], comments: [] };
  const roles = getRoles().filter((role) => !role.isBlocked);
  if (!roles.length) return { likedBy: [], comments: [] };

  const mentionNames = new Set(mentions.map((name) => String(name).trim()).filter(Boolean));
  const mentionedRoles = mentionNames.size ? roles.filter((role) => mentionNames.has(role.name)) : [];
  const audience = mentionedRoles.length ? mentionedRoles : roles;
  const likedBy = audience.slice(0, 8).map((role) => role.id);
  const commenters = (mentionedRoles.length ? mentionedRoles : audience).slice(0, mentionedRoles.length ? 4 : 2);
  const comments = commenters.map((role, index) => ({
    id: `comment_${Date.now().toString(36)}_${role.id}_${Math.random().toString(36).slice(2, 6)}`,
    userName: role.name,
    text: pickUserMomentComment(role, content),
    replyToName: "",
    createdAt: new Date(Date.now() + 900 + index * 700).toISOString(),
    isRoleReply: true,
  }));
  return { likedBy, comments };
}

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
  const interactions = buildAutoInteractionsForUserMoment({ content: text, visibility, mentions });
  return addMoment(USER_MOMENTS_ID, {
    authorType: "user",
    content: text,
    images,
    visibility,
    location,
    mentions,
    likedBy: interactions.likedBy,
    likes: interactions.likedBy.length,
    comments: interactions.comments,
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
  const likedBy = Array.isArray(item.likedBy) ? item.likedBy : [];
  const nextLikedBy = likedBy.includes(USER_MOMENTS_ID)
    ? likedBy.filter((id) => id !== USER_MOMENTS_ID)
    : [...likedBy, USER_MOMENTS_ID];
  updateMoment(roleId, momentId, { likedBy: nextLikedBy, likes: nextLikedBy.length });
}

export function commentMoment(roleId, momentId, text, userName = "我", replyToCommentId = "", replyToName = "") {
  const item = getMoments(roleId).find((moment) => moment.id === momentId);
  const commentText = text?.trim();
  if (!item || !commentText) return;
  const replyTo = replyToCommentId ? (item.comments || []).find((comment) => comment.id === replyToCommentId) : null;
  const replyTargetName = replyTo?.userName || replyToName || "";

  const comments = [
    ...(item.comments || []),
    {
      id: `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      userName,
      text: commentText,
      replyToName: replyTargetName,
      createdAt: new Date().toISOString(),
    },
  ];

  if (roleId !== USER_MOMENTS_ID && item.authorType !== "user") {
    const role = getRole(roleId);
    const replyText = pickMomentReply(role, commentText);
    comments.push({
      id: `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      userName: role.name,
      text: replyText,
      replyToName: userName,
      createdAt: new Date(Date.now() + 800).toISOString(),
      isRoleReply: true,
    });
  }

  updateMoment(roleId, momentId, { comments });
}
