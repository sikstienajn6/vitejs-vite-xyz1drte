import { X, Clock, MessageSquare } from 'lucide-react';
import type { WeightEntry } from '../lib/types';
import { formatDate, formatTime } from '../lib/utils';

interface EntryDetailModalProps {
  entry: WeightEntry;
  onClose: () => void;
}

export function EntryDetailModal({ entry, onClose }: EntryDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white">
          <X size={20} />
        </button>

        <div className="flex flex-col gap-4">
          <div className="text-center border-b border-slate-800 pb-4">
            <h3 className="text-3xl font-bold text-white mb-1">{entry.weight.toFixed(1)} <span className="text-lg text-slate-500 font-normal">kg</span></h3>
            <p className="text-slate-400 font-medium flex items-center justify-center gap-2">
              {entry.id.startsWith('weekly') ? entry.date : formatDate(entry.date)}
            </p>
          </div>

          {!entry.id.startsWith('weekly') && (
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Time Logged</p>
                <p className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Clock size={14} className="text-blue-500" />
                  {formatTime(entry.createdAt) || '--:--'}
                </p>
              </div>
            </div>
          )}

          {entry.comment && !entry.id.startsWith('weekly') && (
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-800">
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-2 flex items-center gap-2">
                <MessageSquare size={12} /> Comment
              </p>
              <p className="text-sm text-slate-200 italic whitespace-pre-wrap">{entry.comment}</p>
            </div>
          )}

          {entry.id.startsWith('weekly') && entry.comment && (
            <div className="flex flex-col gap-2 mt-2">
              <p className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-2 px-1">
                <MessageSquare size={12} /> Comments this week
              </p>
              {(() => {
                 try {
                   const parsed = JSON.parse(entry.comment);
                   return parsed.map((c: any, i: number) => (
                      <div key={i} className="bg-slate-800/50 p-3 rounded-xl border border-slate-800/80">
                         <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-400">{formatDate(c.date)}</span>
                            <span className="text-xs font-bold text-slate-300">{c.weight.toFixed(1)} kg</span>
                         </div>
                         <p className="text-sm text-slate-200">{c.text}</p>
                      </div>
                   ));
                 } catch(e) {
                   return null;
                 }
              })()}
            </div>
          )}

          {entry.id.startsWith('weekly') && (
            <div className="text-center text-sm text-slate-500 italic mt-2">
              Weekly Average
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
