import {
  DEFAULT_ROLE_AVATAR,
  DEFAULT_USER_AVATAR,
  addChat,
  addMemory,
  clearChats,
  clearMemories,
  createId,
  deleteRole,
  exportAllData,
  getChats,
  getCurrentMode,
  getCurrentRoleId,
  getLastOpenAt,
  getMemories,
  getRole,
  getRoles,
  getSettings,
  getUnread,
  importAllData,
  initStore,
  saveRole,
  saveSettings,
  setCurrentMode,
  setCurrentRoleId,
  setChats,
  setLastOpenAt,
  setMemories,
  setUnread,
} from "./storage.js";
import { formatChatTime, formatClock, formatMomentTime, getAwayLabel, getTimeContext, nowISO } from "./time.js";
import { ApiNotConfiguredError, fetchAvailableModels, generateChatReply, isApiReady } from "./ai.js";
import { summarizeRecentChatToMemory } from "./memory.js";
import { commentMoment, createMomentForRole, getAllMoments, likeMoment } from "./moments.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  activeTab: "chats",
  editingRoleId: null,
  profileRoleId: null,
  startChatAfterSave: false,
  sending: false,
  installPromptEvent: null,
  longPressTimer: null,
  messageActionMenu: null,
};

const els = {
  tabbar: $("#tabbar"),
  tabs: $$(".tab"),
  screens: $$(".screen[data-tab]"),
  chatDetail: $("#screen-chat-detail"),
  chatInfo: $("#screen-chat-info"),
  chatInfoProfile: $("#chatInfoProfile"),
  chatList: $("#chatList"),
  contactList: $("#contactList"),
  momentsList: $("#momentsList"),
  messageList: $("#messageList"),
  messageInput: $("#messageInput"),
  sendBtn: $("#sendBtn"),
  chatTitle: $("#chatTitle"),
  chatSubtitle: $("#chatSubtitle"),
  nowLabel: $("#nowLabel"),
  proactiveBanner: $("#proactiveBanner"),
  proactiveText: $("#proactiveText"),
  apiAlert: $("#apiAlert"),
  apiAlertText: $("#apiAlertText"),
  attachPanel: $("#attachPanel"),
  inputPlusBtn: $("#inputPlusBtn"),
  imageAttachInput: $("#imageAttachInput"),
  fileAttachInput: $("#fileAttachInput"),
  attachImageBtn: $("#attachImageBtn"),
  attachFileBtn: $("#attachFileBtn"),
  regenerateBtn: $("#regenerateBtn"),
  proactiveTalkBtn: $("#proactiveTalkBtn"),
  toast: $("#toast"),

  roleDialog: $("#roleDialog"),
  roleForm: $("#roleForm"),
  roleDialogTitle: $("#roleDialogTitle"),
  roleNameInput: $("#roleNameInput"),
  roleGenderInput: $("#roleGenderInput"),
  roleDescInput: $("#roleDescInput"),
  roleAvatarInput: $("#roleAvatarInput"),
  roleAvatarPreview: $("#roleAvatarPreview"),
  deleteRoleBtn: $("#deleteRoleBtn"),

  profileDialog: $("#profileDialog"),
  profileAvatar: $("#profileAvatar"),
  profileName: $("#profileName"),
  profileMeta: $("#profileMeta"),
  profileDesc: $("#profileDesc"),

  newChatDialog: $("#newChatDialog"),
  newChatList: $("#newChatList"),
  pinChatInput: $("#pinChatInput"),
  blockChatInput: $("#blockChatInput"),
  newMemoryInput: $("#newMemoryInput"),
  memoryEditList: $("#memoryEditList"),

  meAvatar: $("#meAvatar"),
  momentsUserAvatar: $("#momentsUserAvatar"),
  momentsHeroName: $("#momentsHeroName"),
  momentsCoverInput: $("#momentsCoverInput"),
  userAvatarInput: $("#userAvatarInput"),
  userNameInput: $("#userNameInput"),
  userPersonaInput: $("#userPersonaInput"),
  apiKeyInput: $("#apiKeyInput"),
  apiBaseInput: $("#apiBaseInput"),
  modelInput: $("#modelInput"),
  modelList: $("#modelList"),
  modelStatus: $("#modelStatus"),
  fetchModelsBtn: $("#fetchModelsBtn"),
  defaultModeSelect: $("#defaultModeSelect"),
  talkLevelInput: $("#talkLevelInput"),
  talkLevelText: $("#talkLevelText"),
  allowProactiveInput: $("#allowProactiveInput"),
  allowMemoryInput: $("#allowMemoryInput"),
  allowMomentsInput: $("#allowMomentsInput"),
  installPwaBtn: $("#installPwaBtn"),
};

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[ch]);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes = 0) {
  if (!bytes) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderMessageContent(msg) {
  if (msg.type === "image" && msg.dataUrl) {
    return `
      <div class="image-message">
        <img src="${msg.dataUrl}" alt="${escapeHTML(msg.fileName || "图片")}">
        ${msg.fileName ? `<span>${escapeHTML(msg.fileName)}</span>` : ""}
      </div>
    `;
  }
  if (msg.type === "file") {
    return `
      <div class="file-message">
        <span class="file-glyph" aria-hidden="true"></span>
        <span>
          <b>${escapeHTML(msg.fileName || "文件")}</b>
          <small>${formatFileSize(msg.fileSize)}</small>
        </span>
      </div>
    `;
  }
  return escapeHTML(msg.content);
}

function closeAttachPanel() {
  els.attachPanel.classList.add("hidden");
  els.inputPlusBtn.classList.remove("active");
}

function toggleAttachPanel() {
  els.attachPanel.classList.toggle("hidden");
  els.inputPlusBtn.classList.toggle("active", !els.attachPanel.classList.contains("hidden"));
}

function closeMessageActionMenu() {
  state.messageActionMenu?.remove();
  state.messageActionMenu = null;
}

function switchTab(tab) {
  state.activeTab = tab;
  els.screens.forEach((screen) => screen.classList.toggle("active", screen.dataset.tab === tab));
  els.chatDetail.classList.remove("active");
  els.chatInfo.classList.remove("active");
  els.tabbar.classList.remove("hidden");
  els.tabs.forEach((item) => item.classList.toggle("active", item.dataset.tabTarget === tab));
  render();
}

function openApiSettings() {
  closeDialog(els.newChatDialog);
  closeDialog(els.profileDialog);
  closeDialog(els.roleDialog);
  switchTab("me");
  requestAnimationFrame(() => {
    els.apiKeyInput?.focus();
    els.apiKeyInput?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function showApiAlert(message = "还没有连接 API，当前不会生成真实回复。") {
  els.apiAlertText.textContent = message;
  els.apiAlert.classList.remove("hidden");
}

function hideApiAlert() {
  els.apiAlert.classList.add("hidden");
}

function handleApiError(error) {
  const message = error instanceof ApiNotConfiguredError ? error.message : `API 调用失败：${error.message}`;
  showApiAlert(message);
  toast(message);
}

function openChat(roleId) {
  setCurrentRoleId(roleId);
  setUnread(roleId, 0);
  els.screens.forEach((screen) => screen.classList.remove("active"));
  els.chatInfo.classList.remove("active");
  els.chatDetail.classList.add("active");
  els.tabbar.classList.add("hidden");
  renderChatDetail();
}

function openChatInfo() {
  els.screens.forEach((screen) => screen.classList.remove("active"));
  els.chatDetail.classList.remove("active");
  els.chatInfo.classList.add("active");
  els.tabbar.classList.add("hidden");
  renderChatInfo();
}

function closeChatInfo() {
  els.chatInfo.classList.remove("active");
  els.chatDetail.classList.add("active");
  els.tabbar.classList.add("hidden");
  renderChatDetail();
}

function closeChat() {
  els.chatDetail.classList.remove("active");
  els.chatInfo.classList.remove("active");
  els.tabbar.classList.remove("hidden");
  switchTab("chats");
}

function render() {
  renderChatList();
  renderContacts();
  renderMoments();
  renderMe();
  renderNewChatList();
}

function latestPreview(roleId) {
  const messages = getChats(roleId);
  const last = messages[messages.length - 1];
  if (!last) return { text: "还没有聊天，点开说第一句话吧", time: "" };
  return {
    text: `${last.sender === "user" ? "我：" : ""}${last.content}`,
    time: formatChatTime(last.createdAt),
  };
}

function renderChatList() {
  const roles = getRoles();
  const unread = getUnread();
  const query = $("#chatSearch")?.value?.trim()?.toLowerCase() || "";
  const conversations = roles.filter((role) => getChats(role.id).length || unread[role.id]);
  const source = query ? roles : conversations;
  const filtered = source
    .filter((role) => `${role.name} ${role.description} ${latestPreview(role.id).text}`.toLowerCase().includes(query))
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || latestTime(b.id) - latestTime(a.id));
  if (!filtered.length) {
    const message = query ? "没有找到相关联系人或聊天记录。" : "暂无聊天。";
    els.chatList.innerHTML = `<div class="empty-state">${message}<br><button id="emptyAddRoleBtn" type="button">发起聊天</button></div>`;
    $("#emptyAddRoleBtn")?.addEventListener("click", openNewChatDialog);
    return;
  }

  els.chatList.innerHTML = filtered
    .map((role) => {
      const preview = latestPreview(role.id);
      const count = unread[role.id] || 0;
      return `
        <article class="chat-cell" data-role-id="${role.id}">
          <img src="${role.avatar || DEFAULT_ROLE_AVATAR}" alt="${escapeHTML(role.name)}头像">
          <div class="cell-main">
            <div class="cell-title-line">
              <strong>${escapeHTML(role.name)}</strong>
              <time>${escapeHTML(preview.time)}</time>
            </div>
            <p class="cell-subtitle">${role.isPinned ? '<span class="status-tag">置顶</span>' : ""}${role.isBlocked ? '<span class="status-tag">黑名单</span>' : ""}${escapeHTML(preview.text)}</p>
          </div>
          <span class="unread-dot ${count ? "show" : ""}">${count}</span>
        </article>
      `;
    })
    .join("");

  $$(".chat-cell").forEach((cell) => cell.addEventListener("click", () => openChat(cell.dataset.roleId)));
}

function latestTime(roleId) {
  const messages = getChats(roleId);
  const last = messages[messages.length - 1];
  return last ? new Date(last.createdAt).getTime() : 0;
}

function renderNewChatList() {
  if (!els.newChatList) return;
  const roles = getRoles();
  els.newChatList.innerHTML = roles.length
    ? roles
        .map(
          (role) => `
        <button class="new-chat-cell" data-role-id="${role.id}" type="button">
          <img src="${role.avatar || DEFAULT_ROLE_AVATAR}" alt="${escapeHTML(role.name)}头像">
          <span>${escapeHTML(role.name)}</span>
        </button>
      `,
        )
        .join("")
    : `<div class="empty-state">还没有联系人。<br><button id="newChatCreateBtn" type="button">添加联系人</button></div>`;

  $$(".new-chat-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      closeDialog(els.newChatDialog);
      openChat(cell.dataset.roleId);
    });
  });
  $("#newChatCreateBtn")?.addEventListener("click", () => {
    closeDialog(els.newChatDialog);
    openRoleDialog(null, { startChatAfterSave: true });
  });
}

