import React, { useState } from 'react';
import { X, Clock, MessageSquare, Edit2, Trash2 } from 'lucide-react';
import type { WeightEntry } from '../lib/types';
import { formatDate, formatTime } from '../lib/utils';

interface EntryDetailModalProps {
  entry: WeightEntry;
  onClose: () => void;
  onEdit?: (id: string, weight: number) => void;
  onDelete?: (id: string) => void;
}

export function EntryDetailModal({ entry, onClose, onEdit, onDelete }: EntryDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editWeight, setEditWeight] = useState(entry.weight.toString());

  const handleSave = () => {
    const w = parseFloat(editWeight);
    if (!isNaN(w) && onEdit) {
      onEdit(entry.id, w);
      setIsEditing(false);
      onClose();
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white">
          <X size={20} />
        </button>

        <div className="flex flex-col gap-4">
          <div className="text-center border-b border-slate-800 pb-4">
            {isEditing ? (
               <div className="flex flex-col gap-2 items-center justify-center">
                  <div className="flex gap-2 items-end">
                     <input type="number" step="0.1" value={editWeight} onChange={e => setEditWeight(e.target.value)} className="w-24 bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-2xl font-bold text-center" />
                     <span className="text-lg text-slate-500 font-normal pb-1">kg</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                     <button onClick={handleSave} className="bg-emerald-500 text-white px-4 py-1.5 rounded-lg font-bold text-sm">Save</button>
                     <button onClick={() => setIsEditing(false)} className="bg-slate-700 text-white px-4 py-1.5 rounded-lg font-bold text-sm">Cancel</button>
                  </div>
               </div>
            ) : (
               <h3 className="text-3xl font-bold text-white mb-1">{entry.weight.toFixed(1)} <span className="text-lg text-slate-500 font-normal">kg</span></h3>
            )}
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

          {!entry.id.startsWith('weekly') && !isEditing && (
             <div className="flex gap-3 justify-center mt-2 border-t border-slate-800 pt-4">
                <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 text-sm font-bold text-blue-400 bg-blue-500/10 px-4 py-2 rounded-xl hover:bg-blue-500/20 transition-colors">
                   <Edit2 size={16} /> Edit
                </button>
                <button onClick={() => { if (onDelete) { onDelete(entry.id); onClose(); } }} className="flex items-center gap-2 text-sm font-bold text-rose-400 bg-rose-500/10 px-4 py-2 rounded-xl hover:bg-rose-500/20 transition-colors">
                   <Trash2 size={16} /> Delete
                </button>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
