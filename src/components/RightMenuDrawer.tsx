"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  X, 
  PlusCircle, 
  Download, 
  FileSpreadsheet, 
  Layers, 
  CheckCircle2, 
  Settings, 
  Info,
  Warehouse,
  ExternalLink,
  ShieldCheck,
  RotateCw,
  Sparkles,
  FlaskConical,
  Radio,
  ChevronDown,
  ChevronUp,
  LogOut,
  KeyRound
} from "lucide-react";
import { APP_VERSION, APP_BUILD_TIME } from "@/lib/version";
import type { Item, ItemHistory, ZaloMessage } from "@/types";
import ZaloLiveFeed from "@/components/ZaloLiveFeed";
import ZaloSimulator from "@/components/ZaloSimulator";

const pad = (n: number) => String(n).padStart(2, "0");

export default function RightMenuDrawer({
  isOpen,
  onClose,
  totalWarehouses,
  items,
  history,
  messages,
  botStatus,
  onAddWarehouse,
  onOpenPaste,
  onOpenWarehouse,
  onSendWebhook,
  onFilterSkuType,
}: {
  isOpen: boolean;
  onClose: () => void;
  totalWarehouses: number;
  items: Item[];
  history: ItemHistory[];
  messages: ZaloMessage[];
  botStatus?: { online: boolean; lastPing: string | null };
  onAddWarehouse: () => Promise<void>;
  onOpenPaste: () => void;
  onOpenWarehouse?: (warehouse: number) => void;
  onSendWebhook?: (payload: { groupId: string; message: string }) => Promise<{ ok: boolean; message: ZaloMessage }>;
  onFilterSkuType?: (prefix: string) => void;
}) {
  const [addingWh, setAddingWh] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [devTab, setDevTab] = useState<"live" | "sim" | null>(null);
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  const [pinChangeError, setPinChangeError] = useState("");
  const [pinChangeLoading, setPinChangeLoading] = useState(false);

  // Khóa cứng cuộn trang nền ngoài chuẩn Mobile PWA (iOS Safari & Android Chrome)
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

  // Thống kê nhanh theo dòng sản phẩm
  const prefixStats = (() => {
    const map: Record<string, number> = {
      E: 0,
      P: 0,
      K: 0,
      S: 0,
      PT: 0,
      PCT: 0,
      BC: 0,
      Khác: 0,
    };
    for (const it of items) {
      const u = it.sku.toUpperCase();
      if (u.startsWith("PCT")) map["PCT"]++;
      else if (u.startsWith("PT")) map["PT"]++;
      else if (u.startsWith("BC")) map["BC"]++;
      else if (u.startsWith("E")) map["E"]++;
      else if (u.startsWith("P")) map["P"]++;
      else if (u.startsWith("K")) map["K"]++;
      else if (u.startsWith("S")) map["S"]++;
      else map["Khác"]++;
    }
    return map;
  })();

  // Xuất file CSV / Excel danh sách mã kho
  const handleExportCSV = () => {
    setExporting(true);
    try {
      // Header CSV với BOM để Excel tiếng Việt không bị lỗi font
      const BOM = "\uFEFF";
      const headers = ["STT", "Mã SKU", "Kho Vị Trí", "Trạng Thái", "Tên Mặt Hàng", "Số Lượng", "Thời Gian Cập Nhật"];
      const rows = items.map((it, idx) => [
        idx + 1,
        `"${it.sku}"`,
        `"Kho ${pad(it.warehouse)}"`,
        `"${it.status === "sold" ? "Đã bán" : "Còn trong kho"}"`,
        `"${it.name}"`,
        it.qty,
        `"${new Date(it.updatedAt).toLocaleString("vi-VN")}"`,
      ]);

      const csvContent = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Bao_Cao_Kho_Xuong_Lua_Nhut_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Lỗi xuất file CSV:", e);
      alert("Không thể xuất file lúc này");
    } finally {
      setExporting(false);
    }
  };

  const handleCreateWarehouse = async () => {
    const confirmAdd = window.confirm(`Bạn có chắc chắn muốn tạo thêm KHO ${pad(totalWarehouses + 1)} vào hệ thống không?`);
    if (!confirmAdd) return;

    setAddingWh(true);
    try {
      await onAddWarehouse();
      setAddSuccess(`Đã tạo thành công KHO ${pad(totalWarehouses + 1)}!`);
      setTimeout(() => setAddSuccess(null), 4000);
    } catch (e) {
      console.error(e);
      alert("Lỗi khi thêm kho mới");
    } finally {
      setAddingWh(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinChangeError("");
    if (!/^\d{4}$/.test(newPinInput)) {
      setPinChangeError("Mã PIN mới phải gồm đúng 4 chữ số");
      return;
    }

    setPinChangeLoading(true);
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin: currentPinInput, newPin: newPinInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Không thể đổi mã PIN");
      }
      setAddSuccess("Đã cập nhật mã PIN mới vào hệ thống thành công!");
      setTimeout(() => setAddSuccess(null), 5000);
      setShowChangePinModal(false);
      setCurrentPinInput("");
      setNewPinInput("");
    } catch (err) {
      setPinChangeError(err instanceof Error ? err.message : "Lỗi đổi mã PIN");
    } finally {
      setPinChangeLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 touch-none overscroll-none">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex">
        <div 
          className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          
          {/* HEADER MENU BÊN PHẢI - Thêm pt-safe / pt-12 trên mobile để không bị tai thỏ & camera che */}
          <div className="pt-10 sm:pt-4 px-4 sm:px-5 pb-3 sm:pb-4 border-b border-slate-200 bg-white/95 backdrop-blur-md flex items-center justify-between sticky top-0 z-10 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                <Settings className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                  Menu Quản Lý & Tiện Ích
                </h2>
                <p className="text-[11px] text-slate-500 font-medium">Xưởng Lũa Nhựt</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer border border-slate-200 bg-slate-50"
              title="Đóng menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* NỘI DUNG CUỘN */}
          <div 
            className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 pb-12 overscroll-contain touch-pan-y"
            style={{ WebkitOverflowScrolling: "touch" }}
            onTouchMove={(e) => e.stopPropagation()}
          >

            <div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Đăng xuất
              </button>
            </div>

            {/* THÔNG BÁO THÀNH CÔNG */}
            {addSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{addSuccess}</span>
              </div>
            )}

            {/* 1. QUẢN LÝ Ô KHO & TẠO THÊM KHO */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Warehouse className="h-4 w-4 text-emerald-600" />
                  Hệ Thống Ô Kho Hiện Tại
                </span>
                <span className="font-mono text-xs font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                  {totalWarehouses} Ô KHO
                </span>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Bạn có thể mở rộng thêm kho mới bất kỳ lúc nào. Kho mới được thêm sẽ tự động xuất hiện trên sơ đồ và cho phép nạp/chuyển mã hàng.
                </p>

                <button
                  type="button"
                  disabled={addingWh}
                  onClick={handleCreateWarehouse}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2.5 text-xs font-bold hover:bg-slate-800 transition active:scale-98 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <PlusCircle className="h-4 w-4 text-emerald-400" />
                  <span>{addingWh ? "Đang tạo kho mới..." : `+ Tạo Thêm Kho ${pad(totalWarehouses + 1)}`}</span>
                </button>
              </div>
            </div>

            {/* 2. TÍNH NĂNG XUẤT BÁO CÁO EXCEL / CSV */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Xuất Báo Cáo Kho Hàng
              </span>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Tổng số sản phẩm đang có:</span>
                  <span className="font-bold font-mono text-slate-900">{items.length} mã</span>
                </div>

                <button
                  type="button"
                  disabled={exporting || items.length === 0}
                  onClick={handleExportCSV}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 px-4 py-2.5 text-xs font-bold hover:bg-emerald-100 transition active:scale-98 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="h-4 w-4 text-emerald-600" />
                  <span>{exporting ? "Đang xuất file..." : "Tải Bảng Excel/CSV Toàn Bộ Kho"}</span>
                </button>
              </div>
            </div>

            {/* 3. THỐNG KÊ NHANH THEO DÒNG SẢN PHẨM */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-emerald-600" />
                Phân Loại Dòng Hàng Đang Có
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(prefixStats).map(([prefix, count]) => (
                  <div
                    key={prefix}
                    className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/80 flex items-center justify-between"
                  >
                    <span className="font-bold text-slate-700">Dòng {prefix}:</span>
                    <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. TIỆN ÍCH DÁN CHAT NHANH */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                Công Cụ Hỗ Trợ
              </span>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPaste();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition cursor-pointer text-left text-xs font-bold text-slate-800"
              >
                <span>Mở hộp thoại Dán Chat Zalo</span>
                <span className="text-emerald-700 font-semibold text-[11px]">Mở ngay →</span>
              </button>
            </div>

            {/* 5. KHU VỰC TÍNH NĂNG ĐANG PHÁT TRIỂN & THỬ NGHIỆM */}
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                  <FlaskConical className="h-4 w-4 text-amber-600" />
                  Tính Năng Đang Phát Triển
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  Thử nghiệm (Lab)
                </span>
              </div>

              {/* TÙY CHỌN 1: BẢNG TIN LIVE FEED NHẬT KÝ ZALO */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDevTab(devTab === "live" ? null : "live")}
                  className="w-full flex items-center justify-between p-3 text-left transition hover:bg-slate-100 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-emerald-600" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Nhật Ký Tin Nhắn Zalo Live</span>
                      <span className="text-[10px] text-slate-400">Xem luồng tin bot quét theo thời gian thực</span>
                    </div>
                  </div>
                  {devTab === "live" ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </button>

                {devTab === "live" && (
                  <div className="p-3 border-t border-slate-200 bg-white animate-in fade-in">
                    <ZaloLiveFeed
                      messages={messages}
                      totalWarehouses={totalWarehouses}
                      onOpenWarehouse={(wh) => {
                        onClose();
                        if (onOpenWarehouse) onOpenWarehouse(wh);
                      }}
                    />
                  </div>
                )}
              </div>

              {/* TÙY CHỌN 2: MÔ PHỎNG TEST TIN NHẮN (ZALO SIMULATOR) */}
              {onSendWebhook && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDevTab(devTab === "sim" ? null : "sim")}
                    className="w-full flex items-center justify-between p-3 text-left transition hover:bg-slate-100 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-600" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Mô Phỏng Tin Nhắn Zalo</span>
                        <span className="text-[10px] text-slate-400">Giả lập gửi tin từ các nhóm kho để test</span>
                      </div>
                    </div>
                    {devTab === "sim" ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  {devTab === "sim" && (
                    <div className="p-3 border-t border-slate-200 bg-white animate-in fade-in">
                      <ZaloSimulator
                        messages={messages}
                        onSend={onSendWebhook}
                        items={items}
                        totalWarehouses={totalWarehouses}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 6. TRẠNG THÁI HỆ THỐNG */}
            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 text-xs text-slate-500 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700 font-bold">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Trạng thái kết nối</span>
                </div>
                {botStatus ? (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      botStatus.online
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-amber-100 text-amber-800 border border-amber-300"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        botStatus.online ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                      }`}
                    />
                    {botStatus.online ? "Bot Đang Chạy" : "Bot Đang Tắt"}
                  </span>
                ) : null}
              </div>

              <div className="text-[11px] leading-relaxed space-y-1">
                <div className="flex items-start gap-1.5">
                  <span className={botStatus?.online ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>•</span>
                  <span>
                    <strong>Zalo Bot trên máy:</strong>{" "}
                    {botStatus?.online ? (
                      <span className="text-emerald-700 font-semibold">Đang hoạt động trực tiếp (nghe tin nhắn & tự đồng bộ).</span>
                    ) : (
                      <span className="text-amber-700">Chưa bật hoặc đang tắt máy. Khi bật lại sẽ tự quét nạp tin nhắn cũ.</span>
                    )}
                  </span>
                </div>
                {botStatus?.lastPing && (
                  <div className="text-[10px] text-slate-400 pl-3">
                    Lần phát tín hiệu cuối: {new Date(botStatus.lastPing).toLocaleTimeString("vi-VN")} - {new Date(botStatus.lastPing).toLocaleDateString("vi-VN")}
                  </div>
                )}
                <div className="flex items-start gap-1.5">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span><strong>Hệ thống cơ sở dữ liệu:</strong> Hoạt động ổn định trên Supabase Cloud.</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span><strong>Chế độ PWA:</strong> Đã kích hoạt trên trình duyệt & điện thoại.</span>
                </div>
              </div>
            </div>

          </div>

          {/* FOOTER DRAWER */}
          <div className="p-3.5 border-t border-slate-200 bg-slate-50 text-center flex flex-col items-center gap-0.5 shrink-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span>Xưởng Lũa Nhựt</span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-black border border-emerald-200">
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              Bản cập nhật: {APP_BUILD_TIME}
            </p>
          </div>
        </div>
      </div>

      {/* POPUP ĐỔI MÃ PIN */}
      {showChangePinModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div 
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <KeyRound className="h-4 w-4" />
                </div>
                <h3 className="font-extrabold text-sm text-slate-900">Đổi Mã PIN Hệ Thống</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePinModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleChangePin} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Mã PIN hiện tại</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={currentPinInput}
                  onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="Nhập 4 số PIN cũ"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-center text-lg tracking-[0.3em] font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Mã PIN mới (4 số)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="Nhập 4 số PIN mới"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-center text-lg tracking-[0.3em] font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  required
                />
              </div>

              {pinChangeError && (
                <p className="text-xs text-rose-600 font-bold bg-rose-50 border border-rose-200 p-2 rounded-lg text-center">
                  {pinChangeError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePinModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={pinChangeLoading || currentPinInput.length !== 4 || newPinInput.length !== 4}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer shadow-sm shadow-emerald-500/30"
                >
                  {pinChangeLoading ? "Đang lưu..." : "Lưu mã PIN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
