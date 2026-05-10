import {
  DEFAULT_ROLE_AVATAR,
  DEFAULT_USER_AVATAR,
  addChat,
  clearChats,
  clearMemories,
  createId,
  deleteChats,
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
  updateChat,
} from "./storage.js?v=2";
import { formatChatTime, formatClock, formatMomentTime, getAwayLabel, getTimeContext, nowISO } from "./time.js";
import { ApiNotConfiguredError, fetchAvailableModels, generateChatReply, isApiReady } from "./ai.js?v=3";
import { memoryCategoryLabel, rememberText, selectRelevantMemories, summarizeRecentChatToMemory } from "./memory.js";
import {
  USER_MOMENTS_ID,
  commentMoment,
  createMomentForRole,
  createUserMoment,
  deleteMoment,
  getAllMoments,
  likeMoment,
  updateUserMoment,
} from "./moments.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function syncViewportHeight() {
  const height = Math.floor(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight);
  if (height > 0) document.documentElement.style.setProperty("--app-height", `${height}px`);
}

const state = {
  activeTab: "chats",
  editingRoleId: null,
  profileRoleId: null,
  startChatAfterSave: false,
  sending: false,
  replying: false,
  replyQueue: Promise.resolve(),
  editingMessageId: null,
  selectedMessageIds: new Set(),
  isSelectingMessages: false,
  quoteToMessageId: "",
  momentActionMenu: null,
  editingMomentId: null,
  momentImages: [],
  momentLongPressTimer: null,
  recallRange: "auto",
  recallCustomStart: "",
  recallCustomEnd: "",
  installPromptEvent: null,
  longPressTimer: null,
  messageActionMenu: null,
  chatActionMenu: null,
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
  patBtn: $("#patBtn"),
  rolePatBtn: $("#rolePatBtn"),
  toast: $("#toast"),

  roleDialog: $("#roleDialog"),
  roleForm: $("#roleForm"),
  roleDialogTitle: $("#roleDialogTitle"),
  roleNameInput: $("#roleNameInput"),
  roleGenderInput: $("#roleGenderInput"),
  roleDescInput: $("#roleDescInput"),
  rolePatSuffixInput: $("#rolePatSuffixInput"),
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
  chatBgInput: $("#chatBgInput"),
  changeChatBgBtn: $("#changeChatBgBtn"),
  clearChatBgBtn: $("#clearChatBgBtn"),
  chatBgPreview: $("#chatBgPreview"),
  chatBgStatus: $("#chatBgStatus"),
  newMemoryInput: $("#newMemoryInput"),
  memoryEditList: $("#memoryEditList"),

  meAvatar: $("#meAvatar"),
  momentsUserAvatar: $("#momentsUserAvatar"),
  momentsHeroName: $("#momentsHeroName"),
  momentsCoverInput: $("#momentsCoverInput"),
  userAvatarInput: $("#userAvatarInput"),
  userNameInput: $("#userNameInput"),
  userPersonaInput: $("#userPersonaInput"),
  userPatSuffixInput: $("#userPatSuffixInput"),
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

function ensureRuntimeUI() {
  if (!$("#recallRangeBtn")) {
    $("#nowLabel")?.insertAdjacentHTML("beforebegin", `<button class="recall-range-btn" id="recallRangeBtn" type="button">查记录：智能</button>`);
  }
  if (!$("#editMessageBar")) {
    $(".input-bar").insertAdjacentHTML(
      "beforebegin",
      `<div class="edit-message-bar hidden" id="editMessageBar">
        <span>正在编辑</span>
        <button id="cancelEditMessageBtn" type="button">取消</button>
      </div>`,
    );
  }
  if (!$("#messageSelectBar")) {
    $(".input-bar").insertAdjacentHTML(
      "beforebegin",
      `<div class="message-select-bar hidden" id="messageSelectBar">
        <button id="cancelSelectMessagesBtn" type="button">取消</button>
        <span id="selectedMessageCount">已选择 0 条</span>
        <button id="deleteSelectedMessagesBtn" type="button">删除</button>
        <button id="shotSelectedMessagesBtn" type="button">截图</button>
      </div>`,
    );
  }
  if (!$("#quoteReplyBar")) {
    $(".input-bar").insertAdjacentHTML(
      "beforebegin",
      `<div class="quote-reply-bar hidden" id="quoteReplyBar">
        <div>
          <strong id="quoteReplyTitle">引用</strong>
          <span id="quoteReplyText"></span>
        </div>
        <button id="cancelQuoteReplyBtn" type="button" aria-label="取消引用">×</button>
      </div>`,
    );
  }
  if (!$("#momentDialog")) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<dialog class="sheet-dialog" id="momentDialog">
        <form method="dialog" class="moment-sheet" id="momentForm">
          <header>
            <button value="cancel" type="button" id="closeMomentDialogBtn">取消</button>
            <strong id="momentDialogTitle">发朋友圈</strong>
            <button value="default" type="submit">发表</button>
          </header>
          <div class="moment-editor-body">
            <textarea id="momentTextInput" rows="6" placeholder="这一刻的想法..."></textarea>
            <div class="moment-image-grid" id="momentImageList"></div>
            <label class="moment-add-image">
              <input id="momentImageInput" type="file" accept="image/*" multiple hidden />
              <span>+</span>
            </label>
            <label class="setting-row moment-option">
              <span>所在位置</span>
              <input id="momentLocationInput" type="text" placeholder="不显示位置" />
            </label>
            <label class="setting-row moment-option">
              <span>谁可以看</span>
              <select id="momentVisibilitySelect">
                <option value="public">公开</option>
                <option value="private">仅自己可见</option>
              </select>
            </label>
            <label class="setting-row moment-option">
              <span>提醒谁看</span>
              <input id="momentMentionsInput" type="text" placeholder="输入联系人名，用逗号分隔" />
            </label>
          </div>
        </form>
      </dialog>
      <dialog class="sheet-dialog" id="momentChoiceDialog">
        <div class="menu-sheet">
          <button id="writeMomentBtn" type="button">发朋友圈</button>
          <button id="writeTextMomentBtn" type="button">写想法</button>
          <button id="aiMomentBtn" type="button">让当前联系人发一条</button>
          <button id="closeMomentChoiceBtn" type="button">取消</button>
        </div>
      </dialog>
      <dialog class="sheet-dialog" id="shotDialog">
        <div class="shot-sheet">
          <header>
            <button type="button" id="closeShotDialogBtn">完成</button>
            <strong>聊天截图</strong>
            <a id="downloadShotLink" download="xiaoshouji-chat.png">保存</a>
          </header>
          <div class="shot-preview-wrap"><img id="shotPreview" alt="聊天截图预览" /></div>
        </div>
      </dialog>
      <dialog class="sheet-dialog" id="recallRangeDialog">
        <div class="menu-sheet recall-range-sheet">
          <h2>查聊天记录范围</h2>
          <button type="button" data-recall-range="auto">智能判断</button>
          <button type="button" data-recall-range="all">全部聊天</button>
          <button type="button" data-recall-range="today">今天</button>
          <button type="button" data-recall-range="yesterday">昨天</button>
          <button type="button" data-recall-range="7d">近 7 天</button>
          <button type="button" data-recall-range="30d">近 30 天</button>
          <div class="recall-custom-fields">
            <label>开始<input id="recallStartInput" type="date" /></label>
            <label>结束<input id="recallEndInput" type="date" /></label>
            <button id="saveRecallCustomBtn" type="button">使用自定义</button>
          </div>
          <button id="closeRecallRangeBtn" type="button">取消</button>
        </div>
      </dialog>`,
    );
  }

  Object.assign(els, {
    recallRangeBtn: $("#recallRangeBtn"),
    recallRangeDialog: $("#recallRangeDialog"),
    recallStartInput: $("#recallStartInput"),
    recallEndInput: $("#recallEndInput"),
    saveRecallCustomBtn: $("#saveRecallCustomBtn"),
    editMessageBar: $("#editMessageBar"),
    cancelEditMessageBtn: $("#cancelEditMessageBtn"),
    messageSelectBar: $("#messageSelectBar"),
    selectedMessageCount: $("#selectedMessageCount"),
    cancelSelectMessagesBtn: $("#cancelSelectMessagesBtn"),
    deleteSelectedMessagesBtn: $("#deleteSelectedMessagesBtn"),
    shotSelectedMessagesBtn: $("#shotSelectedMessagesBtn"),
    quoteReplyBar: $("#quoteReplyBar"),
    quoteReplyTitle: $("#quoteReplyTitle"),
    quoteReplyText: $("#quoteReplyText"),
    cancelQuoteReplyBtn: $("#cancelQuoteReplyBtn"),
    momentDialog: $("#momentDialog"),
    momentForm: $("#momentForm"),
    momentDialogTitle: $("#momentDialogTitle"),
    momentTextInput: $("#momentTextInput"),
    momentImageInput: $("#momentImageInput"),
    momentImageList: $("#momentImageList"),
    momentLocationInput: $("#momentLocationInput"),
    momentVisibilitySelect: $("#momentVisibilitySelect"),
    momentMentionsInput: $("#momentMentionsInput"),
    momentChoiceDialog: $("#momentChoiceDialog"),
    shotDialog: $("#shotDialog"),
    shotPreview: $("#shotPreview"),
    downloadShotLink: $("#downloadShotLink"),
  });
}

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

function loadCanvasImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    try {
      image.src = /^(data:|blob:|https?:)/i.test(src) ? src : new URL(src, window.location.href).href;
    } catch {
      image.src = src;
    }
  });
}

function drawCoverImage(ctx, image, x, y, width, height) {
  if (!image) return false;
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) return false;
  const imageRatio = naturalWidth / naturalHeight;
  const targetRatio = width / height;
  const sourceWidth = imageRatio > targetRatio ? naturalHeight * targetRatio : naturalWidth;
  const sourceHeight = imageRatio > targetRatio ? naturalHeight : naturalWidth / targetRatio;
  const sourceX = (naturalWidth - sourceWidth) / 2;
  const sourceY = (naturalHeight - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  return true;
}

function drawRoundedCoverImage(ctx, image, x, y, width, height, radius) {
  if (!image) return false;
  ctx.save();
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.clip();
  const drawn = drawCoverImage(ctx, image, x, y, width, height);
  ctx.restore();
  return drawn;
}

function drawFallbackAvatar(ctx, name, x, y, size, radius, isUser = false) {
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, isUser ? "#dbeafe" : "#dff8e8");
  gradient.addColorStop(1, isUser ? "#93c5fd" : "#7adf9a");
  ctx.fillStyle = gradient;
  roundRectPath(ctx, x, y, size, size, radius);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  roundRectPath(ctx, x + size * 0.23, y + size * 0.18, size * 0.54, size * 0.64, size * 0.16);
  ctx.fill();
  ctx.fillStyle = "#22343f";
  ctx.font = `600 ${Math.max(13, Math.round(size * 0.36))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(name || "小").trim().slice(0, 1), x + size / 2, y + size / 2 + 1);
  ctx.textBaseline = "alphabetic";
}

function formatFileSize(bytes = 0) {
  if (!bytes) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function messagePreviewText(message, role = getRole(), settings = getSettings()) {
  if (!message) return "";
  if (message.isRevoked) return "撤回了一条消息";
  if (message.type === "pat" || message.type === "system") return message.content || "系统消息";
  if (message.type === "image") return message.fileName ? `[图片] ${message.fileName}` : "[图片]";
  if (message.type === "file") return message.fileName ? `[文件] ${message.fileName}` : "[文件]";
  return message.content || "";
}

function quoteAuthorName(message, role = getRole(), settings = getSettings()) {
  if (!message) return "";
  if (message.sender === "user") return settings.userName || "我";
  if (message.sender === "role") return role.name;
  return "系统";
}

function findQuoteMessage(messages = getChats(getCurrentRoleId()), messageId = state.quoteToMessageId) {
  return messages.find((message) => message.id === messageId) || null;
}

function renderQuoteCard(message, messages, role, settings) {
  const quote = findQuoteMessage(messages, message.quoteToMessageId);
  if (!quote) return "";
  const author = quoteAuthorName(quote, role, settings);
  const text = messagePreviewText(quote, role, settings) || "原消息";
  return `
    <div class="quote-card">
      <span>${escapeHTML(author)}：</span>${escapeHTML(text)}
    </div>
  `;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecentEnough(value, minutes = 2) {
  return Date.now() - new Date(value).getTime() <= minutes * 60 * 1000;
}

function toDateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function startOfLocalDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfLocalDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function presetRecallRange(preset) {
  const now = new Date();
  if (preset === "today") return { key: "today", label: "今天", start: startOfLocalDay(now), end: endOfLocalDay(now) };
  if (preset === "yesterday") {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return { key: "yesterday", label: "昨天", start: startOfLocalDay(date), end: endOfLocalDay(date) };
  }
  if (preset === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { key: "7d", label: "近7天", start, end: now };
  }
  if (preset === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { key: "30d", label: "近30天", start, end: now };
  }
  return { key: "all", label: "全部", start: null, end: null };
}

function customDayRecallRange(date, label = "") {
  return { key: "custom-day", label: label || toDateInputValue(date), start: startOfLocalDay(date), end: endOfLocalDay(date) };
}

function manualRecallRange() {
  if (state.recallRange === "custom") {
    const start = state.recallCustomStart ? startOfLocalDay(new Date(`${state.recallCustomStart}T00:00:00`)) : null;
    const end = state.recallCustomEnd ? endOfLocalDay(new Date(`${state.recallCustomEnd}T00:00:00`)) : null;
    const startLabel = state.recallCustomStart || "最早";
    const endLabel = state.recallCustomEnd || "现在";
    return { key: "custom", label: `${startLabel} 至 ${endLabel}`, start, end };
  }
  return presetRecallRange(state.recallRange);
}

function inferRecallRangeFromText(text = "") {
  const value = String(text);
  const exactDate = value.match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})日?/);
  if (exactDate) {
    const date = new Date(Number(exactDate[1]), Number(exactDate[2]) - 1, Number(exactDate[3]));
    return customDayRecallRange(date, `${exactDate[1]}年${Number(exactDate[2])}月${Number(exactDate[3])}日`);
  }
  const monthDay = value.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (monthDay) {
    const date = new Date(new Date().getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]));
    return customDayRecallRange(date, `${Number(monthDay[1])}月${Number(monthDay[2])}日`);
  }
  if (/昨天/.test(value)) return presetRecallRange("yesterday");
  if (/今天|刚才|上午|中午|下午|晚上|今晚/.test(value)) return presetRecallRange("today");
  if (/上周|这周|本周|最近一周|近7天|最近7天|七天/.test(value)) return presetRecallRange("7d");
  if (/上个月|这个月|本月|最近一个月|近30天|最近30天|三十天/.test(value)) return presetRecallRange("30d");
  return presetRecallRange("all");
}