function renderContacts() {
  const roles = getRoles();
  els.contactList.innerHTML = roles
    .map(
      (role) => `
      <article class="contact-cell" data-role-id="${role.id}">
        <img src="${role.avatar || DEFAULT_ROLE_AVATAR}" alt="${escapeHTML(role.name)}头像">
        <div class="cell-main">
          <strong>${escapeHTML(role.name)}</strong><br>
          <small>${escapeHTML(role.gender || "未设定")}</small>
        </div>
        <small>›</small>
      </article>
    `,
    )
    .join("");
  $$(".contact-cell").forEach((cell) => cell.addEventListener("click", () => openProfile(cell.dataset.roleId)));
}

function renderMoments() {
  const settings = getSettings();
  els.momentsUserAvatar.src = settings.userAvatar || DEFAULT_USER_AVATAR;
  els.momentsHeroName.textContent = `${settings.userName || "我"}的小手机`;
  const hero = $(".moments-hero");
  hero.style.backgroundImage = settings.momentsCover
    ? `linear-gradient(180deg, rgba(0, 0, 0, 0.10), rgba(0, 0, 0, 0.52)), url("${settings.momentsCover}")`
    : "";
  const moments = getAllMoments();
  if (!moments.length) {
    els.momentsList.innerHTML = `<div class="empty-state">朋友圈还空着。<br>点右上角相机，让当前联系人发一条动态。</div>`;
    return;
  }
  els.momentsList.innerHTML = moments
    .map((item) => {
      const comments = item.comments || [];
      return `
        <article class="moment-card" data-role-id="${item.role.id}" data-moment-id="${item.id}">
          <img class="moment-avatar" src="${item.role.avatar || DEFAULT_ROLE_AVATAR}" alt="${escapeHTML(item.role.name)}头像">
          <div>
            <p class="moment-name">${escapeHTML(item.role.name)}</p>
            <div class="moment-text">${escapeHTML(item.content)}</div>
            <div class="moment-foot">
              <time>${formatMomentTime(item.createdAt)}</time>
              <button class="like-moment" type="button">赞 ${item.likes || ""}</button>
              <button class="comment-moment" type="button">评论</button>
            </div>
            ${comments.length ? `<div class="comment-box">${comments.map((comment) => `<p><b>${escapeHTML(comment.userName)}：</b>${escapeHTML(comment.text)}</p>`).join("")}</div>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  $$(".like-moment").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".moment-card");
      likeMoment(card.dataset.roleId, card.dataset.momentId);
      renderMoments();
    });
  });

  $$(".comment-moment").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".moment-card");
      const text = prompt("评论内容");
      if (text) {
        commentMoment(card.dataset.roleId, card.dataset.momentId, text, getSettings().userName || "我");
        renderMoments();
      }
    });
  });
}

