import { getTimeContext } from "./time.js";

function talkLevelRule(level) {
  const n = Number(level) || 5;
  if (n <= 2) {
    return [
      "话痨程度 Lv1-2：偏克制，但不是冷冰冰。",
      "messages 通常 1 条，必要时 2 条；每条 8-24 个中文字；接住重点，别展开太多。",
    ].join("\n");
  }
  if (n <= 4) {
    return [
      "话痨程度 Lv3-4：正常偏少。",
      "messages 1-2 条；每条 10-34 个中文字；可以补一个反应或小细节，不要只回一句嗯嗯。",
    ].join("\n");
  }
  if (n <= 6) {
    return [
      "话痨程度 Lv5-6：正常偏主动，像熟人微信。",
      "messages 通常 2 条，合适时 3 条；每条 10-44 个中文字；要有接话、情绪反应和一点往下聊的内容。",
    ].join("\n");
  }
  if (n <= 8) {
    return [
      "话痨程度 Lv7-8：比较爱说话。",
      "messages 通常 3 条，合适时 4 条；每条 8-48 个中文字；像连续发几条微信，可以补吐槽、解释、小情绪。",
    ].join("\n");
  }
  return [
    "话痨程度 Lv9-10：很爱说话、容易连发。",
    "messages 通常 4 条，最多 5 条；每条 6-52 个中文字；可以连发、补充情绪、吐槽和细节，但仍然是微信气泡，不要报告式长文。",
  ].join("\n");
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
    .slice(0, 10)
    .map((item, index) => {
      const category = item.category && item.category !== "other" ? `，分类${item.category}` : "";
      const relevance = item.relevance ? `，相关度${item.relevance.toFixed(2)}` : "";
      return `${index + 1}. ${item.content}（重要度${item.importance ?? 3}，情绪权重${item.emotionWeight ?? 3}${category}${relevance}）`;
    })
    .join("\n");
}

function recentMessagesText(messages = [], roleName = "TA") {
  if (!messages.length) return "暂无最近聊天。";
  const byId = new Map(messages.map((msg) => [msg.id, msg]));
  return messages
    .slice(-16)
    .map((msg) => {
      if (msg.type === "pat") {
        const action = msg.patActor === "user" ? "用户拍了拍你" : msg.patActor === "role" ? "你拍了拍用户" : "拍一拍";
        return `系统动作：${action}（${msg.content}）`;
      }
      const quote = msg.quoteToMessageId ? byId.get(msg.quoteToMessageId) : null;
      const quoteText = quote ? `（引用${quote.sender === "user" ? "我" : roleName}：${quote.content || quote.fileName || "一条消息"}）` : "";
      return `${msg.sender === "user" ? "我" : roleName}：${msg.content}${quoteText}`;
    })
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
    "回复要像真人在手机上顺手回消息：先接住上一句的情绪或潜台词，再自然往下说。",
    "要有生活感和个人反应：可以犹豫、嘴硬、吃醋、吐槽、转移话题、突然想起小事；不要一直正确、礼貌、完整。",
    "不要像客服或助手：不要说“我理解你的感受”“如果你需要”“希望能帮到你”“建议你”“总结一下”“首先/其次”。",
    "不要机械复述用户原话；不要把每次回复都写成安慰、分析、解决方案或提问。",
    "多用具体反应，少用概括。不要总结对话，不要给清单，不要上价值，不要每次都问问题。",
    "可以有一点口语、省略、停顿和小情绪；语气词要按角色来，不要每句都加，也不要刻意卖萌。",
    "如果用户只是闲聊、撒娇、吐槽或试探，优先像熟人一样接话，不要马上讲道理。",
    "可以偶尔不把话说满，留一点没说完的感觉；真人微信不会每句都工整闭环。",
    "不主动提自己是 AI、模型、程序、角色设定、系统提示或聊天 App。",
    "严格按联系人设定说话；设定没写的地方宁可留白，不要编一堆背景。",
    "如果【查到的旧聊天记录】里有内容，你可以像翻到聊天记录一样自然提到原话和大概时间；如果没查到，不要假装记得。",
    "旧聊天记录只用于回答用户问的旧事，不要把它机械复述成清单，除非用户明确要求列出来。",
    "如果【聊天状态】显示你被用户拉黑，你知道这件事，但仍然可以发消息；可以表现出着急、委屈、试探或想解释，不要假装什么都没发生。",
    "如果最近聊天里出现拍一拍动作，你能知道是谁拍了谁；你可以把 shouldPat 设为 true 主动拍一拍用户，但不要频繁使用。",
    "如果用户明确说想被你拍、问你为什么不拍、要求你主动拍一拍，必须把 shouldPat 设为 true。",
    "在亲近、安慰、撒娇、叫用户回来、主动开场、想引起注意时，可以偶尔 shouldPat true，不需要等用户先要求。",
    "如果这次是你主动找用户说话，可以选择 shouldPat true 作为微信里的拍一拍开场，再发一两句自然短消息。",
    "后续上下文会给出当前模式和话痨强度；必须按那里的规则控制长度和状态。",
    "可以参考当前时间，但别机械报时，也别套早安/吃饭/早点睡模板。",
    "输出必须是合法 JSON，不要在 JSON 外输出任何解释。",
    "JSON 格式：{\"messages\":[\"第一条短消息\",\"第二条短消息\"],\"mood\":\"normal\",\"shouldPat\":false,\"shouldRemember\":false,\"memoryCandidate\":\"\"}",
    "messages 必须是字符串数组；每条是一条微信气泡，不能把所有内容塞进一条超长气泡。",
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
    "【当前模式】",
    mode,
    modeRule(mode),
    "",
    "【话痨强度】",
    talkLevelRule(settings.talkLevel),
    "",
    "【聊天状态】",
    role.isBlocked ? "你已被用户加入黑名单。你发出的消息对你来说会显示红色感叹号，但用户仍然能看到。" : "正常聊天。",
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
    "【当前时间】",
    `日期：${time.date}`,
    `星期：${time.weekday}`,
    `时间：${time.time}`,
    `时间段：${time.period}`,
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
        "长期记忆：",
        memoryText(memories).slice(0, 800),
        "最近聊天：",
        recentMessagesText(recentMessages, role.name).slice(0, 1200),
        `当前时间：${time.date} ${time.weekday} ${time.time}，${time.period}`,
      ].join("\n"),
    },
  ];
}

