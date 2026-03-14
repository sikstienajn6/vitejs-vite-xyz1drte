import React from 'react';
import { Plus, Clock, MessageSquare } from 'lucide-react';

interface LogWeightFormProps {
  weightInput: string;
  setWeightInput: (val: string) => void;
  dateInput: string;
  setDateInput: (val: string) => void;
  commentInput: string;
  setCommentInput: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function LogWeightForm({ weightInput, setWeightInput, dateInput, setDateInput, commentInput, setCommentInput, onSubmit }: LogWeightFormProps) {
  return (
    <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-900/20">
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm"><Plus size={18} /> Log Weight</h3>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text" inputMode="decimal" placeholder="0.0" required
            className="flex-1 w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-blue-200 focus:outline-none focus:ring-2 focus:ring-white/50 font-bold text-xl"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value.replace(',', '.'))}
          />
          <button type="submit" className="bg-white text-blue-600 font-bold px-6 rounded-xl hover:bg-blue-50 transition-colors text-lg">Add</button>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-200 pointer-events-none"><Clock size={16} /></div>
            <input type="date" className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
          </div>
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-200 pointer-events-none"><MessageSquare size={16} /></div>
            <input
              type="text"
              placeholder="Comment..."
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50 placeholder:text-blue-200/50"
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
            />
          </div>
        </div>
      </form>
    </div>
  );
}