function renderMe() {
  const settings = getSettings();
  els.meAvatar.src = settings.userAvatar || DEFAULT_USER_AVATAR;
  els.userNameInput.value = settings.userName || "";
  els.userPersonaInput.value = settings.userPersona || "";
  els.apiKeyInput.value = settings.apiKey || "";
  els.apiBaseInput.value = settings.apiBase || "";
  els.modelInput.value = settings.model || "";
  els.modelList.innerHTML = (settings.availableModels || []).map((model) => `<option value="${escapeHTML(model)}"></option>`).join("");
  els.modelStatus.textContent = isApiReady(settings)
    ? settings.availableModels?.length
      ? `已连接，已缓存 ${settings.availableModels.length} 个模型`
      : "已填写 API，建议点击“拉取”确认模型可用"
    : "未连接 API，聊天、朋友圈和记忆整理不会生成真实内容";
  els.defaultModeSelect.value = settings.defaultMode || "online";
  els.talkLevelInput.value = settings.talkLevel || 5;
  els.talkLevelText.textContent = `Lv${settings.talkLevel || 5}`;
  els.allowProactiveInput.checked = Boolean(settings.allowProactiveMessage);
  els.allowMemoryInput.checked = Boolean(settings.allowMemory);
  els.allowMomentsInput.checked = Boolean(settings.allowMoments);
}

