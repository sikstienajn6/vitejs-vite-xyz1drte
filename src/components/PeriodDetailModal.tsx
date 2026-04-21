
import { X, Calendar, Activity, Edit2 } from 'lucide-react';
import type { GoalPeriod } from '../lib/types';
import { formatDate } from '../lib/utils';

interface PeriodDetailModalProps {
  period: GoalPeriod;
  onClose: () => void;
  onEditInSettings: () => void;
}

export function PeriodDetailModal({ period, onClose, onEditInSettings }: PeriodDetailModalProps) {
  const isOpen = period.endDate === null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white">
          <X size={20} />
        </button>

        <div className="flex flex-col gap-4">
          <div className="text-center border-b border-slate-800 pb-4">
            <h3 className="text-2xl font-bold text-white mb-2">Goal Period</h3>
            <div className="flex items-center justify-center gap-2 text-slate-400 font-medium">
               <Calendar size={16} /> 
               <span>{formatDate(period.startDate)} - {isOpen ? 'Present' : formatDate(period.endDate!)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
               <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500 mb-1 flex items-center gap-1"><Activity size={12} /> Rate</p>
                  <p className="text-xl font-bold text-slate-200">
                     {period.weeklyRate > 0 ? '+' : ''}{period.weeklyRate} <span className="text-sm font-normal text-slate-500">kg/wk</span>
                  </p>
               </div>
            </div>
          </div>

          <div className="pt-2">
            <button 
              onClick={onEditInSettings}
              className="w-full flex items-center justify-center gap-2 bg-blue-500/10 text-blue-400 font-bold py-3 rounded-xl hover:bg-blue-500/20 transition-colors border border-blue-500/20"
            >
              <Edit2 size={16} /> Edit in Settings
            </button>
            <p className="text-center text-[10px] text-slate-500 mt-2">
              Advanced editing (changing dates/rates/deleting) is performed in the Goal History settings to ensure timeline consistency.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
