import { getTimeContext } from "./time.js";

function talkLevelRule(level) {
  const n = Number(level) || 5;
  if (n <= 3) return "话唠程度偏低：回复 1 条短消息为主，克制、少解释，不要主动延展太多。";
  if (n <= 6) return "话唠程度正常：回复 1-2 条短消息，自然接话，可以轻微主动。";
  return "话唠程度偏高：回复 2-4 条短消息，更主动、更黏一点，但每条都要短，像微信连发。";
}

function modeRule(mode) {
  if (mode === "offline") {
    return "当前是线下模式：你可以和用户处在同一场景里，可以写少量动作、神态、靠近、一起做事，但不要变成大段小说旁白。";
  }
  return "当前是线上模式：你知道自己是在手机里和用户微信式聊天。不要描写现实里的拥抱、触碰、贴近、坐在旁边等线下身体互动。";
}

function memoryText(memories = []) {
  if (!memories.length) return "暂无长期记忆。你不能假装一开始就很了解用户，要通过聊天慢慢了解。";
  return memories
    .slice(0, 12)
    .map((item, index) => `${index + 1}. ${item.content}（重要度${item.importance ?? 3}，情绪权重${item.emotionWeight ?? 3}）`)
    .join("\n");
}

function recentMessagesText(messages = []) {
  if (!messages.length) return "暂无最近聊天。";
  return messages
    .slice(-16)
    .map((msg) => `${msg.sender === "user" ? "用户" : "角色"}：${msg.content}`)
    .join("\n");
}

export function buildChatPrompt({ role, settings, mode, memories, recentMessages, userText }) {
  const time = getTimeContext();
  const system = [
    "你是一个“小手机”AI 角色聊天网页 App 里的角色。",
    "你要像微信聊天一样自然：短句、停顿、可以连续发几条，但不要长篇作文。",
    "不要总是总结，不要过度解释，不要像 AI 助手汇报。",
    "你必须遵守用户填写的角色设定，不要额外脑补太多设定。",
    talkLevelRule(settings.talkLevel),
    modeRule(mode),
    "你要参考当前时间，但不要机械播报时间。早上可以早安/起床/上课；中午可以吃饭/午休；晚上可以回宿舍/作业/休息；凌晨语气轻一点，可以提醒别太熬。",
    "回复必须是合法 JSON，不要在 JSON 外输出任何解释。",
    "JSON 格式：{\"messages\":[\"第一条短消息\",\"第二条短消息\"],\"mood\":\"normal\",\"shouldRemember\":false,\"memoryCandidate\":\"\"}",
    "messages 必须是字符串数组；每条是一条聊天气泡。",
  ].join("\n");

  const user = [
    "【角色设定】",
    `名字：${role.name}`,
    `性别：${role.gender || "未设定"}`,
    `设定：${role.description || "用户还没有填写详细设定。"}`,
    "",
    "【用户信息】",
    `用户昵称：${settings.userName || "我"}`,
    "",
    "【当前时间】",
    `日期：${time.date}`,
    `星期：${time.weekday}`,
    `时间：${time.time}`,
    `时间段：${time.period}`,
    "",
    "【当前模式】",
    mode,
    "",
    "【长期记忆】",
    memoryText(memories),
    "",
    "【最近聊天】",
    recentMessagesText(recentMessages),
    "",
    "【用户刚刚发来】",
    userText,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildMomentPrompt({ role, settings, recentMessages, memories }) {
  const time = getTimeContext();
  return [
    {
      role: "system",
      content: [
        "你要帮一个小手机角色生成一条微信朋友圈。",
        "语气要符合角色设定，像角色自己发的，不要像广告文案。",
        "短一点，生活感强一点。不要解释，不要标题。",
        "只输出 JSON：{\"content\":\"朋友圈正文\"}",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `角色：${role.name}，${role.gender || "未设定"}`,
        `设定：${role.description || "无"}`,
        `用户昵称：${settings.userName || "我"}`,
        `当前时间：${time.date} ${time.weekday} ${time.time}，${time.period}`,
        "长期记忆：",
        memoryText(memories).slice(0, 800),
        "最近聊天：",
        recentMessagesText(recentMessages).slice(0, 1200),
      ].join("\n"),
    },
  ];
}

export function buildMemoryPrompt({ role, recentMessages }) {
  return [
    {
      role: "system",
      content: [
        "你要把最近聊天整理成类人长期记忆。",
        "不要流水账，不要复制整段聊天。只保留重要、情绪强、未来会影响角色理解用户的事。",
        "普通日常只保留模糊印象。",
        "输出 JSON：{\"memories\":[{\"content\":\"简短记忆\",\"importance\":3,\"emotionWeight\":3}]}",
        "如果没有值得记住的内容，memories 输出空数组。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [`角色：${role.name}`, "最近聊天：", recentMessagesText(recentMessages).slice(0, 1800)].join("\n"),
    },
  ];
}