function renderChatInfo() {
  const role = getRole();
  els.chatInfoProfile.innerHTML = `
    <img src="${role.avatar || DEFAULT_ROLE_AVATAR}" alt="${escapeHTML(role.name)}头像">
    <strong>${escapeHTML(role.name)}</strong>
    <button id="infoProfileChatBtn" type="button">发消息</button>
  `;
  $("#infoProfileChatBtn")?.addEventListener("click", closeChatInfo);
  els.pinChatInput.checked = Boolean(role.isPinned);
  els.blockChatInput.checked = Boolean(role.isBlocked);
  renderMemoryEditList();
}

function renderMemoryEditList() {
  const roleId = getCurrentRoleId();
  const memories = getMemories(roleId);
  if (!memories.length) {
    els.memoryEditList.innerHTML = `<p class="memory-empty">还没有手动记忆。</p>`;
    return;
  }
  els.memoryEditList.innerHTML = memories
    .map(
      (item) => `
        <article class="memory-edit-item" data-memory-id="${item.id}">
          <textarea rows="3">${escapeHTML(item.content)}</textarea>
          <button type="button">删除</button>
        </article>
      `,
    )
    .join("");

  $$(".memory-edit-item textarea").forEach((input) => {
    input.addEventListener("change", () => {
      const item = input.closest(".memory-edit-item");
      const next = getMemories(roleId).map((memory) =>
        memory.id === item.dataset.memoryId ? { ...memory, content: input.value.trim(), updatedAt: nowISO() } : memory,
      );
      setMemories(roleId, next.filter((memory) => memory.content));
      renderMemoryEditList();
      toast("记忆已保存");
    });
  });

  $$(".memory-edit-item button").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".memory-edit-item");
      setMemories(roleId, getMemories(roleId).filter((memory) => memory.id !== item.dataset.memoryId));
      renderMemoryEditList();
      toast("记忆已删除");
    });
  });
}

function renderChatDetail() {
  const role = getRole();
  const mode = getCurrentMode();
  const time = getTimeContext();
  els.chatTitle.textContent = role.name;
  els.chatSubtitle.textContent = role.isBlocked ? "已加入黑名单 · 仍可查看" : `${mode === "offline" ? "线下模式" : "在线 · 线上模式"}`;
  els.nowLabel.textContent = `${time.period} ${time.time}`;
  $$(".mode-pill").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  renderMessages();
  if (isApiReady(getSettings())) hideApiAlert();
  else showApiAlert();
  checkProactiveBanner();
}

function renderMessages() {
  const role = getRole();
  const settings = getSettings();
  const messages = getChats(role.id);
  if (!messages.length) {
    els.messageList.innerHTML = `<div class="empty-state">你和 ${escapeHTML(role.name)} 还没有聊天。<br>像微信一样，直接发第一句就行。</div>`;
    return;
  }

  let lastDivider = "";
  els.messageList.innerHTML = messages
    .map((msg) => {
      const time = formatChatTime(msg.createdAt);
      const divider = time !== lastDivider ? `<div class="time-divider">${time}</div>` : "";
      lastDivider = time;
      const isUser = msg.sender === "user";
      const avatar = isUser ? settings.userAvatar || DEFAULT_USER_AVATAR : role.avatar || DEFAULT_ROLE_AVATAR;
      return `
        ${divider}
        <div class="message-row ${isUser ? "user" : "role"}" data-message-id="${msg.id}">
          <img class="message-avatar" src="${avatar}" alt="头像">
          <div class="bubble">${renderMessageContent(msg)}</div>
        </div>
      `;
    })
    .join("");

  requestAnimationFrame(() => {
    els.messageList.scrollTop = els.messageList.scrollHeight;
  });
  bindMessageLongPress();
}

function appendTyping() {
  const typing = document.createElement("div");
  typing.className = "message-row role typing";
  typing.innerHTML = `<img class="message-avatar" src="${getRole().avatar || DEFAULT_ROLE_AVATAR}" alt="头像"><div class="bubble">正在输入…</div>`;
  els.messageList.appendChild(typing);
  els.messageList.scrollTop = els.messageList.scrollHeight;
  return typing;
}

function buildRegenerationPlan(messages, messageId) {
  const selectedIndex = messages.findIndex((msg) => msg.id === messageId);
  if (selectedIndex < 0) return null;
  const selected = messages[selectedIndex];
  if (selected.sender !== "role") return null;

  if (selected.replyGroupId) {
    const groupIndexes = messages
      .map((msg, index) => (msg.replyGroupId === selected.replyGroupId ? index : -1))
      .filter((index) => index >= 0);
    const firstGroupIndex = Math.min(...groupIndexes);
    const lastGroupIndex = Math.max(...groupIndexes);
    if (lastGroupIndex !== messages.length - 1) return null;

    const keptMessages = messages.slice(0, firstGroupIndex);
    const replyTo = selected.replyToMessageId ? messages.find((msg) => msg.id === selected.replyToMessageId) : null;
    return {
      keptMessages,
      userText: selected.replyPrompt || replyTo?.content || "接着上一句自然回我。",
      mode: selected.mode || replyTo?.mode || getCurrentMode(),
      recentMessages: keptMessages.slice(-18),
    };
  }

  let userIndex = selectedIndex - 1;
  while (userIndex >= 0 && messages[userIndex].sender !== "user") userIndex -= 1;
  if (userIndex < 0) return null;

  const nextUserIndex = messages.findIndex((msg, index) => index > userIndex && msg.sender === "user");
  if (nextUserIndex !== -1) return null;

  const keptMessages = messages.slice(0, userIndex + 1);
  return {
    keptMessages,
    userText: messages[userIndex].content,
    mode: messages[userIndex].mode || getCurrentMode(),
    recentMessages: keptMessages.slice(-18),
  };
}

