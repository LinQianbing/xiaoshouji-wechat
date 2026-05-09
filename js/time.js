const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export function nowISO() {
  return new Date().toISOString();
}

export function getTimeContext(date = new Date()) {
  const hour = date.getHours();
  let period = "下午";
  if (hour >= 5 && hour < 11) period = "早上";
  else if (hour >= 11 && hour < 14) period = "中午";
  else if (hour >= 14 && hour < 18) period = "下午";
  else if (hour >= 18 && hour < 23) period = "晚上";
  else period = "凌晨";

  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    weekday: WEEKDAYS[date.getDay()],
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    period,
    hour,
  };
}

export function formatClock(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatChatTime(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return formatClock(date);
  return `${date.getMonth() + 1}/${date.getDate()} ${formatClock(date)}`;
}

export function formatMomentTime(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "刚刚";
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function getAwayLabel(lastOpenAt) {
  if (!lastOpenAt) return "好久不见";
  const diff = Date.now() - new Date(lastOpenAt).getTime();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (diff < hour) return "刚刚才见过";
  if (diff < day) return `离开了 ${Math.floor(diff / hour)} 小时`;
  return `离开了 ${Math.floor(diff / day)} 天`;
}
