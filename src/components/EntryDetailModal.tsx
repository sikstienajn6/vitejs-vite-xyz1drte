import { useState } from 'react';
import { X, Clock, MessageSquare, Edit2, Trash2, Check } from 'lucide-react';
import type { WeightEntry } from '../lib/types';
import { formatDate, formatTime } from '../lib/utils';

interface EntryDetailModalProps {
  entry: WeightEntry;
  onClose: () => void;
  onEdit?: (id: string, weight: number, comment?: string) => void;
  onDelete?: (id: string) => void;
}

export function EntryDetailModal({ entry, onClose, onEdit, onDelete }: EntryDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editWeight, setEditWeight] = useState(entry.weight.toString());
  const [editComment, setEditComment] = useState(entry.comment || '');

  const handleSave = () => {
    const w = parseFloat(editWeight);
    if (!isNaN(w) && onEdit) {
      onEdit(entry.id, w, editComment);
      setIsEditing(false);
      onClose();
    }
  };

  const isWeekly = entry.id.startsWith('weekly');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl relative animate-modal-in overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-sm font-semibold text-slate-400 flex items-center gap-2">
            {isWeekly ? entry.date : formatDate(entry.date)}
            {!isWeekly && (
              <span className="flex items-center gap-1 text-slate-500">
                <Clock size={12} className="text-blue-400" />
                {formatTime(entry.createdAt) || '--:--'}
              </span>
            )}
          </p>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all duration-200">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-3">
          {/* Weight display/edit */}
          <div className="text-center py-3">
            {isEditing ? (
              <div className="flex items-end justify-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={editWeight}
                  onChange={e => setEditWeight(e.target.value)}
                  autoFocus
                  className="w-28 bg-slate-800 border border-blue-500/50 text-white rounded-xl px-3 py-2 text-3xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                />
                <span className="text-lg text-slate-500 font-normal pb-2">kg</span>
              </div>
            ) : (
              <h3 className="text-4xl font-bold text-white tracking-tight">
                {entry.weight.toFixed(1)}
                <span className="text-lg text-slate-500 font-normal ml-1">kg</span>
              </h3>
            )}
          </div>



          {/* Comment section when editing */}
          {isEditing && !isWeekly && (
            <div className="animate-slide-up">
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 flex items-center gap-1.5 px-1">
                <MessageSquare size={11} /> Comment
              </label>
              <textarea
                value={editComment}
                onChange={e => setEditComment(e.target.value)}
                placeholder="Add a comment..."
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder-slate-600"
              />
              {editComment && (
                <button
                  onClick={() => setEditComment('')}
                  className="mt-1.5 text-[11px] font-bold text-rose-400 hover:text-rose-300 transition-colors px-1"
                >
                  Remove comment
                </button>
              )}
            </div>
          )}

          {/* Full comment view (non-editing) */}
          {!isEditing && entry.comment && !isWeekly && (
            <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/30">
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
                <MessageSquare size={11} /> Comment
              </p>
              <p className="text-sm text-slate-200 italic whitespace-pre-wrap leading-relaxed">{entry.comment}</p>
            </div>
          )}

          {/* Weekly comments */}
          {isWeekly && entry.comment && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1.5 px-1">
                <MessageSquare size={11} /> Comments this week
              </p>
              {(() => {
                 try {
                   const parsed = JSON.parse(entry.comment);
                   return parsed.map((c: any, i: number) => (
                      <div key={i} className="bg-slate-800/50 p-3 rounded-xl border border-slate-800/80">
                         <div className="flex justify-between items-center mb-1.5">
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

          {isWeekly && (
            <div className="text-center text-sm text-slate-500 italic">
              Weekly Average
            </div>
          )}

          {/* Action buttons */}
          {!isWeekly && (
            <div className="flex gap-2 pt-2 border-t border-slate-800/50">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2.5 rounded-xl text-sm transition-all duration-200 active:scale-[0.98]"
                  >
                    <Check size={16} /> Save
                  </button>
                  <button
                    onClick={() => { setIsEditing(false); setEditWeight(entry.weight.toString()); setEditComment(entry.comment || ''); }}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-sm transition-all duration-200 active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex-1 flex items-center justify-center gap-2 text-sm font-bold text-blue-400 bg-blue-500/10 py-2.5 rounded-xl hover:bg-blue-500/20 transition-all duration-200 active:scale-[0.98]"
                  >
                    <Edit2 size={15} /> Edit
                  </button>
                  <button
                    onClick={() => { if (onDelete) { onDelete(entry.id); onClose(); } }}
                    className="flex-1 flex items-center justify-center gap-2 text-sm font-bold text-rose-400 bg-rose-500/10 py-2.5 rounded-xl hover:bg-rose-500/20 transition-all duration-200 active:scale-[0.98]"
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
