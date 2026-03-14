import { Activity } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-slate-950 flex items-center justify-center z-50">
      <div className="text-blue-500 animate-pulse font-bold text-lg flex items-center gap-3">
        <Activity size={24} /> Loading RateTracker...
      </div>
    </div>
  );
}
