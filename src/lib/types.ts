export interface WeightEntry {
  id: string;
  weight: number;
  date: string;
  comment?: string;
  createdAt: any;
}

export interface SettingsData {
  weeklyRate: number;
  dailyCalories?: number;
  updatedAt: any;
}

export interface WeeklySummary {
  weekId: string;
  weekLabel: string;
  actual: number;
  rawAvg: number;
  median: number;
  count: number;
  entries: WeightEntry[];
  target: number;
  delta: number;
  hasPrev: boolean;
  inTunnel: boolean;
}

export interface ChartPoint {
  label: string;
  dateObj: Date;
  actual: number | null;
  trend: number | null;
  weekLabel?: string;
}

export interface ProjectionData {
  anchorDate: Date;
  anchorVal: number;
  dailySlope: number;
  weeklySlope: number;
  anchorIndex?: number;
}
