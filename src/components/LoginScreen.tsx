import { Activity, LogIn } from 'lucide-react';

interface LoginScreenProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-slate-950 grid place-items-center p-6 overflow-hidden overscroll-none">
      <div className="fixed inset-0 bg-slate-950 -z-10" />
      <div className="max-w-xs text-center w-full">
        <Activity size={48} className="text-blue-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">RateTracker</h1>
        <p className="text-slate-400">Track your progress securely.</p>
        <div className="mt-8">
          <button onClick={onLogin} className="bg-white text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center gap-3 hover:bg-slate-200 transition-colors w-full justify-center">
            <LogIn size={20} /> Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}
