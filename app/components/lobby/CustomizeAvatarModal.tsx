import type { Player } from "@/shared/types";

interface CustomizeAvatarModalProps {
  open: boolean;
  onClose: () => void;
  player: Player;
}

// Stub only. No canvas yet. Follow-up ticket to implement a canvas-based avatar editor.
export function CustomizeAvatarModal({
  open,
  onClose,
  player,
}: CustomizeAvatarModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="customize-avatar-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Customize your avatar"
    >
      <div className="customize-avatar-panel flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center text-black">
        <p className="font-semibold">Draw yourself!</p>
        <p className="text-sm text-black/60">
          Avatar customization is coming soon...
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border-2 border-black/10 px-4 py-2 text-sm font-semibold"
        >
          Close
        </button>
      </div>
    </div>
  );
}
