import { Settings, LogOut } from 'lucide-react';

interface AppHeaderProps {
  view: 'dashboard' | 'settings';
  onToggleView: () => void;
  onLogout: () => void;
}

export function AppHeader({ view, onToggleView, onLogout }: AppHeaderProps) {
  return (
    <div className="bg-slate-900/80 backdrop-blur-md px-4 py-4 shadow-sm shrink-0 flex justify-between items-center max-w-md mx-auto w-full border-b border-slate-800 z-10">
      <div className="flex items-center gap-2 text-blue-500 font-bold">RateTracker</div>
      <div className="flex gap-2">
        <button
          onClick={onToggleView}
          className="p-2 hover:bg-slate-800 rounded-full transition-colors"
        >
          <Settings size={20} className={view === 'settings' ? "text-blue-400" : "text-slate-400"} />
        </button>
        <button onClick={onLogout} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-red-400">
          <LogOut size={20} />
        </button>
      </div>
    </div>
  );
}
