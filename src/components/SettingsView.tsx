import React from 'react';
import { ChevronRight } from 'lucide-react';

interface SettingsViewProps {
  goalType: 'gain' | 'lose';
  setGoalType: (type: 'gain' | 'lose') => void;
  weeklyRate: string;
  monthlyRate: string;
  dailyCalories: string;
  setDailyCalories: (val: string) => void;
  onRateChange: (val: string, type: 'weekly' | 'monthly') => void;
  onSave: (e: React.FormEvent) => void;
  onBack: () => void;
}

export function SettingsView({ goalType, setGoalType, weeklyRate, monthlyRate, dailyCalories, setDailyCalories, onRateChange, onSave, onBack }: SettingsViewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
          <ChevronRight className="rotate-180 text-slate-400" size={20} />
        </button>
        <h2 className="font-bold text-lg text-white">Plan Settings</h2>
      </div>

      <form onSubmit={onSave} className="bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-800 space-y-6 flex-1 flex flex-col">
        <div className="flex bg-slate-800 p-1 rounded-xl mb-2">
          <button
            type="button"
            onClick={() => setGoalType('gain')}
            className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${goalType === 'gain' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400'}`}
          >
            Gain Weight (+)
          </button>
          <button
            type="button"
            onClick={() => setGoalType('lose')}
            className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${goalType === 'lose' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400'}`}
          >
            Lose Weight (-)
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Weekly Rate (kg/wk)</label>
          <input
            type="text" inputMode="decimal" required
            value={weeklyRate}
            onChange={(e) => onRateChange(e.target.value, 'weekly')}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500 font-bold"
            placeholder="0.2"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Monthly Rate (kg/mo)</label>
          <input
            type="text" inputMode="decimal" required
            value={monthlyRate}
            onChange={(e) => onRateChange(e.target.value, 'monthly')}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500 font-bold"
            placeholder="0.87"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Avg. Daily Intake (kcal)</label>
          <input
            type="text" inputMode="numeric"
            value={dailyCalories}
            onChange={(e) => setDailyCalories(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500 font-bold"
            placeholder="e.g. 2500"
          />
          <p className="text-[10px] text-slate-500 mt-2">
            Used to calculate caloric adjustment advice. Leave blank if unknown.
          </p>
        </div>

        <div className="pt-4 mt-auto">
          <button type="submit" className="w-full bg-white text-slate-900 font-bold py-4 rounded-xl hover:bg-slate-200 transition-colors">
            Save Plan ({goalType === 'lose' ? '-' : '+'}{weeklyRate || 0}kg/wk)
          </button>
        </div>
      </form>
    </div>
  );
}
