import React from 'react';
import { ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { GoalHistoryEditor } from './GoalHistoryEditor';
import type { GoalPeriod } from '../lib/types';

interface SettingsViewProps {
  weeklyRate: string;
  monthlyRate: string;
  dailyCalories: string;
  setDailyCalories: (val: string) => void;
  onRateChange: (val: string, type: 'weekly' | 'monthly') => void;
  onSave: (e: React.FormEvent) => void;
  onBack: () => void;
  goalPeriods?: GoalPeriod[];
  onUpdateGoalPeriods: (periods: GoalPeriod[]) => void;
}

export function SettingsView({ weeklyRate, monthlyRate, dailyCalories, setDailyCalories, onRateChange, onSave, onBack, goalPeriods, onUpdateGoalPeriods }: SettingsViewProps) {
  const parsedRate = parseFloat(weeklyRate);
  const rateDirection = isNaN(parsedRate) ? 'neutral' : parsedRate > 0 ? 'gain' : parsedRate < 0 ? 'lose' : 'neutral';

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg transition-all duration-200 active:scale-95">
          <ChevronRight className="rotate-180 text-slate-400" size={20} />
        </button>
        <h2 className="font-bold text-lg text-white">Plan Settings</h2>
      </div>

      <form onSubmit={onSave} className="bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-800 space-y-6 flex-1 flex flex-col">
        <div className="animate-slide-up" style={{ animationDelay: '0.05s', animationFillMode: 'both' }}>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Weekly Rate (kg/wk)</label>
          <div className="relative">
            <input
              type="text" inputMode="text" required
              value={weeklyRate}
              onChange={(e) => onRateChange(e.target.value, 'weekly')}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500 font-bold transition-all duration-200 hover:border-slate-600"
              placeholder="e.g. 0.2 or -0.3"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {rateDirection === 'gain' && <TrendingUp size={16} className="text-emerald-400" />}
              {rateDirection === 'lose' && <TrendingDown size={16} className="text-rose-400" />}
              {rateDirection === 'neutral' && <Minus size={16} className="text-slate-500" />}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Use negative values for weight loss (e.g. -0.3), positive for gain (e.g. 0.2)
          </p>
        </div>

        <div className="animate-slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Monthly Rate (kg/mo)</label>
          <div className="relative">
            <input
              type="text" inputMode="text" required
              value={monthlyRate}
              onChange={(e) => onRateChange(e.target.value, 'monthly')}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500 font-bold transition-all duration-200 hover:border-slate-600"
              placeholder="e.g. 0.87 or -1.30"
            />
          </div>
        </div>

        <div className="animate-slide-up" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Avg. Daily Intake (kcal)</label>
          <input
            type="text" inputMode="numeric"
            value={dailyCalories}
            onChange={(e) => setDailyCalories(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500 font-bold transition-all duration-200 hover:border-slate-600"
            placeholder="e.g. 2500"
          />
          <p className="text-[10px] text-slate-500 mt-2">
            Used to calculate caloric adjustment advice. Leave blank if unknown.
          </p>
        </div>

        <div className="pt-4 mt-auto animate-slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
          <button
            type="submit"
            className={`w-full font-bold py-4 rounded-xl transition-all duration-200 active:scale-[0.98] ${
              rateDirection === 'lose'
                ? 'bg-gradient-to-r from-rose-500 to-rose-600 text-white hover:from-rose-400 hover:to-rose-500'
                : rateDirection === 'gain'
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-400 hover:to-emerald-500'
                  : 'bg-white text-slate-900 hover:bg-slate-200'
            }`}
          >
            Save Plan ({weeklyRate || 0} kg/wk)
          </button>
        </div>

        {goalPeriods && (
          <GoalHistoryEditor periods={goalPeriods} onUpdate={onUpdateGoalPeriods} />
        )}
      </form>
    </div>
  );
}