function openMessageActionMenu(target, messageId) {
  const roleId = getCurrentRoleId();
  const messages = getChats(roleId);
  const turn = buildRegenerationPlan(messages, messageId);
  if (!turn) return;

  closeMessageActionMenu();
  const rect = target.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "message-action-menu";
  menu.innerHTML = `<button type="button">重新生成</button>`;
  document.body.appendChild(menu);

  const left = Math.min(window.innerWidth - 118, Math.max(12, rect.left + rect.width / 2 - 52));
  const top = Math.max(12, rect.top - 46);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.querySelector("button").addEventListener("click", () => regenerateReplyTurn(messageId));
  state.messageActionMenu = menu;
}

function clearLongPressTimer() {
  clearTimeout(state.longPressTimer);
  state.longPressTimer = null;
}

function bindMessageLongPress() {
  $$(".message-row.role .bubble").forEach((bubble) => {
    const row = bubble.closest(".message-row");
    const messageId = row?.dataset.messageId;
    if (!messageId) return;

    bubble.addEventListener("pointerdown", () => {
      clearLongPressTimer();
      state.longPressTimer = setTimeout(() => openMessageActionMenu(bubble, messageId), 560);
    });
    bubble.addEventListener("pointerup", clearLongPressTimer);
    bubble.addEventListener("pointerleave", clearLongPressTimer);
    bubble.addEventListener("pointercancel", clearLongPressTimer);
    bubble.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openMessageActionMenu(bubble, messageId);
    });
  });
}

async function appendModelReply({ role, roleId, settings, mode, userText, recentMessages }) {
  const typing = appendTyping();
  try {
    const replyGroupId = createId("reply");
    const replyToMessageId = [...recentMessages].reverse().find((msg) => msg.sender === "user")?.id || "";
    const reply = await generateChatReply({
      role,
      settings,
      mode,
      memories: getMemories(roleId),
      recentMessages,
      userText,
    });
    typing.remove();
    for (const message of reply.messages) {
      addChat(roleId, {
        sender: "role",
        content: String(message).trim(),
        mode,
        replyGroupId,
        replyToMessageId,
        replyPrompt: userText,
      });
    }
    if (settings.allowMemory && reply.shouldRemember && reply.memoryCandidate) {
      addMemory(roleId, { content: reply.memoryCandidate.slice(0, 120), importance: 4, emotionWeight: 4 });
    }
    renderChatDetail();
    renderChatList();
    return true;
  } catch (error) {
    typing.remove();
    handleApiError(error);
    renderMessages();
    return false;
  }
}

async function sendMessage() {
  const text = els.messageInput.value.trim();
  if (!text || state.sending) return;
  const role = getRole();
  const roleId = role.id;
  const settings = getSettings();
  const mode = getCurrentMode();
  state.sending = true;
  els.sendBtn.disabled = true;
  els.messageInput.value = "";
  autoResizeInput();
  addChat(roleId, { sender: "user", content: text, mode });
  renderMessages();

  try {
    await appendModelReply({
      role,
      roleId,
      settings,
      mode,
      recentMessages: getChats(roleId).slice(-18),
      userText: text,
    });
  } finally {
    state.sending = false;
    els.sendBtn.disabled = false;
  }
}

async function sendLocalAttachment(file, type) {
  if (!file || state.sending) return;
  const role = getRole();
  const roleId = role.id;
  const settings = getSettings();
  const mode = getCurrentMode();
  const isImage = type === "image";
  const content = isImage ? `[图片] ${file.name || "未命名图片"}` : `[文件] ${file.name || "未命名文件"}`;
  const dataUrl = isImage ? await readFileAsDataURL(file) : "";

  closeAttachPanel();
  state.sending = true;
  els.sendBtn.disabled = true;
  addChat(roleId, {
    sender: "user",
    type,
    content,
    fileName: file.name,
    fileSize: file.size,
    dataUrl,
    mode,
  });
  renderMessages();
  renderChatList();

  try {
    await appendModelReply({
      role,
      roleId,
      settings,
      mode,
      recentMessages: getChats(roleId).slice(-18),
      userText: content,
    });
  } finally {
    state.sending = false;
    els.sendBtn.disabled = false;
  }
}

async function regenerateLastReply() {
  if (state.sending) return;
  const roleId = getCurrentRoleId();
  const messages = getChats(roleId);
  const lastRoleMessage = [...messages].reverse().find((msg) => msg.sender === "role");
  if (!lastRoleMessage) {
    toast("还没有可重生成的消息");
    closeAttachPanel();
    return;
  }
  await regenerateReplyTurn(lastRoleMessage.id);
}

