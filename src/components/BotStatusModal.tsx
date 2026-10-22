"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  Bot, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Radio, 
  Clock, 
  RefreshCw, 
  HelpCircle,
  Eye
} from "lucide-react";

interface BotInfo {
  name: string;
  online: boolean;
  lastPing: string | null;
}

interface BotStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  botStatus?: {
    online: boolean;
    lastPing: string | null;
    bots?: BotInfo[];
  };
  botOfflineReason?: string | null;
  isBannerDismissed?: boolean;
  onRestoreBanner?: () => void;
}

export default function BotStatusModal({
  isOpen,
  onClose,
  botStatus,
  botOfflineReason,
  isBannerDismissed = false,
  onRestoreBanner,
}: BotStatusModalProps) {
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

  const isOnline = !!botStatus?.online && !botOfflineReason;
  const botsList: BotInfo[] = botStatus?.bots?.length
    ? botStatus.bots
    : [{ name: "Bot Zalo", online: !!botStatus?.online, lastPing: botStatus?.lastPing ?? null }];

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200 touch-none overscroll-none"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-sm sm:max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in zoom-in-95 duration-200 p-5 sm:p-6 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng góc phải */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer active:scale-95"
          title="Đóng"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header với Icon nổi bật */}
        <div className="flex flex-col items-center text-center space-y-2.5 pb-3">
          <div className="relative">
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform ${
              isOnline ? "bg-emerald-600 shadow-emerald-600/25" : "bg-amber-500 shadow-amber-500/25"
            }`}>
              <Bot className="h-7 w-7" />
            </div>
            <span
              className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white ${
                isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
          </div>

          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Trạng Thái Bot Zalo
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Đồng bộ tin nhắn tự động từ các nhóm chat Zalo
            </p>
          </div>
        </div>

        {/* Nội dung có thể cuộn nếu quá dài */}
        <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 py-1">
          {/* Trạng thái tổng quát */}
          <div className={`rounded-2xl p-3.5 border ${
            isOnline 
              ? "bg-emerald-50/80 border-emerald-200 text-emerald-950" 
              : "bg-amber-50/90 border-amber-300 text-amber-950"
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                )}
                <span className="text-xs font-black uppercase tracking-wide">
                  {isOnline ? "Đang hoạt động (Online)" : "Ngoại tuyến (Offline)"}
                </span>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                isOnline ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                {isOnline ? "ONLINE" : "OFFLINE"}
              </span>
            </div>

            {botOfflineReason && (
              <p className="text-xs font-semibold text-amber-900 mt-2">
                Lý do: <span className="font-bold">{botOfflineReason}</span>
              </p>
            )}

            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 mt-2">
              <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>
                {botStatus?.lastPing
                  ? `Tín hiệu gần nhất: ${new Date(botStatus.lastPing).toLocaleTimeString("vi-VN")} - ${new Date(botStatus.lastPing).toLocaleDateString("vi-VN")}`
                  : "Chưa nhận được tín hiệu nào từ bot"}
              </span>
            </div>
          </div>

          {/* Chi tiết danh sách bot nếu có */}
          {botsList.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                Danh sách Bot ({botsList.length})
              </p>
              <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-slate-50/50">
                {botsList.map((bot) => (
                  <div key={bot.name} className="p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-white shrink-0 ${
                        bot.online ? "bg-emerald-600" : "bg-amber-500"
                      }`}>
                        <Radio className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {bot.name}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {bot.lastPing 
                            ? `Ping: ${new Date(bot.lastPing).toLocaleTimeString("vi-VN")}` 
                            : "Chưa kết nối"}
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      bot.online 
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${bot.online ? "bg-emerald-500" : "bg-amber-500"}`} />
                      {bot.online ? "Online" : "Tắt"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hướng dẫn khắc phục nếu đang offline */}
          {!isOnline && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                <HelpCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Cách khắc phục sự cố:</span>
              </div>
              <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-amber-900">
                <li>
                  Mở app <strong>Zalo Bot Desktop</strong> trên máy đang chạy bot → khay (tray) góc phải màn hình phải hiện chấm <strong>xanh Online</strong>.
                </li>
                <li>
                  Nếu app báo <strong>Session hết hạn</strong> hoặc <strong>Mất kết nối</strong> → quét lại mã QR bằng Zalo (App &gt; Quét mã) trong cửa sổ app vừa tự mở.
                </li>
                <li>
                  Nhấn <strong>Bật Bot</strong> trong app (hoặc bật mục <strong>Khởi động cùng Windows</strong>) và kiểm tra máy tính đang mở, có internet.
                </li>
                <li>
                  Kiểm tra <strong>Cài đặt</strong> trong app: webhook phải trỏ đúng <span className="font-mono font-bold text-slate-800">/api/webhook/zalo</span> và trang web này đang chạy.
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-2">
          {isBannerDismissed && botOfflineReason && onRestoreBanner && (
            <button
              type="button"
              onClick={() => {
                onRestoreBanner();
                onClose();
              }}
              className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs transition cursor-pointer active:scale-95"
            >
              <Eye className="h-3.5 w-3.5 text-amber-800" />
              <span>Hiện lại thông báo</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto flex-1 inline-flex items-center justify-center py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer active:scale-95"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