function resolveRecallRange(text = "") {
  if (state.recallRange !== "auto") return manualRecallRange();
  const inferred = inferRecallRangeFromText(text);
  return { ...inferred, auto: true };
}

function updateRecallRangeButton() {
  if (!els.recallRangeBtn) return;
  const label = state.recallRange === "auto" ? "智能" : manualRecallRange().label;
  els.recallRangeBtn.textContent = `查记录：${label}`;
}

function renderMessageContent(msg, messages = getChats(getCurrentRoleId()), role = getRole(), settings = getSettings()) {
  const quoteCard = msg.quoteToMessageId ? renderQuoteCard(msg, messages, role, settings) : "";
  if (msg.isRevoked) {
    const canEdit = msg.sender === "user" && msg.type === "text" && msg.originalContent;
    return `你撤回了一条消息${canEdit ? ` <button class="reedit-message" data-message-id="${msg.id}" type="button">重新编辑</button>` : ""}`;
  }
  if (msg.type === "pat" || msg.type === "system") {
    return escapeHTML(msg.content);
  }
  if (msg.type === "image" && msg.dataUrl) {
    return `
      <div class="image-message">
        <img src="${msg.dataUrl}" alt="${escapeHTML(msg.fileName || "图片")}">
        ${msg.fileName ? `<span>${escapeHTML(msg.fileName)}</span>` : ""}
      </div>
      ${quoteCard}
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
      ${quoteCard}
    `;
  }
  return `${escapeHTML(msg.content)}${quoteCard}`;
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

function updateQuoteReplyUI() {
  if (!els.quoteReplyBar) return;
  const role = getRole();
  const settings = getSettings();
  const quote = findQuoteMessage(getChats(role.id));
  els.quoteReplyBar.classList.toggle("hidden", !quote);
  if (!quote) return;
  els.quoteReplyTitle.textContent = `引用 ${quoteAuthorName(quote, role, settings)}`;
  els.quoteReplyText.textContent = messagePreviewText(quote, role, settings);
}

function startQuoteReply(messageId) {
  const message = getChats(getCurrentRoleId()).find((item) => item.id === messageId);
  if (!message || message.isRevoked || message.sender === "system" || message.type === "pat" || message.type === "system") return;
  state.quoteToMessageId = messageId;
  state.isSelectingMessages = false;
  state.selectedMessageIds.clear();
  cancelEditMessage();
  closeAttachPanel();
  renderMessages();
  els.messageInput.focus();
}

function cancelQuoteReply() {
  state.quoteToMessageId = "";
  updateQuoteReplyUI();
}

function closeChatActionMenu() {
  state.chatActionMenu?.remove();
  state.chatActionMenu = null;
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
    els.apiKeyInput?.closest("details")?.setAttribute("open", "open");
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
  state.quoteToMessageId = "";
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
  state.quoteToMessageId = "";
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

  $$(".chat-cell").forEach((cell) => {
    let chatPressTimer = null;
    let longPressed = false;
    cell.addEventListener("pointerdown", () => {
      longPressed = false;
      clearTimeout(chatPressTimer);
      chatPressTimer = setTimeout(() => {
        longPressed = true;
        openChatActionMenu(cell, cell.dataset.roleId);
      }, 560);
    });
    cell.addEventListener("pointerup", () => clearTimeout(chatPressTimer));
    cell.addEventListener("pointerleave", () => clearTimeout(chatPressTimer));
    cell.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openChatActionMenu(cell, cell.dataset.roleId);
    });
    cell.addEventListener("click", () => {
      if (!longPressed) openChat(cell.dataset.roleId);
    });
  });
}

