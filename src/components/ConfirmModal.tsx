"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { 
  ShoppingBag, 
  Trash2, 
  RotateCcw, 
  AlertTriangle, 
  HelpCircle,
  X
} from "lucide-react";

export type ConfirmVariant = "sold" | "danger" | "warning" | "info" | "success";

interface ConfirmModalProps {
  isOpen: boolean;
  variant?: ConfirmVariant;
  title: string;
  sku?: string;
  message: string | ReactNode;
  subMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  variant = "sold",
  title,
  sku,
  message,
  subMessage,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Chống double-click: ref chặn đồng bộ trong cùng 1 tick, state để render UI.
  // Tự reset trong finally của handleConfirm khi onConfirm chạy xong/đóng modal.
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Khóa cuộn trang khi mở modal (chuẩn iOS PWA)
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPosition = document.body.style.position;
    const originalBodyTop = document.body.style.top;
    const originalBodyWidth = document.body.style.width;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.position = originalBodyPosition;
      document.body.style.top = originalBodyTop;
      document.body.style.width = originalBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  // Cấu hình màu sắc, icon, theme theo variant
  const getVariantStyles = () => {
    switch (variant) {
      case "sold":
        return {
          icon: ShoppingBag,
          iconBg: "bg-amber-500",
          iconColor: "text-white",
          ringColor: "ring-amber-500/20",
          badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
          confirmBtn: "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25",
        };
      case "danger":
        return {
          icon: Trash2,
          iconBg: "bg-rose-600",
          iconColor: "text-white",
          ringColor: "ring-rose-600/20",
          badgeBg: "bg-rose-100 text-rose-900 border-rose-300",
          confirmBtn: "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/25",
        };
      case "success":
        return {
          icon: RotateCcw,
          iconBg: "bg-emerald-600",
          iconColor: "text-white",
          ringColor: "ring-emerald-600/20",
          badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
          confirmBtn: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25",
        };
      case "warning":
        return {
          icon: AlertTriangle,
          iconBg: "bg-amber-600",
          iconColor: "text-white",
          ringColor: "ring-amber-600/20",
          badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
          confirmBtn: "bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/25",
        };
      default:
        return {
          icon: HelpCircle,
          iconBg: "bg-slate-900",
          iconColor: "text-white",
          ringColor: "ring-slate-900/20",
          badgeBg: "bg-slate-100 text-slate-900 border-slate-300",
          confirmBtn: "bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/25",
        };
    }
  };

  const currentTheme = getVariantStyles();
  const Icon = currentTheme.icon;

  const handleConfirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onConfirm();
    } catch {
      // Lỗi đã được nơi gọi xử lý — mở lại nút để người dùng thử lại
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleCancel = () => {
    if (busyRef.current) return;
    onCancel();
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200 touch-none overscroll-none"
      onClick={handleCancel}
    >
      <div 
        className="relative w-full max-w-sm sm:max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in zoom-in-95 duration-200 p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng góc phải */}
        <button
          type="button"
          disabled={busy}
          onClick={handleCancel}
          className="absolute top-4 right-4 h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Đóng"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header với Icon tròn lớn nổi bật */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className={`h-14 w-14 sm:h-16 sm:w-16 rounded-2xl ${currentTheme.iconBg} ${currentTheme.iconColor} flex items-center justify-center shadow-lg ring-8 ${currentTheme.ringColor} transition-transform`}>
            <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              {title}
            </h3>

            {sku && (
              <div className="pt-1">
                <span className={`inline-flex items-center font-mono text-sm sm:text-base font-black px-3 py-1 rounded-xl border shadow-2xs tracking-wider ${currentTheme.badgeBg}`}>
                  [{sku}]
                </span>
              </div>
            )}
          </div>

          {/* Nội dung thông báo & ghi chú */}
          <div className="space-y-2 pt-1 text-slate-600">
            <p className="text-xs sm:text-sm font-semibold leading-relaxed">
              {message}
            </p>

            {subMessage && (
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] sm:text-xs text-slate-500 font-medium leading-relaxed">
                {subMessage}
              </div>
            )}
          </div>
        </div>

        {/* 2 Nút thao tác dưới chân modal */}
        <div className="flex items-center gap-2.5 sm:gap-3 mt-6 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={busy}
            onClick={handleCancel}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold transition active:scale-95 cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            disabled={confirmDisabled || busy}
            onClick={handleConfirm}
            className={`flex-1 py-3 px-4 rounded-xl font-black text-xs sm:text-sm transition active:scale-95 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 ${currentTheme.confirmBtn}`}
          >
            {busy && (
              <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {busy ? "Đang xử lý..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
