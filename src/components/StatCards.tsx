import { TrendingDown, TrendingUp } from 'lucide-react';
import type { WeeklySummary, SettingsData } from '../lib/types';
import { RATE_TOLERANCE_GREEN, RATE_TOLERANCE_ORANGE } from '../lib/constants';

interface StatCardsProps {
  weeklyData: WeeklySummary[];
  currentTrendRate: number;
  settings: SettingsData | null;
}

function getRateAdherenceColor(rate: number, settings: SettingsData | null) {
  if (!settings) return 'text-slate-500';
  const targetRate = settings.weeklyRate;
  const deviation = Math.abs(rate - targetRate);
  if (deviation <= RATE_TOLERANCE_GREEN) return 'text-emerald-400';
  if (deviation <= RATE_TOLERANCE_ORANGE) return 'text-amber-400';
  return 'text-rose-400';
}

export function StatCards({ weeklyData, currentTrendRate, settings }: StatCardsProps) {
  const rateColor = getRateAdherenceColor(currentTrendRate, settings);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-800">
        <p className="text-slate-400 text-xs font-medium uppercase mb-1">Trend Weight</p>
        <p className="text-2xl font-bold text-white truncate">
          {weeklyData.length > 0 ? weeklyData[weeklyData.length - 1].actual.toFixed(1) : '--'}
          <span className="text-sm font-normal text-slate-500 ml-1">kg</span>
        </p>
      </div>
      <div className="bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-800">
        <p className="text-slate-400 text-xs font-medium uppercase mb-1">Current Rate</p>
        <div className={`flex items-center gap-1.5 text-2xl font-bold truncate ${rateColor}`}>
          {currentTrendRate > 0 ? <TrendingUp size={22} className="opacity-80" /> : <TrendingDown size={22} className="opacity-80" />}
          <span>
            {Math.abs(currentTrendRate).toFixed(2)}
            <span className="text-sm font-normal opacity-70 ml-1">kg</span>
          </span>
        </div>
      </div>
    </div>
  );
}