function openChatActionMenu(target, roleId) {
  const role = getRole(roleId);
  closeChatActionMenu();
  const rect = target.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "message-action-menu chat-action-menu";
  menu.innerHTML = `
    <button type="button" data-action="pin">${role.isPinned ? "取消置顶" : "置顶"}</button>
    <button type="button" data-action="clear">删除该聊天</button>
  `;
  document.body.appendChild(menu);
  menu.style.left = `${Math.min(window.innerWidth - menu.offsetWidth - 12, Math.max(12, rect.right - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(12, rect.top + 12)}px`;
  menu.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action) return;
    closeChatActionMenu();
    if (action === "pin") {
      saveRole({ ...role, isPinned: !role.isPinned });
      renderChatList();
      toast(role.isPinned ? "已取消置顶" : "已置顶");
    }
    if (action === "clear" && confirm(`删除和 ${role.name} 的聊天记录？`)) {
      clearChats(roleId);
      renderChatList();
      toast("聊天记录已删除");
    }
  });
  state.chatActionMenu = menu;
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
  const userLikeName = settings.userName || "我";
  els.momentsUserAvatar.src = settings.userAvatar || DEFAULT_USER_AVATAR;
  els.momentsHeroName.textContent = `${settings.userName || "我"}的小手机`;
  const hero = $(".moments-hero");
  hero.style.backgroundImage = settings.momentsCover
    ? `linear-gradient(180deg, rgba(0, 0, 0, 0.10), rgba(0, 0, 0, 0.52)), url("${settings.momentsCover}")`
    : "";
  const moments = getAllMoments();
  if (!moments.length) {
    els.momentsList.innerHTML = `<div class="empty-state">朋友圈还空着。<br>点右上角相机，发第一条朋友圈。</div>`;
    return;
  }
  els.momentsList.innerHTML = moments
    .map((item) => {
      const comments = item.comments || [];
      const images = item.images || [];
      const likedBy = Array.isArray(item.likedBy) ? item.likedBy : [];
      const likeNames = likedBy.includes(USER_MOMENTS_ID) ? [userLikeName] : [];
      return `
        <article class="moment-card" data-role-id="${item.role.id}" data-moment-id="${item.id}">
          <img class="moment-avatar" src="${item.role.avatar || DEFAULT_ROLE_AVATAR}" alt="${escapeHTML(item.role.name)}头像">
          <div>
            <p class="moment-name">${escapeHTML(item.role.name)}${item.authorType === "user" ? '<span class="moment-self-tag">我</span>' : ""}</p>
            <div class="moment-text">${escapeHTML(item.content)}</div>
            ${images.length ? `<div class="moment-image-wall">${images.map((image) => `<img src="${image}" alt="朋友圈图片">`).join("")}</div>` : ""}
            <div class="moment-foot">
              <time>${formatMomentTime(item.createdAt)}</time>
              ${item.location ? `<span>${escapeHTML(item.location)}</span>` : ""}
              ${item.visibility === "private" ? `<span>仅自己可见</span>` : ""}
              <button class="moment-more-btn" type="button" aria-label="更多操作"></button>
            </div>
            ${
              likeNames.length || comments.length
                ? `<div class="comment-box moment-social">
                    ${likeNames.length ? `<div class="moment-likes">♡ ${likeNames.map(escapeHTML).join("，")}</div>` : ""}
                    ${
                      comments.length
                        ? `<div class="moment-comments">${comments
                            .map((comment, index) => {
                              const commentId = comment.id || `legacy_${index}`;
                              const legacyReply = !comment.replyToName && String(comment.userName || "").includes(" 回复 ")
                                ? String(comment.userName).split(" 回复 ")
                                : null;
                              const commentName = legacyReply ? legacyReply[0] : comment.userName;
                              const targetName = comment.replyToName || legacyReply?.slice(1).join(" 回复 ") || "";
                              const replyName = targetName ? ` 回复 <b>${escapeHTML(targetName)}</b>` : "";
                              return `<p class="moment-comment-row" data-comment-id="${escapeHTML(commentId)}" data-comment-name="${escapeHTML(commentName)}"><b>${escapeHTML(commentName)}</b>${replyName}：${escapeHTML(comment.text)}</p>`;
                            })
                            .join("")}</div>`
                        : ""
                    }
                  </div>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");

  $$(".moment-more-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const card = btn.closest(".moment-card");
      openMomentInteractMenu(btn, card.dataset.roleId, card.dataset.momentId);
    });
  });

  $$(".moment-comment-row").forEach((row) => {
    row.addEventListener("click", () => {
      const card = row.closest(".moment-card");
      addMomentComment(card.dataset.roleId, card.dataset.momentId, row.dataset.commentId, row.dataset.commentName);
    });
  });
  bindMomentActions();
}

function closeMomentActionMenu() {
  state.momentActionMenu?.remove();
  state.momentActionMenu = null;
}

