interface DeleteConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2">Delete Entry?</h3>
        <p className="text-slate-400 text-sm mb-6">Are you sure you want to delete this weight log? This action cannot be undone.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
          >
            No
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/50 rounded-xl font-bold transition-colors"
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
