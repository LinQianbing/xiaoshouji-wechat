import { getChats, getCurrentRoleId, getRole, getSettings } from "./storage.js?v=2";

const SHOT_WIDTH = 750;
const MARGIN_X = 30;
const AVATAR_SIZE = 54;
const AVATAR_RADIUS = 9;
const AVATAR_GAP = 14;
const BUBBLE_PAD_X = 20;
const BUBBLE_PAD_Y = 15;
const BUBBLE_RADIUS = 9;
const MAX_BUBBLE_WIDTH = 500;
const TEXT_SIZE = 28;
const SMALL_TEXT_SIZE = 22;
const LINE_HEIGHT = 39;
const ROW_GAP = 20;

const imageCache = new Map();

function $(selector) {
  return document.querySelector(selector);
}

function getShotDialogParts() {
  return {
    dialog: $("#shotDialog"),
    preview: $("#shotPreview"),
    saveLink: $("#downloadShotLink"),
    closeBtn: $("#closeShotDialogBtn"),
  };
}

function polishShotDialogText() {
  const { saveLink, closeBtn } = getShotDialogParts();
  if (closeBtn) closeBtn.textContent = "关闭";
  if (saveLink) saveLink.textContent = "保存图片";
  const shotBtn = $("#shotSelectedMessagesBtn");
  if (shotBtn) shotBtn.textContent = "生成长图";
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) {
    window.alert(message);
    return;
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function getSelectedMessageIdsFromDom() {
  const rows = Array.from(document.querySelectorAll(".message-row.selected, .message-row:has(.message-check.checked)"));
  return rows
    .map((row) => row.dataset.messageId || row.getAttribute("data-message-id") || row.querySelector("[data-message-id]")?.dataset.messageId)
    .filter(Boolean);
}

function messageText(message) {
  if (!message) return "";
  if (message.isRevoked) return "撤回了一条消息";
  if (message.type === "image") return message.fileName ? `[图片] ${message.fileName}` : "[图片]";
  if (message.type === "file") return message.fileName ? `[文件] ${message.fileName}` : "[文件]";
  if (message.type === "pat" || message.type === "system") return message.content || "系统消息";
  return message.content || "";
}

function fileSizeText(bytes = 0) {
  const value = Number(bytes) || 0;
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatShotTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const paragraphs = String(text || "").split(/\n/);
  const lines = [];
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const char of Array.from(paragraph)) {
      const next = line + char;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawWrappedText(ctx, lines, x, y, lineHeight) {
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
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

async function loadImage(src) {
  if (!src) return null;
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

function drawAvatarFallback(ctx, name, x, y, isUser) {
  const gradient = ctx.createLinearGradient(x, y, x + AVATAR_SIZE, y + AVATAR_SIZE);
  gradient.addColorStop(0, isUser ? "#dbeafe" : "#dcfce7");
  gradient.addColorStop(1, isUser ? "#93c5fd" : "#86efac");
  ctx.fillStyle = gradient;
  roundRect(ctx, x, y, AVATAR_SIZE, AVATAR_SIZE, AVATAR_RADIUS);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.95)";
  ctx.font = `600 24px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(name || "小").trim().slice(0, 1), x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

async function drawAvatar(ctx, src, name, x, y, isUser) {
  const image = await loadImage(src);
  ctx.save();
  roundRect(ctx, x, y, AVATAR_SIZE, AVATAR_SIZE, AVATAR_RADIUS);
  ctx.clip();
  if (!drawCoverImage(ctx, image, x, y, AVATAR_SIZE, AVATAR_SIZE)) {
    ctx.restore();
    drawAvatarFallback(ctx, name, x, y, isUser);
    return;
  }
  ctx.restore();
}

function measureMessage(ctx, message, allMessages, role, settings) {
  if (message.type === "pat" || message.type === "system") {
    const lines = wrapText(ctx, messageText(message), SHOT_WIDTH - MARGIN_X * 4);
    return { kind: "system", lines, height: Math.max(38, lines.length * 31 + 14) };
  }

  const mainText = message.type === "file" ? `${messageText(message)}${fileSizeText(message.fileSize) ? `\n${fileSizeText(message.fileSize)}` : ""}` : messageText(message);
  const textMaxWidth = MAX_BUBBLE_WIDTH - BUBBLE_PAD_X * 2;
  const lines = wrapText(ctx, mainText, textMaxWidth);
  const quote = message.quoteToMessageId ? allMessages.find((item) => item.id === message.quoteToMessageId) : null;
  const quoteText = quote ? `${quote.sender === "user" ? settings.userName || "我" : role.name}：${messageText(quote)}` : "";
  const quoteLines = quoteText ? wrapText(ctx, quoteText, textMaxWidth - 18).slice(0, 2) : [];
  let mediaHeight = 0;
  let mediaWidth = 0;
  if (message.type === "image" && message.dataUrl) {
    mediaHeight = 260;
    mediaWidth = 260;
  }
  const textHeight = lines.length * LINE_HEIGHT;
  const quoteHeight = quoteLines.length ? quoteLines.length * 30 + 18 : 0;
  const contentHeight = Math.max(mediaHeight, textHeight) + quoteHeight;
  const contentWidth = Math.min(
    MAX_BUBBLE_WIDTH - BUBBLE_PAD_X * 2,
    Math.max(mediaWidth, ...lines.map((line) => ctx.measureText(line).width), ...quoteLines.map((line) => ctx.measureText(line).width + 18), 24),
  );
  const bubbleWidth = Math.ceil(contentWidth + BUBBLE_PAD_X * 2);
  const bubbleHeight = Math.ceil(contentHeight + BUBBLE_PAD_Y * 2);
  return {
    kind: "bubble",
    lines,
    quoteLines,
    bubbleWidth,
    bubbleHeight,
    height: Math.max(AVATAR_SIZE, bubbleHeight),
    mediaWidth,
    mediaHeight,
  };
}

function drawBubbleTail(ctx, x, y, side, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (side === "right") {
    ctx.moveTo(x, y + 19);
    ctx.lineTo(x + 13, y + 25);
    ctx.lineTo(x, y + 31);
  } else {
    ctx.moveTo(x, y + 19);
    ctx.lineTo(x - 13, y + 25);
    ctx.lineTo(x, y + 31);
  }
  ctx.closePath();
  ctx.fill();
}

async function drawMessage(ctx, message, layout, y, allMessages, role, settings) {
  if (layout.kind === "system") {
    const boxWidth = Math.min(SHOT_WIDTH - 120, Math.max(...layout.lines.map((line) => ctx.measureText(line).width), 80) + 32);
    const x = (SHOT_WIDTH - boxWidth) / 2;
    ctx.fillStyle = "rgba(0,0,0,.18)";
    roundRect(ctx, x, y, boxWidth, layout.height, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `500 ${SMALL_TEXT_SIZE}px sans-serif`;
    ctx.textAlign = "center";
    layout.lines.forEach((line, index) => ctx.fillText(line, SHOT_WIDTH / 2, y + 28 + index * 31));
    ctx.textAlign = "left";
    return;
  }

  const isUser = message.sender === "user";
  const avatarX = isUser ? SHOT_WIDTH - MARGIN_X - AVATAR_SIZE : MARGIN_X;
  const bubbleColor = isUser ? "#95ec69" : "#ffffff";
  const bubbleRight = isUser ? avatarX - AVATAR_GAP : MARGIN_X + AVATAR_SIZE + AVATAR_GAP + layout.bubbleWidth;
  const bubbleX = isUser ? bubbleRight - layout.bubbleWidth : MARGIN_X + AVATAR_SIZE + AVATAR_GAP;
  const avatarSrc = isUser ? settings.userAvatar : role.avatar;
  const avatarName = isUser ? settings.userName || "我" : role.name;

  await drawAvatar(ctx, avatarSrc, avatarName, avatarX, y, isUser);

  ctx.fillStyle = bubbleColor;
  roundRect(ctx, bubbleX, y, layout.bubbleWidth, layout.bubbleHeight, BUBBLE_RADIUS);
  ctx.fill();
  drawBubbleTail(ctx, isUser ? bubbleX + layout.bubbleWidth : bubbleX, y, isUser ? "right" : "left", bubbleColor);

  let textY = y + BUBBLE_PAD_Y + TEXT_SIZE;
  ctx.fillStyle = "#111111";
  ctx.font = `400 ${TEXT_SIZE}px sans-serif`;
  ctx.textAlign = "left";
  if (message.type === "image" && message.dataUrl) {
    const image = await loadImage(message.dataUrl);
    ctx.save();
    roundRect(ctx, bubbleX + BUBBLE_PAD_X, y + BUBBLE_PAD_Y, layout.mediaWidth, layout.mediaHeight, 8);
    ctx.clip();
    if (!drawCoverImage(ctx, image, bubbleX + BUBBLE_PAD_X, y + BUBBLE_PAD_Y, layout.mediaWidth, layout.mediaHeight)) {
      ctx.restore();
      ctx.fillStyle = "#f3f3f3";
      roundRect(ctx, bubbleX + BUBBLE_PAD_X, y + BUBBLE_PAD_Y, layout.mediaWidth, layout.mediaHeight, 8);
      ctx.fill();
      ctx.fillStyle = "#888";
      ctx.font = `400 ${SMALL_TEXT_SIZE}px sans-serif`;
      ctx.fillText("图片加载失败", bubbleX + BUBBLE_PAD_X + 58, y + BUBBLE_PAD_Y + 134);
    } else {
      ctx.restore();
    }
    textY = y + BUBBLE_PAD_Y + layout.mediaHeight + 38;
  } else {
    drawWrappedText(ctx, layout.lines, bubbleX + BUBBLE_PAD_X, textY, LINE_HEIGHT);
    textY += layout.lines.length * LINE_HEIGHT;
  }

  if (layout.quoteLines.length) {
    const quoteY = textY + 5;
    const quoteX = bubbleX + BUBBLE_PAD_X;
    const quoteWidth = layout.bubbleWidth - BUBBLE_PAD_X * 2;
    const quoteHeight = layout.quoteLines.length * 30 + 16;
    ctx.fillStyle = "rgba(0,0,0,.06)";
    roundRect(ctx, quoteX, quoteY, quoteWidth, quoteHeight, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fillRect(quoteX + 9, quoteY + 8, 4, quoteHeight - 16);
    ctx.fillStyle = "#777777";
    ctx.font = `400 ${SMALL_TEXT_SIZE}px sans-serif`;
    drawWrappedText(ctx, layout.quoteLines, quoteX + 22, quoteY + 30, 30);
  }
}

async function makeShot(messages, role, settings) {
  const tempCanvas = document.createElement("canvas");
  const measureCtx = tempCanvas.getContext("2d");
  measureCtx.font = `400 ${TEXT_SIZE}px sans-serif`;

  const layouts = messages.map((message) => measureMessage(measureCtx, message, messages, role, settings));
  const headerHeight = 122;
  const footerHeight = 42;
  const totalMessagesHeight = layouts.reduce((sum, layout) => sum + layout.height + ROW_GAP, 0);
  const canvas = document.createElement("canvas");
  canvas.width = SHOT_WIDTH;
  canvas.height = Math.max(260, headerHeight + totalMessagesHeight + footerHeight);
  const ctx = canvas.getContext("2d");

  const bgImage = await loadImage(role.chatBackground || "");
  ctx.fillStyle = "#ededed";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (bgImage) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    drawCoverImage(ctx, bgImage, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  ctx.fillStyle = "rgba(237,237,237,.94)";
  ctx.fillRect(0, 0, canvas.width, headerHeight);
  ctx.fillStyle = "#111111";
  ctx.font = "600 34px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(role.name || "聊天截图", SHOT_WIDTH / 2, 56);
  ctx.fillStyle = "#888888";
  ctx.font = `400 ${SMALL_TEXT_SIZE}px sans-serif`;
  ctx.fillText(`${messages.length} 条消息 · ${formatShotTime(messages[0]?.createdAt)}`, SHOT_WIDTH / 2, 91);
  ctx.textAlign = "left";

  let y = headerHeight + 20;
  for (let index = 0; index < messages.length; index += 1) {
    await drawMessage(ctx, messages[index], layouts[index], y, messages, role, settings);
    y += layouts[index].height + ROW_GAP;
  }

  return canvas.toDataURL("image/png");
}

async function openCleanShot(selectedIds) {
  const roleId = getCurrentRoleId();
  const role = getRole(roleId);
  const settings = getSettings();
  const allMessages = getChats(roleId);
  const selectedSet = new Set(selectedIds);
  const messages = allMessages.filter((message) => selectedSet.has(message.id));
  if (!messages.length) {
    showToast("没有找到选中的消息");
    return;
  }
  showToast("正在生成长图…");
  const dataUrl = await makeShot(messages, role, settings);
  const { dialog, preview, saveLink } = getShotDialogParts();
  if (!dialog || !preview || !saveLink) {
    window.open(dataUrl, "_blank", "noopener,noreferrer");
    return;
  }
  polishShotDialogText();
  preview.src = dataUrl;
  saveLink.href = dataUrl;
  saveLink.download = `小手机聊天截图-${role.name || "聊天"}.png`;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "open");
}

document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest?.("#shotSelectedMessagesBtn");
    if (!button) return;
    const selectedIds = getSelectedMessageIdsFromDom();
    if (!selectedIds.length) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openCleanShot(selectedIds).catch((error) => {
      console.error(error);
      showToast("截图生成失败，可以再试一次");
    });
  },
  true,
);

polishShotDialogText();
new MutationObserver(polishShotDialogText).observe(document.body, { childList: true, subtree: true });
