import { useState } from 'react';
import { Trash2, Edit2, Plus, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { GoalPeriod } from '../lib/types';
import { generateId, formatDate } from '../lib/utils';

interface GoalHistoryEditorProps {
  periods: GoalPeriod[];
  onUpdate: (periods: GoalPeriod[]) => void;
}

export function GoalHistoryEditor({ periods, onUpdate }: GoalHistoryEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editRate, setEditRate] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sort periods oldest to newest for internal logic, then display newest first
  const sortedPeriods = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));

  const handleEditInit = (p: GoalPeriod) => {
    setEditingId(p.id);
    setEditStartDate(p.startDate);
    setEditEndDate(p.endDate || '');
    setEditRate(p.weeklyRate.toString());
    setErrorMsg('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setErrorMsg('');
  };

  const handleSaveEdit = (idx: number) => {
    const rate = parseFloat(editRate);
    if (isNaN(rate)) {
      setErrorMsg('Invalid rate');
      return;
    }

    if (!editStartDate) {
      setErrorMsg('Start date required');
      return;
    }

    if (editEndDate && editStartDate >= editEndDate) {
      setErrorMsg('Start date must be before end date');
      return;
    }

    const newPeriods = [...sortedPeriods];
    const prev = idx > 0 ? newPeriods[idx - 1] : null;
    const next = idx < newPeriods.length - 1 ? newPeriods[idx + 1] : null;

    // Validate overlaps
    if (prev && editStartDate <= prev.startDate) {
      setErrorMsg('Start date overlaps with previous period');
      return;
    }
    if (next && (editEndDate === '' || editEndDate >= next.endDate!)) {
      setErrorMsg('End date overlaps with next period');
      return;
    }

    const currentPeriod = { ...newPeriods[idx], startDate: editStartDate, endDate: editEndDate || null, weeklyRate: rate };
    newPeriods[idx] = currentPeriod;

    // Auto adjust adjacent logic
    if (prev) {
      prev.endDate = editStartDate;
    }
    if (next) {
      next.startDate = editEndDate || currentPeriod.endDate || next.startDate; // Though editing an open period to closed right before next isn't typical, we just bind it to next
      if (!currentPeriod.endDate) {
         // Should not happen as open period is only the last one, unless they broke it
         currentPeriod.endDate = next.startDate;
      }
    }

    onUpdate(newPeriods);
    setEditingId(null);
  };

  const handleDelete = (idx: number) => {
    if (sortedPeriods.length === 1) {
      const today = new Date().toISOString().split('T')[0];
      onUpdate([{ id: generateId(), startDate: today, endDate: null, weeklyRate: 0 }]);
      return;
    }

    const newPeriods = [...sortedPeriods];
    const isLast = idx === newPeriods.length - 1;

    if (isLast) {
      const prev = newPeriods[idx - 1];
      prev.endDate = null; // cascade open
      newPeriods.splice(idx, 1);
    } else {
      const prev = idx > 0 ? newPeriods[idx - 1] : null;
      const next = newPeriods[idx + 1];
      if (prev) {
        prev.endDate = next.startDate;
      }
      newPeriods.splice(idx, 1);
    }
    onUpdate(newPeriods);
  };

  const handleAdd = () => {
    const today = new Date().toISOString().split('T')[0];
    const last = sortedPeriods[sortedPeriods.length - 1];
    
    let newStartDate = today;
    if (last && last.endDate === null) {
      last.endDate = today;
    } else if (last && last.endDate && last.endDate > today) {
       newStartDate = last.endDate;
    }

    const newP: GoalPeriod = {
      id: generateId(),
      startDate: newStartDate,
      endDate: null,
      weeklyRate: 0
    };
    onUpdate([...sortedPeriods, newP]);
    handleEditInit(newP);
  };

  const getRateIcon = (rate: number) => {
    if (rate > 0) return <TrendingUp size={12} className="text-emerald-400" />;
    if (rate < 0) return <TrendingDown size={12} className="text-rose-400" />;
    return <Minus size={12} className="text-slate-500" />;
  };

  const getRateColor = (rate: number) => {
    if (rate > 0) return 'text-emerald-400';
    if (rate < 0) return 'text-rose-400';
    return 'text-slate-400';
  };

  return (
    <div className="mt-8 animate-slide-up" style={{ animationDelay: '0.25s', animationFillMode: 'both' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-300">Goal History</h3>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2.5 py-1.5 rounded-lg transition-all duration-200 hover:bg-blue-500/20 active:scale-95"
        >
          <Plus size={14} /> Add Period
        </button>
      </div>

      <div className="space-y-2">
        {sortedPeriods.slice().reverse().map((p, displayIdx) => {
          const originalIdx = sortedPeriods.findIndex(x => x.id === p.id);
          const isEditing = editingId === p.id;
          const isOpen = p.endDate === null;

          if (isEditing) {
            return (
              <div key={p.id} className="bg-slate-800 p-4 rounded-xl border border-blue-500/30 space-y-3 animate-scale-in shadow-lg shadow-blue-500/5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Start Date</label>
                    <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">End Date</label>
                    <input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} disabled={isOpen} className="w-full bg-slate-900 border border-slate-700 text-slate-400 rounded-lg px-2 py-1.5 text-sm disabled:opacity-50 focus:border-blue-500 focus:outline-none transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Weekly Rate (kg/wk)</label>
                  <input type="text" inputMode="text" value={editRate} onChange={e => setEditRate(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none transition-colors" placeholder="e.g. 0.2 or -0.3" />
                  <p className="text-[10px] text-slate-600 mt-1">Negative = loss, positive = gain</p>
                </div>
                {errorMsg && <p className="text-red-400 text-xs font-bold animate-fade-in">{errorMsg}</p>}
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => handleSaveEdit(originalIdx)} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-1.5 rounded-lg text-sm transition-all duration-200 active:scale-[0.98]">Save</button>
                  <button type="button" onClick={handleCancelEdit} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-1.5 rounded-lg text-sm transition-all duration-200 active:scale-[0.98]">Cancel</button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={p.id}
              className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 hover:border-slate-600/50 hover:bg-slate-800/70 transition-all duration-200"
              style={{ animationDelay: `${displayIdx * 0.05}s`, animationFillMode: 'both' }}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-slate-200">{formatDate(p.startDate)} – {isOpen ? 'Present' : formatDate(p.endDate!)}</span>
                <span className={`text-xs font-semibold flex items-center gap-1 ${getRateColor(p.weeklyRate)}`}>
                  {getRateIcon(p.weeklyRate)}
                  {p.weeklyRate > 0 ? '+' : ''}{p.weeklyRate} kg/wk
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => handleEditInit(p)} className="p-1.5 text-slate-500 hover:text-blue-400 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all duration-200">
                  <Edit2 size={14} />
                </button>
                <button type="button" onClick={() => handleDelete(originalIdx)} className="p-1.5 text-slate-500 hover:text-red-400 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all duration-200">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