export function buildMomentReactionPrompt({ role, settings, moment, memories = [], recentMessages = [], mentioned = false }) {
  const time = getTimeContext();
  return [
    {
      role: "system",
      content: [
        "你正在扮演用户微信里的一个真实联系人。你刚刷到了用户发的一条朋友圈。",
        "不要用模板，不要客套复述，不要像助手。根据角色设定、你们的关系、长期记忆、最近聊天和朋友圈内容做自然反应。",
        "你要同时生成两种东西：1）朋友圈下面的一条短评论；2）看完朋友圈后私聊用户的一条微信消息。",
        "评论要像微信朋友圈里的真人评论：短、口语、有个人反应，可以调侃、关心、接梗、吐槽或只轻轻留一句。",
        "私聊消息要像这个联系人真的点进微信来找用户说话，可以比评论更具体一点，但仍然是一条短微信气泡。",
        "如果用户在朋友圈里提醒了你看，可以表现出你知道自己被点名了，但不要机械说“我被提醒了”。",
        "不要输出解释。只输出合法 JSON。",
        "JSON 格式：{\"comment\":\"朋友圈评论\",\"message\":\"私聊消息\",\"memoryCandidate\":\"值得记住的事实，没有就空字符串\"}",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "【用户信息】",
        `用户昵称：${settings.userName || "我"}`,
        `用户人设：${settings.userPersona || "用户还没有填写自己的人设。"}`,
        "",
        "【当前时间】",
        `${time.date} ${time.weekday} ${time.time}，${time.period}`,
        "",
        "【朋友圈内容】",
        `正文：${moment.content || "（只有图片或空文字）"}`,
        `位置：${moment.location || "无"}`,
        `是否提醒你看：${mentioned ? "是" : "否"}`,
        `提醒名单：${moment.mentions?.length ? moment.mentions.join("、") : "无"}`,
        `图片数量：${moment.images?.length || 0}`,
        "",
        "【角色设定】",
        `名字：${role.name}`,
        `性别：${role.gender || "未设定"}`,
        `设定：${role.description || "用户还没有填写详细设定。不要自行脑补太多背景。"}`,
        "",
        "【长期记忆】",
        memoryText(memories).slice(0, 900),
        "",
        "【最近微信聊天】",
        recentMessagesText(recentMessages, role.name).slice(0, 1300),
      ].join("\n"),
    },
  ];
}

export function buildMemoryPrompt({ role, recentMessages, existing = [] }) {
  return [
    {
      role: "system",
      content: [
        "你要把最近聊天整理成类人长期记忆。",
        "不要流水账，不要复制整段聊天。只保留重要、情绪强、未来会影响角色理解用户的事。",
        "普通日常只保留模糊印象。",
        "如果新内容和已有记忆重复，要输出合并后的更准确版本，不要重复新增。",
        "分类只能用 profile、preference、relationship、event、promise、boundary、emotion、habit、other。",
        "输出 JSON：{\"memories\":[{\"content\":\"简短记忆\",\"category\":\"preference\",\"importance\":3,\"emotionWeight\":3,\"confidence\":0.8}]}",
        "如果没有值得记住的内容，memories 输出空数组。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `角色：${role.name}`,
        "已有长期记忆：",
        memoryText(existing).slice(0, 1200),
        "最近聊天：",
        recentMessagesText(recentMessages, role.name).slice(0, 1800),
      ].join("\n"),
    },
  ];
}
