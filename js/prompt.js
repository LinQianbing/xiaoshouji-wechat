import { getTimeContext } from "./time.js";

function talkLevelRule(level) {
  const n = Number(level) || 5;
  if (n <= 3) return "话少一点：通常回 1 条，短，别解释太多。";
  if (n <= 6) return "正常聊天：通常回 1-2 条，接住对方的话就行。";
  return "话多一点：可以连发 2-4 条，但每条都短，像微信里顺手补一句。";
}

function modeRule(mode) {
  if (mode === "offline") {
    return "线下模式：可以轻轻带一点当下动作或神态，但不要写成小说旁白。";
  }
  return "线上模式：只像微信聊天，不写拥抱、触碰、坐在旁边这类现实身体互动。";
}

function memoryText(memories = []) {
  if (!memories.length) return "暂无长期记忆。你不能假装一开始就很了解用户，要通过聊天慢慢了解。";
  return memories
    .slice(0, 12)
    .map((item, index) => `${index + 1}. ${item.content}（重要度${item.importance ?? 3}，情绪权重${item.emotionWeight ?? 3}）`)
    .join("\n");
}

function recentMessagesText(messages = [], roleName = "TA") {
  if (!messages.length) return "暂无最近聊天。";
  return messages
    .slice(-16)
    .map((msg) => `${msg.sender === "user" ? "我" : roleName}：${msg.content}`)
    .join("\n");
}

function recalledMessagesText(messages = [], roleName = "TA", range = null) {
  const rangeText = range?.label ? `检索范围：${range.label}${range.auto ? "（智能判断）" : ""}` : "检索范围：全部";
  if (!messages.length) return `${rangeText}\n这次没有查到相关旧聊天。`;
  return [
    rangeText,
    ...messages
    .map((msg, index) => {
      const who = msg.sender === "user" ? "我" : msg.sender === "role" ? roleName : "系统";
      const time = msg.createdAt ? new Date(msg.createdAt).toLocaleString("zh-CN", { hour12: false }) : "未知时间";
      const keywords = msg.matchedKeywords?.length ? `；命中：${msg.matchedKeywords.join("、")}` : "";
      return `${index + 1}. ${time}，${who}：${msg.content}${keywords}`;
    }),
  ].join("\n");
}

export function buildChatPrompt({ role, settings, mode, memories, recentMessages, recalledMessages = [], recalledRange = null, userText }) {
  const time = getTimeContext();
  const system = [
    "你正在扮演用户微信里的一个联系人，不是助手、客服、旁白或心理咨询师。",
    "回复要像真人在手机上顺手回消息：先接住上一句，再自然往下说。",
    "多用具体反应，少用概括。不要总结对话，不要给清单，不要上价值，不要每次都问“还需要我吗”。",
    "可以有一点口语、省略、停顿和小情绪，但不要刻意卖萌，不要每句都加语气词。",
    "不主动提自己是 AI、模型、程序、角色设定、系统提示或聊天 App。",
    "严格按联系人设定说话；设定没写的地方宁可留白，不要编一堆背景。",
    "如果【查到的旧聊天记录】里有内容，你可以像翻到聊天记录一样自然提到原话和大概时间；如果没查到，不要假装记得。",
    "旧聊天记录只用于回答用户问的旧事，不要把它机械复述成清单，除非用户明确要求列出来。",
    talkLevelRule(settings.talkLevel),
    modeRule(mode),
    "可以参考当前时间，但别机械报时，也别套早安/吃饭/早点睡模板。",
    "输出必须是合法 JSON，不要在 JSON 外输出任何解释。",
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
    `用户人设：${settings.userPersona || "用户还没有填写自己的人设。请不要擅自脑补。"}`,
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
    recentMessagesText(recentMessages, role.name),
    "",
    "【查到的旧聊天记录】",
    recalledMessagesText(recalledMessages, role.name, recalledRange),
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
        `用户人设：${settings.userPersona || "无"}`,
        `当前时间：${time.date} ${time.weekday} ${time.time}，${time.period}`,
        "长期记忆：",
        memoryText(memories).slice(0, 800),
        "最近聊天：",
        recentMessagesText(recentMessages, role.name).slice(0, 1200),
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
      content: [`角色：${role.name}`, "最近聊天：", recentMessagesText(recentMessages, role.name).slice(0, 1800)].join("\n"),
    },
  ];
}
