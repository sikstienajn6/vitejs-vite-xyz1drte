export const getWeekKey = (date: string) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(Date.UTC(d.getFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
};

export const getLastSundayWeekKey = () => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysSinceSunday = dayOfWeek === 0 ? 0 : dayOfWeek;
  const lastSunday = new Date(today);
  lastSunday.setDate(today.getDate() - daysSinceSunday);
  return getWeekKey(lastSunday.toISOString().split('T')[0]);
};

export const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const formatTime = (timestamp: any) => {
  if (!timestamp) return '';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const getDaysArray = (start: Date, end: Date) => {
  const arr: string[] = [];
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    arr.push(new Date(dt).toISOString().split('T')[0]);
  }
  return arr;
};

export const getMedian = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export const getWeekMonday = (date: string): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();          // 0=Sun, 1=Mon, …, 6=Sat
  const diff = day === 0 ? -6 : 1 - day;   // shift back to Monday
  d.setDate(d.getDate() + diff);
  return d;
};

export const interpolateColor = (diff: number) => {
  const cGreen = [16, 185, 129];
  const cOrange = [251, 191, 36];
  const cRed = [239, 68, 68];

  let color1, color2, t;

  if (diff <= 0.15) {
    color1 = cGreen;
    color2 = cOrange;
    t = diff / 0.15;
  } else {
    color1 = cOrange;
    color2 = cRed;
    t = Math.min(1, (diff - 0.15) / 0.15);
  }

  const r = Math.round(color1[0] + (color2[0] - color1[0]) * t);
  const g = Math.round(color1[1] + (color2[1] - color1[1]) * t);
  const b = Math.round(color1[2] + (color2[2] - color1[2]) * t);

  return `rgb(${r}, ${g}, ${b})`;
};

export const mixWithGray = (rgbStr: string, factor: number) => {
  const match = rgbStr.match(/\d+/g);
  if (!match || match.length < 3) return rgbStr;
  const r = parseInt(match[0], 10);
  const g = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);

  const gr = 148, gg = 163, gb = 184;

  const nr = Math.round(r + (gr - r) * Math.max(0, Math.min(1, factor)));
  const ng = Math.round(g + (gg - g) * Math.max(0, Math.min(1, factor)));
  const nb = Math.round(b + (gb - b) * Math.max(0, Math.min(1, factor)));

  return `rgb(${nr}, ${ng}, ${nb})`;
};