async function regenerateReplyTurn(messageId) {
  if (state.sending) return;
  const role = getRole();
  const roleId = role.id;
  const messages = getChats(roleId);
  const plan = buildRegenerationPlan(messages, messageId);
  if (!plan) {
    toast("只能重生成最后一轮回复");
    closeAttachPanel();
    closeMessageActionMenu();
    return;
  }

  const keptMessages = plan.keptMessages;
  const removedCount = messages.length - keptMessages.length;
  if (!removedCount) {
    toast("先等模型回复后再重生成");
    closeAttachPanel();
    closeMessageActionMenu();
    return;
  }

  const settings = getSettings();
  if (!isApiReady(settings)) {
    handleApiError(new ApiNotConfiguredError());
    closeAttachPanel();
    closeMessageActionMenu();
    return;
  }
  const mode = plan.mode || getCurrentMode();
  closeAttachPanel();
  closeMessageActionMenu();
  state.sending = true;
  els.sendBtn.disabled = true;
  setChats(roleId, keptMessages);
  renderMessages();

  try {
    const ok = await appendModelReply({
      role,
      roleId,
      settings,
      mode,
      recentMessages: plan.recentMessages,
      userText: plan.userText,
    });
    if (!ok) {
      setChats(roleId, messages);
      renderMessages();
    }
  } finally {
    state.sending = false;
    els.sendBtn.disabled = false;
  }
}

function checkProactiveBanner() {
  const settings = getSettings();
  const lastOpenAt = getLastOpenAt();
  if (!settings.allowProactiveMessage || !lastOpenAt) {
    els.proactiveBanner.classList.add("hidden");
    return;
  }
  const diff = Date.now() - new Date(lastOpenAt).getTime();
  if (diff > 1000 * 60 * 60 * 2) {
    els.proactiveText.textContent = `${getRole().name}：${getAwayLabel(lastOpenAt)}了，要不要看看 TA 说什么？`;
    els.proactiveBanner.classList.remove("hidden");
  } else {
    els.proactiveBanner.classList.add("hidden");
  }
}

async function createProactiveMessage() {
  const settings = getSettings();
  if (!settings.allowProactiveMessage) {
    toast("先在“我”里打开允许主动消息");
    closeAttachPanel();
    return;
  }
  if (state.sending) return;
  if (!isApiReady(settings)) {
    handleApiError(new ApiNotConfiguredError());
    return;
  }
  const role = getRole();
  const roleId = role.id;
  const mode = getCurrentMode();
  const userText = "你现在想主动找我说句话。像真的微信联系人一样发来一条短消息，可以是随口一句、想起我了、接着上次的话说，别解释为什么发。";
  closeAttachPanel();
  state.sending = true;
  els.sendBtn.disabled = true;
  els.proactiveBanner.classList.add("hidden");
  try {
    await appendModelReply({
      role,
      settings,
      mode,
      roleId,
      recentMessages: getChats(roleId).slice(-18),
      userText,
    });
  } finally {
    state.sending = false;
    els.sendBtn.disabled = false;
  }
}

function openNewChatDialog() {
  renderNewChatList();
  showDialog(els.newChatDialog);
}

function openRoleDialog(roleId = null, options = {}) {
  state.editingRoleId = roleId;
  state.startChatAfterSave = Boolean(options.startChatAfterSave);
  const role = roleId ? getRole(roleId) : null;
  els.roleDialogTitle.textContent = role ? "编辑资料" : "添加联系人";
  els.roleNameInput.value = role?.name || "";
  els.roleGenderInput.value = role?.gender || "未设定";
  els.roleDescInput.value = role?.description || "";
  els.roleAvatarPreview.src = role?.avatar || DEFAULT_ROLE_AVATAR;
  els.deleteRoleBtn.classList.toggle("hidden", !role);
  showDialog(els.roleDialog);
}

function showDialog(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}

function saveRoleFromForm(event) {
  event.preventDefault();
  const existing = state.editingRoleId ? getRole(state.editingRoleId) : null;
  const role = saveRole({
    id: existing?.id || createId("role"),
    name: els.roleNameInput.value,
    gender: els.roleGenderInput.value,
    avatar: els.roleAvatarPreview.src || DEFAULT_ROLE_AVATAR,
    description: els.roleDescInput.value,
    isPinned: existing?.isPinned,
    isBlocked: existing?.isBlocked,
    createdAt: existing?.createdAt,
  });
  setCurrentRoleId(role.id);
  closeDialog(els.roleDialog);
  const shouldOpenChat = state.startChatAfterSave && !existing;
  state.startChatAfterSave = false;
  render();
  toast(existing ? "资料已保存" : "联系人已添加");
  if (shouldOpenChat) openChat(role.id);
}

function openProfile(roleId) {
  const role = getRole(roleId);
  state.profileRoleId = roleId;
  els.profileAvatar.src = role.avatar || DEFAULT_ROLE_AVATAR;
  els.profileName.textContent = role.name;
  els.profileMeta.textContent = `性别：${role.gender || "未设定"}`;
  els.profileDesc.textContent = role.description || "这个联系人还没有详细资料。";
  showDialog(els.profileDialog);
}

function autoResizeInput() {
  els.messageInput.style.height = "auto";
  els.messageInput.style.height = `${Math.min(110, els.messageInput.scrollHeight)}px`;
}

