"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Undo2, X } from "lucide-react";

export default function UndoToast({
  message,
  secondsLeft,
  progress,
  onUndo,
  onDismiss,
}: {
  message: string;
  secondsLeft: number;
  progress: number;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-bottom-2 duration-200"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl border border-slate-700 bg-slate-900 text-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-bold truncate">{message}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Tự ẩn sau {secondsLeft}s
            </p>
          </div>
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white hover:bg-emerald-400 transition active:scale-95 cursor-pointer"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Hoàn tác
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-1 bg-slate-800">
          <div
            className="h-full bg-emerald-500 transition-none"
            style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