function bindMomentActions() {
  $$(".moment-card").forEach((card) => {
    const roleId = card.dataset.roleId;
    const momentId = card.dataset.momentId;
    card.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".moment-more-btn, .moment-comment-row")) return;
      clearTimeout(state.momentLongPressTimer);
      state.momentLongPressTimer = setTimeout(() => openMomentActionMenu(card, roleId, momentId), 560);
    });
    card.addEventListener("pointerup", () => clearTimeout(state.momentLongPressTimer));
    card.addEventListener("pointerleave", () => clearTimeout(state.momentLongPressTimer));
    card.addEventListener("pointercancel", () => clearTimeout(state.momentLongPressTimer));
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openMomentActionMenu(card, roleId, momentId);
    });
  });
}

function addMomentComment(roleId, momentId, replyToCommentId = "", replyToName = "") {
  const label = replyToName ? `回复 ${replyToName}` : "评论内容";
  const text = prompt(label);
  if (!text?.trim()) return;
  commentMoment(roleId, momentId, text, getSettings().userName || "我", replyToCommentId, replyToName);
  renderMoments();
}

function openMomentInteractMenu(target, roleId, momentId) {
  const moment = getAllMoments().find((item) => item.id === momentId && item.role.id === roleId);
  if (!moment) return;
  closeMomentActionMenu();
  const likedBy = Array.isArray(moment.likedBy) ? moment.likedBy : [];
  const liked = likedBy.includes(USER_MOMENTS_ID);
  const rect = target.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "message-action-menu moment-action-menu moment-interact-menu";
  menu.innerHTML = `
    <button type="button" data-action="like">${liked ? "取消" : "赞"}</button>
    <button type="button" data-action="comment">评论</button>
  `;
  document.body.appendChild(menu);
  const left = rect.left - menu.offsetWidth - 8;
  const useLeftSide = left >= 12;
  menu.classList.toggle("from-right", useLeftSide);
  menu.style.left = `${useLeftSide ? left : Math.min(window.innerWidth - menu.offsetWidth - 12, rect.right + 8)}px`;
  menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 12, Math.max(12, rect.top + rect.height / 2 - menu.offsetHeight / 2))}px`;
  menu.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action) return;
    closeMomentActionMenu();
    if (action === "like") {
      likeMoment(roleId, momentId);
      renderMoments();
    }
    if (action === "comment") addMomentComment(roleId, momentId);
  });
  state.momentActionMenu = menu;
}

function openMomentActionMenu(target, roleId, momentId) {
  const moment = getAllMoments().find((item) => item.id === momentId && item.role.id === roleId);
  if (!moment || moment.authorType !== "user") return;
  closeMomentActionMenu();
  const rect = target.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "message-action-menu moment-action-menu";
  menu.innerHTML = `
    <button type="button" data-action="edit">重新编辑</button>
    <button type="button" data-action="toggle">${moment.visibility === "private" ? "设为公开" : "设为私密"}</button>
    <button type="button" data-action="delete">删除</button>
  `;
  document.body.appendChild(menu);
  menu.style.left = `${Math.min(window.innerWidth - menu.offsetWidth - 12, Math.max(12, rect.right - menu.offsetWidth))}px`;
  menu.style.top = `${Math.max(12, rect.top + 8)}px`;
  menu.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action) return;
    closeMomentActionMenu();
    if (action === "edit") openMomentEditor({ moment });
    if (action === "toggle") {
      updateUserMoment(momentId, { visibility: moment.visibility === "private" ? "public" : "private" });
      renderMoments();
      toast("已更新可见范围");
    }
    if (action === "delete" && confirm("删除这条朋友圈？")) {
      deleteMoment(USER_MOMENTS_ID, momentId);
      renderMoments();
      toast("已删除");
    }
  });
  state.momentActionMenu = menu;
}

function renderMomentImageList() {
  els.momentImageList.innerHTML = state.momentImages
    .map(
      (image, index) => `
      <button class="moment-image-item" data-index="${index}" type="button">
        <img src="${image}" alt="待发布图片">
        <span>×</span>
      </button>
    `,
    )
    .join("");
  $$(".moment-image-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.momentImages.splice(Number(button.dataset.index), 1);
      renderMomentImageList();
    });
  });
}

function openMomentEditor(options = {}) {
  const moment = options.moment || null;
  state.editingMomentId = moment?.id || null;
  state.momentImages = [...(moment?.images || [])];
  els.momentDialogTitle.textContent = moment ? "重新编辑" : options.textOnly ? "写想法" : "发朋友圈";
  els.momentTextInput.value = moment?.content || "";
  els.momentLocationInput.value = moment?.location || "";
  els.momentVisibilitySelect.value = moment?.visibility || "public";
  els.momentMentionsInput.value = (moment?.mentions || []).join("，");
  renderMomentImageList();
  showDialog(els.momentDialog);
  requestAnimationFrame(() => els.momentTextInput.focus());
}

function closeMomentEditor() {
  state.editingMomentId = null;
  state.momentImages = [];
  closeDialog(els.momentDialog);
}

function saveMomentFromForm(event) {
  event.preventDefault();
  const payload = {
    content: els.momentTextInput.value.trim(),
    images: [...state.momentImages],
    visibility: els.momentVisibilitySelect.value,
    location: els.momentLocationInput.value.trim(),
    mentions: els.momentMentionsInput.value
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter(Boolean),
  };
  try {
    const wasEditing = Boolean(state.editingMomentId);
    if (state.editingMomentId) updateUserMoment(state.editingMomentId, payload);
    else createUserMoment(payload);
    closeMomentEditor();
    switchTab("moments");
    toast(wasEditing ? "朋友圈已更新" : "已发表");
  } catch (error) {
    toast(error.message);
  }
}

function renderMe() {
  const settings = getSettings();
  els.meAvatar.src = settings.userAvatar || DEFAULT_USER_AVATAR;
  els.userNameInput.value = settings.userName || "";
  els.userPersonaInput.value = settings.userPersona || "";
  els.userPatSuffixInput.value = settings.patSuffix || "";
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
  const hasChatBackground = Boolean(role.chatBackground);
  els.clearChatBgBtn.classList.toggle("hidden", !hasChatBackground);
  els.chatBgPreview.classList.toggle("has-image", hasChatBackground);
  els.chatBgPreview.style.backgroundImage = hasChatBackground ? `url("${role.chatBackground}")` : "";
  els.chatBgStatus.textContent = hasChatBackground ? "已设置" : "默认";
  renderMemoryEditList();
}

function applyChatBackground(role = getRole()) {
  const background = role.chatBackground || "";
  els.chatDetail.classList.toggle("custom-chat-bg", Boolean(background));
  els.chatDetail.style.backgroundImage = background ? `url("${background}")` : "";
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
          <p class="memory-meta">${memoryCategoryLabel(item.category)} · 重要度${item.importance ?? 3} · 情绪${item.emotionWeight ?? 3}</p>
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
  els.chatSubtitle.textContent = role.isBlocked ? "已加入黑名单 · 对方知道了" : `${mode === "offline" ? "线下模式" : "在线 · 线上模式"}`;
  els.nowLabel.textContent = `${time.period} ${time.time}`;
  $$(".mode-pill").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  applyChatBackground(role);
  updateRecallRangeButton();
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
    state.quoteToMessageId = "";
    updateMessageSelectionUI();
    updateQuoteReplyUI();
    return;
  }

  let lastDivider = "";
  els.messageList.innerHTML = messages
    .map((msg) => {
      const time = formatChatTime(msg.createdAt);
      const divider = time !== lastDivider ? `<div class="time-divider">${time}</div>` : "";
      lastDivider = time;
      const isUser = msg.sender === "user";
      const isSystem = msg.sender === "system" || msg.isRevoked || msg.type === "pat" || msg.type === "system";
      const avatar = isUser ? settings.userAvatar || DEFAULT_USER_AVATAR : role.avatar || DEFAULT_ROLE_AVATAR;
      const selected = state.selectedMessageIds.has(msg.id);
      const showBlockedWarning = role.isBlocked && msg.sender === "role" && !isSystem;
      if (isSystem) {
        return `
        ${divider}
        <div class="message-row system ${selected ? "selected" : ""}" data-message-id="${msg.id}">
          ${state.isSelectingMessages ? `<button class="message-check ${selected ? "checked" : ""}" type="button" aria-label="选择消息"></button>` : ""}
          <div class="system-bubble">${renderMessageContent(msg, messages, role, settings)}</div>
        </div>
      `;
      }
      return `
        ${divider}
        <div class="message-row ${isUser ? "user" : "role"} ${selected ? "selected" : ""}" data-message-id="${msg.id}">
          ${state.isSelectingMessages ? `<button class="message-check ${selected ? "checked" : ""}" type="button" aria-label="选择消息"></button>` : ""}
          <img class="message-avatar" src="${avatar}" alt="头像">
          <div class="bubble">${renderMessageContent(msg, messages, role, settings)}</div>
          ${showBlockedWarning ? `<span class="blocked-exclaim" aria-label="对方知道自己被拉黑">!</span>` : ""}
        </div>
      `;
    })
    .join("");

  requestAnimationFrame(() => {
    els.messageList.scrollTop = els.messageList.scrollHeight;
  });
  updateMessageSelectionUI();
  updateQuoteReplyUI();
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

function recallStatusText(range) {
  if (!range || range.key === "all") return "对方正在翻旧账中......";
  return `对方正在翻${range.label}的旧账中......`;
}

function appendRecallStatus(range) {
  const status = document.createElement("div");
  status.className = "message-row system recall-status";
  status.innerHTML = `<div class="system-bubble">${escapeHTML(recallStatusText(range))}</div>`;
  els.messageList.appendChild(status);
  els.messageList.scrollTop = els.messageList.scrollHeight;
  return status;
}

function normalizeSearchText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\u4e00-\u9fff]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRecallKeywords(text = "") {
  const raw = String(text);
  const quoted = Array.from(raw.matchAll(/[“"']([^“"']{2,30})[”"']/g)).map((match) => match[1]);
  const subjectMatches = Array.from(
    raw.matchAll(/(?:说|提过|聊过|关于|关键词|查一下|查下|查|找一下|找下|找)([^，。？！?]{2,24}?)(?:是|在|的|什么时候|哪天|几点|吗|呢|呀|啊|，|。|？|\?|$)/g),
  )
    .map((match) => match[1].replace(/^(过|了|一下|下|找|查|说)/, "").trim())
    .filter(Boolean);
  const normalized = normalizeSearchText(raw);
  const stopwords = new Set([
    "之前",
    "以前",
    "上次",
    "刚才",
    "记得",
    "记不记得",
    "有没有",
    "是不是",
    "什么",
    "时候",
    "时间",
    "哪天",
    "聊天",
    "记录",
    "说过",
    "说了",
    "提过",
    "我们",
    "你",
    "我",
    "的",
    "了",
    "吗",
    "呢",
    "啊",
    "呀",
    "帮我",
    "查找",
    "找找",
    "翻翻",
  ]);
  const tokens = normalized
    .split(/\s+/)
    .flatMap((part) => {
      if (/^[a-z0-9]+$/i.test(part)) return [part];
      const chunks = part.match(/[\u4e00-\u9fff]{2,8}|[a-z0-9]{2,}/gi) || [];
      return chunks.length ? chunks : [part];
    })
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !stopwords.has(item));
  return [...new Set([...quoted, ...subjectMatches, ...tokens])].slice(0, 10);
}

function shouldRecallChatHistory(text = "") {
  return /之前|以前|上次|刚才|记得|记不记得|说过|聊过|提过|哪天|什么时候|几点|翻旧账|查(一下|下)?|找(一下|下)?|关键词|聊天记录|历史记录/.test(
    text,
  );
}

function searchChatHistory(roleId, userText, options = {}) {
  if (!shouldRecallChatHistory(userText)) return [];
  const keywords = extractRecallKeywords(userText);
  if (!keywords.length) return [];
  const excludedIds = new Set(options.excludeIds || []);
  const range = options.range || presetRecallRange("all");
  const startMs = range.start ? range.start.getTime() : null;
  const endMs = range.end ? range.end.getTime() : null;
  const messages = getChats(roleId);
  const hits = [];
  for (const message of messages) {
    if (!message.content || message.isRevoked || excludedIds.has(message.id)) continue;
    const createdMs = new Date(message.createdAt).getTime();
    if (startMs && createdMs < startMs) continue;
    if (endMs && createdMs > endMs) continue;
    const haystack = normalizeSearchText(message.content);
    const matched = keywords.filter((keyword) => haystack.includes(normalizeSearchText(keyword)));
    if (!matched.length) continue;
    hits.push({
      id: message.id,
      sender: message.sender,
      type: message.type || "text",
      content: message.content,
      createdAt: message.createdAt,
      matchedKeywords: matched,
      score: matched.length * 10 + Math.min(4, message.content.length / 20),
    });
  }
  return hits
    .sort((a, b) => b.score - a.score || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function recentMessagesForReply(roleId, quoteToMessageId = "") {
  const messages = getChats(roleId);
  const recent = messages.slice(-18);
  if (!quoteToMessageId || recent.some((message) => message.id === quoteToMessageId)) return recent;
  const quote = messages.find((message) => message.id === quoteToMessageId);
  return quote ? [quote, ...recent].slice(-19) : recent;
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
  const message = messages.find((item) => item.id === messageId);
  if (!message) return;
  const turn = buildRegenerationPlan(messages, messageId);
  const isUser = message.sender === "user";
  const isText = message.type === "text" && !message.isRevoked;
  const isSystem = message.sender === "system" || message.type === "pat" || message.isRevoked;
  const buttons = [];
  if (isText) buttons.push(`<button type="button" data-action="copy">复制</button>`);
  if (isUser && isText) buttons.push(`<button type="button" data-action="edit">编辑</button>`);
  if ((isUser || message.type === "pat") && !message.isRevoked && isRecentEnough(message.createdAt)) {
    buttons.push(`<button type="button" data-action="recall">撤回</button>`);
  }
  if (turn) buttons.push(`<button type="button" data-action="regenerate">重新生成</button>`);
  if (!isSystem) buttons.push(`<button type="button" data-action="quote">引用</button>`);
  buttons.push(`<button type="button" data-action="select">多选</button>`);
  buttons.push(`<button type="button" data-action="delete">删除</button>`);
  if (!buttons.length) return;

  closeMessageActionMenu();
  const rect = target.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "message-action-menu";
  menu.innerHTML = buttons.join("");
  document.body.appendChild(menu);

  const left = Math.min(window.innerWidth - menu.offsetWidth - 12, Math.max(12, rect.left + rect.width / 2 - menu.offsetWidth / 2));
  const top = Math.max(12, rect.top - 46);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action) return;
    handleMessageAction(action, messageId);
  });
  state.messageActionMenu = menu;
}

function clearLongPressTimer() {
  clearTimeout(state.longPressTimer);
  state.longPressTimer = null;
}

function bindMessageLongPress() {
  $$(".message-row").forEach((row) => {
    const messageId = row?.dataset.messageId;
    if (!messageId) return;
    const pressTarget = row.querySelector(".bubble, .system-bubble");
    const avatar = row.querySelector(".message-avatar");
    const reeditButton = row.querySelector(".reedit-message");

    row.querySelector(".message-check")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSelectedMessage(messageId);
    });
    row.addEventListener("click", (event) => {
      if (!state.isSelectingMessages || event.target.closest(".reedit-message")) return;
      toggleSelectedMessage(messageId);
    });
    reeditButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      startEditMessage(messageId, { useOriginal: true });
    });
    if (row.classList.contains("role")) {
      avatar?.addEventListener("dblclick", () => createPatMessage("user"));
    }
    if (!pressTarget) return;

    pressTarget.addEventListener("pointerdown", () => {
      clearLongPressTimer();
      state.longPressTimer = setTimeout(() => openMessageActionMenu(pressTarget, messageId), 560);
    });
    pressTarget.addEventListener("pointerup", clearLongPressTimer);
    pressTarget.addEventListener("pointerleave", clearLongPressTimer);
    pressTarget.addEventListener("pointercancel", clearLongPressTimer);
    pressTarget.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openMessageActionMenu(pressTarget, messageId);
    });
  });
}

function handleMessageAction(action, messageId) {
  closeMessageActionMenu();
  if (action === "copy") return copyMessage(messageId);
  if (action === "edit") return startEditMessage(messageId);
  if (action === "recall") return recallMessage(messageId);
  if (action === "regenerate") return regenerateReplyTurn(messageId);
  if (action === "quote") return startQuoteReply(messageId);
  if (action === "select") return enterMessageSelection(messageId);
  if (action === "delete") return deleteSelectedMessages([messageId]);
}

async function copyMessage(messageId) {
  const message = getChats(getCurrentRoleId()).find((item) => item.id === messageId);
  if (!message?.content) return;
  try {
    await navigator.clipboard.writeText(message.content);
    toast("已复制");
  } catch {
    toast("复制失败，请手动选中文字");
  }
}

function startEditMessage(messageId, options = {}) {
  const message = getChats(getCurrentRoleId()).find((item) => item.id === messageId);
  if (!message || message.sender !== "user") return;
  state.editingMessageId = messageId;
  state.quoteToMessageId = "";
  state.isSelectingMessages = false;
  state.selectedMessageIds.clear();
  els.messageInput.value = options.useOriginal ? message.originalContent || message.content : message.content;
  els.sendBtn.textContent = "完成";
  els.editMessageBar.classList.remove("hidden");
  autoResizeInput();
  els.messageInput.focus();
  renderMessages();
}

function cancelEditMessage() {
  state.editingMessageId = null;
  els.messageInput.value = "";
  els.sendBtn.textContent = "发送";
  els.editMessageBar.classList.add("hidden");
  autoResizeInput();
}

function recallMessage(messageId) {
  const roleId = getCurrentRoleId();
  const message = getChats(roleId).find((item) => item.id === messageId);
  if (!message || message.isRevoked) return;
  if (!isRecentEnough(message.createdAt)) return toast("超过 2 分钟，不能撤回了");
  updateChat(roleId, messageId, {
    isRevoked: true,
    revokedAt: nowISO(),
    originalContent: message.originalContent || message.content,
    content: "",
  });
  renderMessages();
  renderChatList();
  toast("已撤回");
}

function enterMessageSelection(messageId) {
  state.isSelectingMessages = true;
  state.selectedMessageIds = new Set([messageId]);
  state.quoteToMessageId = "";
  closeAttachPanel();
  cancelEditMessage();
  renderMessages();
}

function toggleSelectedMessage(messageId) {
  if (!state.isSelectingMessages) return;
  if (state.selectedMessageIds.has(messageId)) state.selectedMessageIds.delete(messageId);
  else state.selectedMessageIds.add(messageId);
  if (!state.selectedMessageIds.size) state.isSelectingMessages = false;
  renderMessages();
}

function cancelMessageSelection() {
  state.isSelectingMessages = false;
  state.selectedMessageIds.clear();
  renderMessages();
}

function updateMessageSelectionUI() {
  if (!els.messageSelectBar) return;
  const count = state.selectedMessageIds.size;
  els.messageSelectBar.classList.toggle("hidden", !state.isSelectingMessages);
  els.selectedMessageCount.textContent = `已选择 ${count} 条`;
  els.deleteSelectedMessagesBtn.disabled = !count;
  els.shotSelectedMessagesBtn.disabled = !count;
}

function deleteSelectedMessages(messageIds = Array.from(state.selectedMessageIds)) {
  if (!messageIds.length) return;
  if (!confirm(`删除 ${messageIds.length} 条消息？`)) return;
  deleteChats(getCurrentRoleId(), messageIds);
  state.selectedMessageIds.clear();
  state.isSelectingMessages = false;
  renderMessages();
  renderChatList();
  toast("已删除");
}

function normalizePatSuffix(value) {
  return String(value || "").trim().slice(0, 24);
}

function formatPatContent(actor, role = getRole(), settings = getSettings()) {
  if (actor === "role") return `${role.name}拍了拍你${normalizePatSuffix(settings.patSuffix)}`;
  return `你拍了拍${role.name}${normalizePatSuffix(role.patSuffix)}`;
}

function addPatChat(roleId, actor, role = getRole(roleId), settings = getSettings()) {
  return addChat(roleId, {
    sender: "system",
    type: "pat",
    content: formatPatContent(actor, role, settings),
    patActor: actor,
    mode: getCurrentMode(),
  });
}

function createPatMessage(actor = "user") {
  const role = getRole();
  const roleId = role.id;
  const settings = getSettings();
  addPatChat(roleId, actor, role, settings);
  closeAttachPanel();
  renderMessages();
  renderChatList();
  navigator.vibrate?.(12);
  if (actor === "user" && isApiReady(settings)) {
    queueModelReply({
      role,
      settings,
      mode: getCurrentMode(),
      roleId,
      recentMessages: getChats(roleId).slice(-18),
      userText: `我刚刚拍了拍你${normalizePatSuffix(role.patSuffix)}。这是拍一拍动作，可以自然回应。`,
    });
  }
}

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text || "").split("\n")) {
    let line = "";
    for (const char of paragraph) {
      const test = line + char;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = test;
      }
    }
    lines.push(line || "");
  }
  return lines;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function renderSelectedMessagesImage() {
  const role = getRole();
  const settings = getSettings();
  const selected = new Set(state.selectedMessageIds);
  const allMessages = getChats(role.id);
  const messages = allMessages.filter((message) => selected.has(message.id));
  if (!messages.length) return toast("先选择要截图的消息");

  const width = 430;
  const padding = 18;
  const avatarSize = 38;
  const avatarGap = 8;
  const maxBubbleWidth = width - padding * 2 - avatarSize - avatarGap - 76;
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = "15px sans-serif";
  const messageById = new Map(allMessages.map((message) => [message.id, message]));
  const rows = await Promise.all(messages.map(async (message) => {
    const text = message.isRevoked ? "你撤回了一条消息" : message.content || message.fileName || "";
    const isSystem = message.sender === "system" || message.type === "pat" || message.isRevoked;
    const image = message.type === "image" && message.dataUrl ? await loadCanvasImage(message.dataUrl) : null;
    const imageWidth = image ? image.naturalWidth || image.width : 0;
    const imageHeight = image ? image.naturalHeight || image.height : 0;
    const mediaWidth = image ? Math.min(190, maxBubbleWidth - 22) : 0;
    const mediaHeight = imageWidth && imageHeight ? Math.min(170, Math.max(86, mediaWidth * (imageHeight / imageWidth))) : 0;
    const lines = wrapCanvasText(measureCtx, text, isSystem ? width - padding * 4 : maxBubbleWidth);
    const imageGap = image && lines.length ? 7 : 0;
    const quote = message.quoteToMessageId ? messageById.get(message.quoteToMessageId) : null;
    const quoteText = quote ? `${quoteAuthorName(quote, role, settings)}：${messagePreviewText(quote, role, settings)}` : "";
    measureCtx.font = "12px sans-serif";
    const quoteLines = quoteText ? wrapCanvasText(measureCtx, quoteText, maxBubbleWidth - 40).slice(0, 2) : [];
    measureCtx.font = "15px sans-serif";
    const quoteHeight = quoteLines.length ? quoteLines.length * 16 + 14 : 0;
    const quoteGap = quoteLines.length ? 7 : 0;
    const height = isSystem
      ? Math.max(30, lines.length * 21 + 10)
      : Math.max(48, lines.length * 21 + 20 + mediaHeight + imageGap + quoteHeight + quoteGap);
    return { message, text, lines, isSystem, image, mediaWidth, mediaHeight, imageGap, quoteLines, quoteHeight, quoteGap, height };
  }));
  const [backgroundImage, userAvatarImage, roleAvatarImage] = await Promise.all([
    loadCanvasImage(role.chatBackground),
    loadCanvasImage(settings.userAvatar || DEFAULT_USER_AVATAR),
    loadCanvasImage(role.avatar || DEFAULT_ROLE_AVATAR),
  ]);
  const headerHeight = 56;
  const height = headerHeight + rows.reduce((sum, row) => sum + row.height + 14, 0) + 22;
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  if (backgroundImage) {
    drawCoverImage(ctx, backgroundImage, 0, 0, width, height);
    ctx.fillStyle = "rgba(237, 237, 237, 0.46)";
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "#ededed";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.fillStyle = "#111";
  ctx.font = "600 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(role.name, width / 2, 36);

  let y = headerHeight;
  for (const row of rows) {
    const { message, lines, isSystem } = row;
    const isUser = message.sender === "user";
    const showBlockedWarning = role.isBlocked && message.sender === "role" && !isSystem;
    if (isSystem) {
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      roundRectPath(ctx, padding * 2, y, width - padding * 4, row.height, 5);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      lines.forEach((line, index) => ctx.fillText(line, width / 2, y + 20 + index * 18));
      y += row.height + 14;
      continue;
    }

    ctx.font = "12px sans-serif";
    const quoteWidth = row.quoteLines?.length ? Math.max(...row.quoteLines.map((line) => ctx.measureText(line).width)) + 34 : 0;
    ctx.font = "15px sans-serif";
    const bubbleWidth = Math.min(maxBubbleWidth, Math.max(44, row.mediaWidth || 0, quoteWidth, ...lines.map((line) => ctx.measureText(line).width)) + 22);
    const avatarX = isUser ? width - padding - avatarSize : padding;
    const bubbleX = isUser ? avatarX - avatarGap - bubbleWidth : padding + avatarSize + avatarGap;
    ctx.fillStyle = isUser ? "#95ec69" : "#fff";
    roundRectPath(ctx, bubbleX, y, bubbleWidth, row.height, 5);
    ctx.fill();
    ctx.fillStyle = "#d8d8d8";
    roundRectPath(ctx, avatarX, y, avatarSize, avatarSize, 7);
    ctx.fill();
    const avatarDrawn = drawRoundedCoverImage(ctx, isUser ? userAvatarImage : roleAvatarImage, avatarX, y, avatarSize, avatarSize, 7);
    if (!avatarDrawn) drawFallbackAvatar(ctx, isUser ? settings.userName || "我" : role.name, avatarX, y, avatarSize, 7, isUser);
    ctx.fillStyle = "#111";
    ctx.font = "15px sans-serif";
    ctx.textAlign = "left";
    lines.forEach((line, index) => ctx.fillText(line, bubbleX + 11, y + 22 + index * 21));
    if (row.image) {
      const imageY = y + 10 + lines.length * 21 + row.imageGap;
      drawRoundedCoverImage(ctx, row.image, bubbleX + 11, imageY, row.mediaWidth, row.mediaHeight, 5);
    }
    if (row.quoteLines?.length) {
      const quoteY = y + 10 + lines.length * 21 + row.imageGap + row.mediaHeight + row.quoteGap;
      ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
      roundRectPath(ctx, bubbleX + 11, quoteY, bubbleWidth - 22, row.quoteHeight, 3);
      ctx.fill();
      ctx.fillStyle = "#777";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      row.quoteLines.forEach((line, index) => ctx.fillText(line, bubbleX + 19, quoteY + 16 + index * 16));
    }
    if (showBlockedWarning) {
      const markX = Math.min(width - padding - 9, bubbleX + bubbleWidth + 14);
      const markY = y + Math.min(24, row.height / 2);
      ctx.fillStyle = "#fa5151";
      ctx.beginPath();
      ctx.arc(markX, markY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("!", markX, markY + 5);
    }
    y += row.height + 14;
  }

  const url = canvas.toDataURL("image/png");
  els.shotPreview.src = url;
  els.downloadShotLink.href = url;
  showDialog(els.shotDialog);
}

async function appendModelReply({
  role,
  roleId,
  settings,
  mode,
  userText,
  recentMessages,
  recalledMessages = [],
  recalledRange = null,
  recallTriggered = false,
  recallStatus = null,
}) {
  if (recallTriggered || recalledMessages.length) {
    recallStatus ||= appendRecallStatus(recalledRange);
    await delay(900);
  }
  const typing = appendTyping();
  try {
    const replyGroupId = createId("reply");
    const replyToMessageId = [...recentMessages].reverse().find((msg) => msg.sender === "user")?.id || "";
    const reply = await generateChatReply({
      role,
      settings,
      mode,
      memories: selectRelevantMemories(getMemories(roleId), userText, recentMessages),
      recentMessages,
      recalledMessages,
      recalledRange,
      userText,
    });
    recallStatus?.remove();
    typing.remove();
    for (let index = 0; index < reply.messages.length; index += 1) {
      const message = reply.messages[index];
      await delay(Math.min(950, 320 + String(message).length * 18 + index * 140));
      addChat(roleId, {
        sender: "role",
        content: String(message).trim(),
        mode,
        replyGroupId,
        replyToMessageId,
        replyPrompt: userText,
      });
      renderMessages();
      renderChatList();
    }
    if (reply.shouldPat) {
      await delay(420);
      addPatChat(roleId, "role", role, settings);
      renderMessages();
      renderChatList();
      navigator.vibrate?.(10);
    }
    if (settings.allowMemory && reply.shouldRemember && reply.memoryCandidate) {
      rememberText(roleId, reply.memoryCandidate, 4, 4, { source: "chat", confidence: 0.72 });
    }
    renderChatList();
    return true;
  } catch (error) {
    recallStatus?.remove();
    typing.remove();
    handleApiError(error);
    renderMessages();
    return false;
  }
}

function queueModelReply(payload) {
  state.replyQueue = state.replyQueue
    .catch(() => {})
    .then(async () => {
      state.replying = true;
      try {
        await appendModelReply(payload);
      } finally {
        state.replying = false;
      }
    });
  return state.replyQueue;
}

async function sendMessage() {
  const text = els.messageInput.value.trim();
  if (!text) return;
  const role = getRole();
  const roleId = role.id;
  const settings = getSettings();
  const mode = getCurrentMode();
  if (state.editingMessageId) {
    updateChat(roleId, state.editingMessageId, { content: text, isRevoked: false, revokedAt: "", originalContent: "" });
    cancelEditMessage();
    renderMessages();
    renderChatList();
    toast("已修改");
    return;
  }
  els.messageInput.value = "";
  autoResizeInput();
  const quoteToMessageId = findQuoteMessage(getChats(roleId), state.quoteToMessageId)?.id || "";
  state.quoteToMessageId = "";
  const sentMessage = addChat(roleId, { sender: "user", content: text, mode, quoteToMessageId });
  const recentMessages = recentMessagesForReply(roleId, quoteToMessageId);
  const recallTriggered = shouldRecallChatHistory(text);
  const recalledRange = resolveRecallRange(text);
  const recalledMessages = searchChatHistory(roleId, text, { excludeIds: [sentMessage.id], range: recalledRange });
  renderMessages();
  renderChatList();
  const recallStatus = recallTriggered ? appendRecallStatus(recalledRange) : null;

  queueModelReply({
    role,
    roleId,
    settings,
    mode,
    recentMessages,
    recalledMessages,
    recalledRange,
    recallTriggered,
    recallStatus,
    userText: text,
  });
}

async function sendLocalAttachment(file, type) {
  if (!file) return;
  const role = getRole();
  const roleId = role.id;
  const settings = getSettings();
  const mode = getCurrentMode();
  const isImage = type === "image";
  const content = isImage ? `[图片] ${file.name || "未命名图片"}` : `[文件] ${file.name || "未命名文件"}`;
  const dataUrl = isImage ? await readFileAsDataURL(file) : "";
  const quoteToMessageId = findQuoteMessage(getChats(roleId), state.quoteToMessageId)?.id || "";
  state.quoteToMessageId = "";

  closeAttachPanel();
  const sentMessage = addChat(roleId, {
    sender: "user",
    type,
    content,
    fileName: file.name,
    fileSize: file.size,
    dataUrl,
    mode,
    quoteToMessageId,
  });
  const recentMessages = recentMessagesForReply(roleId, quoteToMessageId);
  const recallTriggered = shouldRecallChatHistory(content);
  const recalledRange = resolveRecallRange(content);
  const recalledMessages = searchChatHistory(roleId, content, { excludeIds: [sentMessage.id], range: recalledRange });
  renderMessages();
  renderChatList();
  const recallStatus = recallTriggered ? appendRecallStatus(recalledRange) : null;

  queueModelReply({
    role,
    roleId,
    settings,
    mode,
    recentMessages,
    recalledMessages,
    recalledRange,
    recallTriggered,
    recallStatus,
    userText: content,
  });
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
  els.rolePatSuffixInput.value = role?.patSuffix || "";
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
    patSuffix: els.rolePatSuffixInput.value.trim(),
    isPinned: existing?.isPinned,
    isBlocked: existing?.isBlocked,
    chatBackground: existing?.chatBackground,
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
    patSuffix: els.userPatSuffixInput.value.trim(),
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
    if (!event.target.closest(".moment-action-menu, .moment-more-btn")) closeMomentActionMenu();
    if (!event.target.closest(".chat-action-menu")) closeChatActionMenu();
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
  els.recallRangeBtn.addEventListener("click", () => {
    els.recallStartInput.value = state.recallCustomStart;
    els.recallEndInput.value = state.recallCustomEnd;
    showDialog(els.recallRangeDialog);
  });
  $$("[data-recall-range]").forEach((button) => {
    button.addEventListener("click", () => {
      state.recallRange = button.dataset.recallRange;
      closeDialog(els.recallRangeDialog);
      updateRecallRangeButton();
      toast(`查记录范围：${state.recallRange === "auto" ? "智能判断" : manualRecallRange().label}`);
    });
  });
  els.saveRecallCustomBtn.addEventListener("click", () => {
    state.recallRange = "custom";
    state.recallCustomStart = els.recallStartInput.value;
    state.recallCustomEnd = els.recallEndInput.value;
    closeDialog(els.recallRangeDialog);
    updateRecallRangeButton();
    toast(`查记录范围：${manualRecallRange().label}`);
  });
  $("#closeRecallRangeBtn").addEventListener("click", () => closeDialog(els.recallRangeDialog));

  $("#pullProactiveBtn").addEventListener("click", createProactiveMessage);
  $("#goApiSettingsBtn").addEventListener("click", openApiSettings);
  els.inputPlusBtn.addEventListener("click", toggleAttachPanel);
  els.attachImageBtn.addEventListener("click", () => els.imageAttachInput.click());
  els.attachFileBtn.addEventListener("click", () => els.fileAttachInput.click());
  els.regenerateBtn.addEventListener("click", regenerateLastReply);
  els.proactiveTalkBtn.addEventListener("click", createProactiveMessage);
  els.patBtn.addEventListener("click", () => createPatMessage("user"));
  els.rolePatBtn.addEventListener("click", () => createPatMessage("role"));
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
  els.changeChatBgBtn.addEventListener("click", () => els.chatBgInput.click());
  els.chatBgInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const role = getRole();
    const chatBackground = await readFileAsDataURL(file);
    saveRole({ ...role, chatBackground });
    els.chatBgPreview.classList.add("has-image");
    els.chatBgPreview.style.backgroundImage = `url("${chatBackground}")`;
    els.chatBgStatus.textContent = "已设置";
    els.clearChatBgBtn.classList.remove("hidden");
    renderChatInfo();
    renderChatDetail();
    toast("聊天背景已更换");
  });
  els.clearChatBgBtn.addEventListener("click", () => {
    const role = getRole();
    saveRole({ ...role, chatBackground: "" });
    renderChatInfo();
    renderChatDetail();
    toast("已恢复默认聊天背景");
  });
  $("#addMemoryBtn").addEventListener("click", () => {
    const text = els.newMemoryInput.value.trim();
    if (!text) return toast("先写一条希望对方记住的事");
    rememberText(getCurrentRoleId(), text, 5, 5, { source: "manual", confidence: 1 });
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

  let momentCameraLongPressed = false;
  $("#generateMomentBtn").addEventListener("pointerdown", () => {
    momentCameraLongPressed = false;
    state.momentLongPressTimer = setTimeout(() => {
      momentCameraLongPressed = true;
      openMomentEditor({ textOnly: true });
    }, 560);
  });
  $("#generateMomentBtn").addEventListener("pointerup", () => clearTimeout(state.momentLongPressTimer));
  $("#generateMomentBtn").addEventListener("pointerleave", () => clearTimeout(state.momentLongPressTimer));
  $("#generateMomentBtn").addEventListener("click", () => {
    if (momentCameraLongPressed) return;
    showDialog(els.momentChoiceDialog);
  });
  $("#writeMomentBtn").addEventListener("click", () => {
    closeDialog(els.momentChoiceDialog);
    openMomentEditor();
  });
  $("#writeTextMomentBtn").addEventListener("click", () => {
    closeDialog(els.momentChoiceDialog);
    openMomentEditor({ textOnly: true });
  });
  $("#aiMomentBtn").addEventListener("click", async () => {
    closeDialog(els.momentChoiceDialog);
    await handleGenerateMoment();
  });
  $("#closeMomentChoiceBtn").addEventListener("click", () => closeDialog(els.momentChoiceDialog));
  $("#closeMomentDialogBtn").addEventListener("click", closeMomentEditor);
  els.momentForm.addEventListener("submit", saveMomentFromForm);
  els.momentImageInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []).slice(0, 9 - state.momentImages.length);
    event.target.value = "";
    for (const file of files) state.momentImages.push(await readFileAsDataURL(file));
    renderMomentImageList();
  });
  els.cancelEditMessageBtn.addEventListener("click", cancelEditMessage);
  els.cancelQuoteReplyBtn.addEventListener("click", cancelQuoteReply);
  els.cancelSelectMessagesBtn.addEventListener("click", cancelMessageSelection);
  els.deleteSelectedMessagesBtn.addEventListener("click", () => deleteSelectedMessages());
  els.shotSelectedMessagesBtn.addEventListener("click", renderSelectedMessagesImage);
  $("#closeShotDialogBtn").addEventListener("click", () => closeDialog(els.shotDialog));

  [
    els.userNameInput,
    els.userPersonaInput,
    els.userPatSuffixInput,
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
  $("#exportTopBtn")?.addEventListener("click", downloadJSON);
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
  syncViewportHeight();
  initStore();
  ensureRuntimeUI();
  window.addEventListener("resize", syncViewportHeight);
  window.addEventListener("orientationchange", syncViewportHeight);
  window.visualViewport?.addEventListener("resize", syncViewportHeight);
  window.visualViewport?.addEventListener("scroll", syncViewportHeight);
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