function saveMeSettingFromInputs() {
  saveSettings({
    userName: els.userNameInput.value.trim() || "我",
    userPersona: els.userPersonaInput.value.trim(),
    apiKey: els.apiKeyInput.value.trim(),
    apiBase: els.apiBaseInput.value.trim() || "https://api.openai.com/v1/chat/completions",
    model: els.modelInput.value.trim() || "gpt-4o-mini",
    defaultMode: els.defaultModeSelect.value,
    talkLevel: Number(els.talkLevelInput.value),
    allowProactiveMessage: els.allowProactiveInput.checked,
    allowMemory: els.allowMemoryInput.checked,
    allowMoments: els.allowMomentsInput.checked,
  });
  els.talkLevelText.textContent = `Lv${els.talkLevelInput.value}`;
  if (els.chatDetail.classList.contains("active")) renderChatDetail();
  else renderMe();
}

function isStandaloneMode() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone;
}

function installHelpMessage() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isWechat = /MicroMessenger/i.test(ua);
  if (isWechat) return "请点右上角菜单，用 Safari 或 Chrome 打开这个网页，再安装到桌面。微信内置浏览器不能直接安装 PWA。";
  if (isIOS) return "iPhone 需要用 Safari 打开网页，点底部分享按钮，然后选择“添加到主屏幕”。";
  return "请用 Chrome 或 Edge 打开网页，点浏览器菜单里的“安装应用”或“添加到主屏幕”。";
}

async function handleInstallPwa() {
  if (isStandaloneMode()) {
    toast("已经是桌面 App 模式");
    return;
  }
  if (state.installPromptEvent) {
    const event = state.installPromptEvent;
    state.installPromptEvent = null;
    await event.prompt();
    const choice = await event.userChoice;
    toast(choice.outcome === "accepted" ? "已开始安装" : "已取消安装");
    return;
  }
  alert(installHelpMessage());
}

async function handleFetchModels() {
  saveMeSettingFromInputs();
  const settings = getSettings();
  els.fetchModelsBtn.disabled = true;
  els.modelStatus.textContent = "正在拉取模型列表...";
  try {
    const models = await fetchAvailableModels(settings);
    const nextModel = settings.model && models.includes(settings.model) ? settings.model : models[0];
    saveSettings({ availableModels: models, model: nextModel });
    els.modelInput.value = nextModel;
    renderMe();
    els.modelStatus.textContent = `已拉取 ${models.length} 个模型`;
    toast("模型列表已更新");
  } catch (error) {
    handleApiError(error);
    els.modelStatus.textContent = error.message;
  } finally {
    els.fetchModelsBtn.disabled = false;
  }
}

