import { Utensils, Check, SkipForward } from 'lucide-react';

interface AdviceBannerProps {
  showPreWeightPrompt: boolean;
  advice: { color: string; text: string } | null;
  onSkip: () => void;
  onDismiss: () => void;
}

export function AdviceBanner({ showPreWeightPrompt, advice, onSkip, onDismiss }: AdviceBannerProps) {
  if (showPreWeightPrompt) {
    return (
      <div className="px-4 py-3 rounded-xl border flex items-center gap-3 bg-blue-500/10 border-blue-500/20 text-blue-200 relative">
        <Utensils size={18} className="shrink-0" />
        <span className="text-sm font-semibold flex-1">Add today's weight to receive this week's advice.</span>
        <button
          onClick={onSkip}
          className="shrink-0 px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded text-xs font-bold transition-colors flex items-center gap-1"
        >
          Skip <SkipForward size={12} />
        </button>
      </div>
    );
  }

  if (advice) {
    return (
      <div className={`px-4 py-3 rounded-xl border flex items-center gap-3 ${advice.color} relative`}>
        <Utensils size={18} className="shrink-0" />
        <span className="text-sm font-semibold flex-1">{advice.text}</span>
        <button
          onClick={onDismiss}
          className="shrink-0 p-1.5 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center"
          aria-label="Dismiss advice"
        >
          <Check size={16} className="opacity-70 hover:opacity-100" />
        </button>
      </div>
    );
  }

  return null;
}