function downloadJSON() {
  const blob = new Blob([JSON.stringify(exportAllData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `xiaoshouji-data-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importJSON(file) {
  const text = await file.text();
  importAllData(JSON.parse(text));
  render();
  toast("导入完成");
}

function maybeGenerateOfflineUnread() {
  const settings = getSettings();
  const last = getLastOpenAt();
  if (!settings.allowProactiveMessage || !last) return;
  const diff = Date.now() - new Date(last).getTime();
  if (diff < 1000 * 60 * 60 * 3) return;
  const roles = getRoles();
  const current = getCurrentRoleId();
  for (const role of roles) {
    if (role.id !== current) setUnread(role.id, Math.max(getUnread()[role.id] || 0, 1));
  }
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    if (event.target.closest(".message-row .bubble")) return;
    if (!event.target.closest(".message-action-menu")) closeMessageActionMenu();
  });
  els.tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tabTarget)));
  $("#backToChatsBtn").addEventListener("click", closeChat);
  $("#topNewChatBtn").addEventListener("click", openNewChatDialog);
  $("#addRoleBtn").addEventListener("click", () => openRoleDialog());
  $("#closeNewChatBtn").addEventListener("click", () => closeDialog(els.newChatDialog));
  $("#newContactFromChatBtn").addEventListener("click", () => {
    closeDialog(els.newChatDialog);
    openRoleDialog(null, { startChatAfterSave: true });
  });
  $("#emptyAddRoleBtn")?.addEventListener("click", openNewChatDialog);
  $("#chatSearch").addEventListener("input", renderChatList);

  els.sendBtn.addEventListener("click", sendMessage);
  els.messageInput.addEventListener("input", autoResizeInput);
  els.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  $$(".mode-pill").forEach((button) => {
    button.addEventListener("click", () => {
      setCurrentMode(button.dataset.mode);
      renderChatDetail();
      toast(button.dataset.mode === "offline" ? "已切到线下模式" : "已切到线上模式");
    });
  });

  $("#pullProactiveBtn").addEventListener("click", createProactiveMessage);
  $("#goApiSettingsBtn").addEventListener("click", openApiSettings);
  els.inputPlusBtn.addEventListener("click", toggleAttachPanel);
  els.attachImageBtn.addEventListener("click", () => els.imageAttachInput.click());
  els.attachFileBtn.addEventListener("click", () => els.fileAttachInput.click());
  els.regenerateBtn.addEventListener("click", regenerateLastReply);
  els.proactiveTalkBtn.addEventListener("click", createProactiveMessage);
  els.imageAttachInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await sendLocalAttachment(file, "image");
  });
  els.fileAttachInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await sendLocalAttachment(file, "file");
  });

  $("#openChatMenuBtn").addEventListener("click", openChatInfo);
  $("#backToChatInfoBtn").addEventListener("click", closeChatInfo);
  els.pinChatInput.addEventListener("change", () => {
    const role = getRole();
    saveRole({ ...role, isPinned: els.pinChatInput.checked });
    renderChatInfo();
    renderChatList();
    toast(els.pinChatInput.checked ? "已置顶" : "已取消置顶");
  });
  els.blockChatInput.addEventListener("change", () => {
    const role = getRole();
    saveRole({ ...role, isBlocked: els.blockChatInput.checked });
    renderChatInfo();
    renderChatList();
    toast(els.blockChatInput.checked ? "已加入黑名单" : "已移出黑名单");
  });
  $("#addMemoryBtn").addEventListener("click", () => {
    const text = els.newMemoryInput.value.trim();
    if (!text) return toast("先写一条希望对方记住的事");
    addMemory(getCurrentRoleId(), { content: text, importance: 5, emotionWeight: 5 });
    els.newMemoryInput.value = "";
    renderMemoryEditList();
    toast("已添加记忆");
  });
  $("#infoGenerateMemoryBtn").addEventListener("click", async () => {
    try {
      const items = await summarizeRecentChatToMemory();
      renderMemoryEditList();
      toast(items.length ? `整理了 ${items.length} 条记忆` : "没有发现值得长期记住的内容");
    } catch (error) {
      handleApiError(error);
    }
  });
  $("#infoGenerateMomentBtn").addEventListener("click", async () => {
    await handleGenerateMoment();
  });
  $("#infoEditRoleBtn").addEventListener("click", () => {
    openRoleDialog(getCurrentRoleId());
  });

  els.roleForm.addEventListener("submit", saveRoleFromForm);
  $("#closeRoleDialogBtn").addEventListener("click", () => {
    state.startChatAfterSave = false;
    closeDialog(els.roleDialog);
  });
  els.roleAvatarInput.addEventListener("change", async () => {
    const file = els.roleAvatarInput.files?.[0];
    if (file) els.roleAvatarPreview.src = await readFileAsDataURL(file);
  });
  els.deleteRoleBtn.addEventListener("click", () => {
    if (!state.editingRoleId) return;
    if (confirm("确定删除这个联系人吗？聊天、记忆、朋友圈也会一起删除。")) {
      deleteRole(state.editingRoleId);
      closeDialog(els.roleDialog);
      render();
      toast("联系人已删除");
    }
  });

  $("#closeProfileBtn").addEventListener("click", () => closeDialog(els.profileDialog));
  $("#profileChatBtn").addEventListener("click", () => {
    closeDialog(els.profileDialog);
    openChat(state.profileRoleId);
  });
  $("#profileEditBtn").addEventListener("click", () => {
    closeDialog(els.profileDialog);
    openRoleDialog(state.profileRoleId);
  });

  $("#generateMomentBtn").addEventListener("click", handleGenerateMoment);

  [
    els.userNameInput,
    els.userPersonaInput,
    els.apiKeyInput,
    els.apiBaseInput,
    els.modelInput,
    els.defaultModeSelect,
    els.talkLevelInput,
    els.allowProactiveInput,
    els.allowMemoryInput,
    els.allowMomentsInput,
  ].forEach((input) => input.addEventListener("change", saveMeSettingFromInputs));
  els.fetchModelsBtn.addEventListener("click", handleFetchModels);
  els.talkLevelInput.addEventListener("input", () => {
    els.talkLevelText.textContent = `Lv${els.talkLevelInput.value}`;
  });
  els.userAvatarInput.addEventListener("change", async () => {
    const file = els.userAvatarInput.files?.[0];
    if (file) {
      saveSettings({ userAvatar: await readFileAsDataURL(file) });
      renderMe();
      renderMessages();
    }
  });
  els.momentsCoverInput.addEventListener("change", async () => {
    const file = els.momentsCoverInput.files?.[0];
    if (file) {
      saveSettings({ momentsCover: await readFileAsDataURL(file) });
      renderMoments();
      toast("朋友圈背景已更换");
    }
  });
  $("#changeMomentsCoverBtn").addEventListener("click", () => els.momentsCoverInput.click());

  $("#exportDataBtn").addEventListener("click", downloadJSON);
  $("#exportTopBtn").addEventListener("click", downloadJSON);
  els.installPwaBtn.addEventListener("click", handleInstallPwa);
  $("#importDataInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await importJSON(file);
  });
  $("#clearChatBtn").addEventListener("click", () => {
    if (confirm("确定清空当前联系人聊天记录吗？")) {
      clearChats(getCurrentRoleId());
      render();
      toast("聊天记录已清空");
    }
  });
  $("#clearMemoryBtn").addEventListener("click", () => {
    if (confirm("确定清空当前联系人记忆吗？")) {
      clearMemories(getCurrentRoleId());
      toast("记忆已清空");
    }
  });
}

async function handleGenerateMoment() {
  try {
    toast("正在生成朋友圈…");
    await createMomentForRole(getCurrentRoleId());
    switchTab("moments");
    toast("朋友圈发好了");
  } catch (error) {
    handleApiError(error);
  }
}

function tickClock() {
  els.nowLabel.textContent = `${getTimeContext().period} ${formatClock()}`;
}

function bootstrap() {
  initStore();
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPromptEvent = event;
  });
  maybeGenerateOfflineUnread();
  bindEvents();
  render();
  tickClock();
  setInterval(tickClock, 30 * 1000);
  window.addEventListener("beforeunload", () => setLastOpenAt(nowISO()));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") setLastOpenAt(nowISO());
  });
}

bootstrap();
