"use client";

import { useState, useEffect, useCallback } from "react";
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
  ChevronRight,
  LogOut,
  KeyRound,
  Database,
  Wifi,
  WifiOff,
  ClipboardPaste,
  Boxes,
  History,
  Volume2,
  VolumeX,
  Vibrate,
  Eye
} from "lucide-react";
import { APP_VERSION, APP_BUILD_TIME } from "@/lib/version";
import type { SessionRole } from "@/lib/auth-session";
import { getSettings, setSettings, SETTINGS_EVENT, type AppSettings } from "@/lib/app-settings";
import { tingFound } from "@/lib/audio";
import { vibrate } from "@/lib/haptics";
import type { Item, ItemHistory, ZaloMessage } from "@/types";
import ZaloLiveFeed from "@/components/ZaloLiveFeed";
import ZaloSimulator from "@/components/ZaloSimulator";
import ConfirmModal from "@/components/ConfirmModal";

const pad = (n: number) => String(n).padStart(2, "0");

type BackupMeta = { id: string; snapshotDate: string; itemCount: number; createdAt: string };

export default function RightMenuDrawer({
  isOpen,
  onClose,
  embedded = false,
  totalWarehouses,
  items,
  history,
  messages,
  botStatus,
  dbStatus,
  onAddWarehouse,
  onOpenPaste,
  onOpenWarehouse,
  onSendWebhook,
  onFilterSkuType,
  role = "admin",
}: {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  totalWarehouses: number;
  items: Item[];
  history: ItemHistory[];
  messages: ZaloMessage[];
  botStatus?: { online: boolean; lastPing: string | null; bots?: { name: string; online: boolean; lastPing: string | null }[] };
  dbStatus?: { connected: boolean; type: "supabase" | "local"; latencyMs?: number; itemCount?: number };
  role?: SessionRole;
  onAddWarehouse: () => Promise<void>;
  onOpenPaste: () => void;
  onOpenWarehouse?: (warehouse: number) => void;
  onSendWebhook?: (payload: { groupId: string; message: string }) => Promise<{ ok: boolean; message: ZaloMessage }>;
  onFilterSkuType?: (prefix: string) => void;
}) {
  const isAdmin = role !== "staff";
  const [addingWh, setAddingWh] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [devTab, setDevTab] = useState<"live" | "sim" | null>(null);
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  const [newStaffPinInput, setNewStaffPinInput] = useState("");
  const [pinChangeError, setPinChangeError] = useState("");
  const [pinChangeLoading, setPinChangeLoading] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [settings, setSettingsState] = useState<AppSettings>({ sound: true, haptic: true });
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupMeta | null>(null);
  const [showAddWhConfirm, setShowAddWhConfirm] = useState(false);

  // Đồng bộ toggle âm thanh/rung
  useEffect(() => {
    const sync = () => setSettingsState(getSettings());
    sync();
    window.addEventListener(SETTINGS_EVENT, sync as EventListener);
    return () => window.removeEventListener(SETTINGS_EVENT, sync as EventListener);
  }, []);

  const loadBackups = useCallback(async () => {
    try {
      const res = await fetch("/api/backup", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.backups)) setBackups(data.backups);
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/backup", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.backups)) setBackups(data.backups);
      })
      .catch(() => undefined);
  }, []);

  // Khóa cuộn trang nền an toàn chuẩn Mobile PWA (iOS Safari & Android Chrome)
  useEffect(() => {
    if (embedded || !isOpen) return;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
    };
  }, [isOpen, embedded]);

  if (!embedded && (!isOpen || typeof document === "undefined")) return null;

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

  // Chuẩn bị dữ liệu xuất chung cho CSV + Excel (7 cột)
  const buildRows = () => {
    const headers = ["STT", "Mã SKU", "Kho Vị Trí", "Trạng Thái", "Tên Mặt Hàng", "Số Lượng", "Ngày Nhập (Cập Nhật)"];
    const rows = items.map((it, idx) => [
      idx + 1,
      it.sku,
      `Kho ${pad(it.warehouse)}`,
      it.status === "sold" ? "Đã bán" : "Còn trong kho",
      it.name,
      it.qty,
      new Date(it.updatedAt).toLocaleString("vi-VN"),
    ]);
    return { headers, rows };
  };

  // Xuất file CSV / Excel danh sách mã kho (1 click, dynamic import xlsx)
  const handleExport = async (format: "csv" | "xlsx") => {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const base = `Bao_Cao_Kho_Xuong_Lua_Nhut_${stamp}`;
      const { headers, rows } = buildRows();

      if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "TonKho");
        XLSX.writeFile(wb, `${base}.xlsx`);
      } else {
        // Header CSV với BOM để Excel tiếng Việt không bị lỗi font
        const BOM = "\uFEFF";
        const csvRows = rows.map((r) =>
          r.map((c, i) => (typeof c === "string" && (i === 1 || i === 2 || i === 3 || i === 4 || i === 6) ? `"${c}"` : String(c))).join(",")
        );
        const csvContent = BOM + [headers.join(","), ...csvRows].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `${base}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e) {
      console.error("Lỗi xuất file:", e);
      alert("Không thể xuất file lúc này");
    } finally {
      setExporting(false);
    }
  };

  // Sao lưu ngay / phục hồi / tải snapshot
  const handleCreateBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sao lưu thất bại");
      setAddSuccess(`Đã sao lưu ${data.backup?.itemCount ?? items.length} mã thành công!`);
      setTimeout(() => setAddSuccess(null), 4000);
      await loadBackups();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Không sao lưu được");
    } finally {
      setBackupBusy(false);
    }
  };

  const handleDownloadBackup = async (id: string) => {
    try {
      const res = await fetch(`/api/backup?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Không tải được snapshot");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `backup_${id}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Không tải được file");
    }
  };

  const executeRestore = async () => {
    if (!restoreTarget) return;
    setBackupBusy(true);
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", id: restoreTarget.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Phục hồi thất bại");
      setAddSuccess(`Đã phục hồi ${data.itemCount} mã từ snapshot ${restoreTarget.snapshotDate}!`);
      setTimeout(() => setAddSuccess(null), 5000);
      setRestoreTarget(null);
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Không phục hồi được");
      setBackupBusy(false);
    }
  };

  const handleCreateWarehouse = () => {
    setShowAddWhConfirm(true);
  };

  const executeAddWarehouse = async () => {
    setShowAddWhConfirm(false);
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
    const hasStaffPin = newStaffPinInput.length > 0;
    if (newPinInput.length === 0 && !hasStaffPin) {
      setPinChangeError("Nhập PIN mới hoặc PIN Nhân viên mới");
      return;
    }
    if (newPinInput && !/^\d{4}$/.test(newPinInput)) {
      setPinChangeError("Mã PIN mới phải gồm đúng 4 chữ số");
      return;
    }
    if (hasStaffPin && !/^\d{4}$/.test(newStaffPinInput)) {
      setPinChangeError("Mã PIN Nhân viên phải gồm đúng 4 chữ số");
      return;
    }

    setPinChangeLoading(true);
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          hasStaffPin
            ? { currentPin: currentPinInput, newStaffPin: newStaffPinInput }
            : { currentPin: currentPinInput, newPin: newPinInput }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Không thể đổi mã PIN");
      }
      setAddSuccess(data.message || "Đã cập nhật mã PIN mới vào hệ thống thành công!");
      setTimeout(() => setAddSuccess(null), 5000);
      setShowChangePinModal(false);
      setCurrentPinInput("");
      setNewPinInput("");
      setNewStaffPinInput("");
    } catch (err) {
      setPinChangeError(err instanceof Error ? err.message : "Lỗi đổi mã PIN");
    } finally {
      setPinChangeLoading(false);
    }
  };

  const drawerContent = (
    <>
          
          {/* HEADER MENU BÊN PHẢI - Thêm safe area padding để không bị tai thỏ & camera che */}
          <div 
            className="px-4 sm:px-5 pb-3 sm:pb-4 border-b border-slate-200 bg-white/95 backdrop-blur-md flex items-center justify-between sticky top-0 z-10 shrink-0"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Boxes className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                    XƯỞNG LŨA NHỰT
                  </h2>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    v{APP_VERSION}
                  </span>
                  {!isAdmin && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                      <Eye className="h-2.5 w-2.5" /> Chỉ xem
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-medium">Menu Quản Lý & Tiện Ích Kho</p>
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

          {/* NỘI DUNG CUỘN - GitHub iOS Grouped Style */}
          <div 
            className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 pb-12 overscroll-contain touch-pan-y"
            style={{ WebkitOverflowScrolling: "touch" }}
            onTouchMove={(e) => e.stopPropagation()}
          >

            {/* THÔNG BÁO THÀNH CÔNG */}
            {addSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{addSuccess}</span>
              </div>
            )}

            {/* NHÓM 1: CÔNG VIỆC & QUẢN TRỊ KHO (GIỐNG GITHUB "MY WORK") */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Quản Trị Kho & Tác Vụ
                </span>
                <span className="text-[11px] font-mono font-bold text-slate-400">
                  {totalWarehouses} kho · {items.length} mã
                </span>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200/90 divide-y divide-slate-100 shadow-xs overflow-hidden">
                {/* Mục 1: Thêm ô kho (CHỈ ADMIN) */}
                {isAdmin && (
                <button
                  type="button"
                  disabled={addingWh}
                  onClick={handleCreateWarehouse}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition cursor-pointer text-left disabled:opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Warehouse className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                        Hệ Thống Ô Kho
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        Hiện có {totalWarehouses} kho · Nhấn để thêm Kho {pad(totalWarehouses + 1)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                      {addingWh ? "Đang tạo..." : `+ Kho ${pad(totalWarehouses + 1)}`}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </button>
                )}

                {/* Mục 2: Dán đoạn chat Zalo (CHỈ ADMIN) */}
                {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPaste();
                  }}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <ClipboardPaste className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                        Dán Đoạn Chat Zalo
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        Tự nhận diện và cập nhật mã hàng loạt
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                      Mở ngay
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </button>
                )}

                {/* Mục 3: Xuất file Excel / CSV */}
                <div className="p-3.5 hover:bg-slate-50 transition">
                  <button
                    type="button"
                    disabled={exporting || items.length === 0}
                    onClick={() => setExportMenuOpen((v) => !v)}
                    className="w-full flex items-center justify-between text-left disabled:opacity-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                        <FileSpreadsheet className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                          Xuất File Báo Cáo
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          Tải bảng Excel / CSV {items.length} mã sản phẩm
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200">
                        {exporting ? "Đang tải..." : "Chọn định dạng"}
                      </span>
                      {exportMenuOpen ? <ChevronUp className="h-4 w-4 text-slate-300" /> : <ChevronDown className="h-4 w-4 text-slate-300" />}
                    </div>
                  </button>
                  {exportMenuOpen && (
                    <div className="mt-2 grid grid-cols-2 gap-2 animate-in fade-in">
                      <button
                        type="button"
                        onClick={() => handleExport("xlsx")}
                        className="rounded-xl border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100 transition cursor-pointer"
                      >
                        Excel (.xlsx)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport("csv")}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                      >
                        CSV (.csv)
                      </button>
                    </div>
                  )}
                </div>

                {/* Mục: Sao lưu & Phục hồi kho */}
                <div className="p-3.5 hover:bg-slate-50 transition space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <History className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                        Sao Lưu & Phục Hồi Kho
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {backups.length > 0 ? `${backups.length} bản đã lưu · mới nhất ${backups[0]?.snapshotDate}` : "Chưa có bản sao lưu nào"}
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={backupBusy}
                        onClick={handleCreateBackup}
                        className="shrink-0 rounded-xl bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 transition cursor-pointer disabled:opacity-50"
                      >
                        {backupBusy ? "Đang lưu..." : "Sao lưu ngay"}
                      </button>
                    )}
                  </div>

                  {backups.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                      {backups.slice(0, 10).map((b) => (
                        <div key={b.id} className="flex items-center justify-between gap-2 px-2.5 py-2 text-[11px]">
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block truncate">
                              {b.snapshotDate} · {new Date(b.createdAt).toLocaleTimeString("vi-VN")}
                            </span>
                            <span className="text-slate-400">{b.itemCount} mã</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDownloadBackup(b.id)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                            >
                              Tải về
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setRestoreTarget(b)}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                              >
                                Phục hồi
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mục 4: Đổi mã PIN hệ thống (CHỈ ADMIN) */}
                {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowChangePinModal(true)}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                        Mã PIN Bảo Mật
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        Đổi PIN Admin · Đặt PIN Nhân viên (chỉ xem)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-lg border border-violet-200">
                      Thay đổi
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </button>
                )}

                {/* Mục: Âm thanh & Rung */}
                <div className="p-3.5 space-y-2">
                  <span className="text-xs sm:text-sm font-bold text-slate-900 block">Âm Thanh & Rung</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = setSettings({ sound: !settings.sound });
                        setSettingsState(next);
                        if (next.sound) tingFound();
                      }}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition cursor-pointer ${
                        settings.sound
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      {settings.sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                      {settings.sound ? "Bật tiếng" : "Tắt tiếng"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = setSettings({ haptic: !settings.haptic });
                        setSettingsState(next);
                        if (next.haptic) vibrate(40);
                      }}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition cursor-pointer ${
                        settings.haptic
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      <Vibrate className="h-4 w-4" />
                      {settings.haptic ? "Bật rung" : "Tắt rung"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* NHÓM 2: DÒNG SẢN PHẨM (FAVORITES / CATEGORIES) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Dòng Sản Phẩm Hiện Có
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                  Chạm để lọc nhanh
                </span>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200/90 divide-y divide-slate-100 shadow-xs overflow-hidden">
                <div className="p-3 grid grid-cols-4 gap-2">
                  {Object.entries(prefixStats).map(([prefix, count]) => (
                    <button
                      key={prefix}
                      type="button"
                      onClick={() => {
                        onClose();
                        if (onFilterSkuType) onFilterSkuType(prefix === "Khác" ? "" : prefix);
                      }}
                      className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center transition cursor-pointer active:scale-95 shadow-2xs"
                    >
                      <span className="text-xs font-black text-slate-800 font-mono">
                        {prefix}
                      </span>
                      <span className="font-mono text-xs font-extrabold text-emerald-600 mt-0.5">
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* NHÓM 3: KHU VỰC THỬ NGHIỆM & CÔNG CỤ (SHORTCUTS / LAB) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Công Cụ Thử Nghiệm (Lab)
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  Beta
                </span>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200/90 divide-y divide-slate-100 shadow-xs overflow-hidden">
                {/* Live Feed */}
                <div>
                  <button
                    type="button"
                    onClick={() => setDevTab(devTab === "live" ? null : "live")}
                    className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                        <Radio className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                          Nhật Ký Zalo Live Feed
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          Theo dõi tin nhắn quét theo thời gian thực
                        </span>
                      </div>
                    </div>
                    {devTab === "live" ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  {devTab === "live" && (
                    <div className="p-3 border-t border-slate-100 bg-slate-50/50 animate-in fade-in">
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

                {/* Simulator */}
                {onSendWebhook && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setDevTab(devTab === "sim" ? null : "sim")}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div>
                          <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                            Mô Phỏng Tin Nhắn Zalo
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            Giả lập gửi tin từ các nhóm kho để test
                          </span>
                        </div>
                      </div>
                      {devTab === "sim" ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </button>

                    {devTab === "sim" && (
                      <div className="p-3 border-t border-slate-100 bg-slate-50/50 animate-in fade-in">
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
            </div>

            {/* NHÓM 4: TRẠNG THÁI HỆ THỐNG (SYSTEM STATUS CARD) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Trạng Thái & Kết Nối
                </span>
                <span className="text-[11px] font-bold text-emerald-700">
                  {dbStatus?.connected ? "Trực tuyến" : "Ngoại tuyến"}
                </span>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200/90 divide-y divide-slate-100 shadow-xs overflow-hidden text-xs">
                {/* Supabase Status */}
                <div className="p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-xl text-white flex items-center justify-center shrink-0 shadow-2xs ${
                      dbStatus?.connected ? "bg-emerald-600" : "bg-rose-500"
                    }`}>
                      <Database className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block">
                        Cơ Sở Dữ Liệu Supabase
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {dbStatus?.connected 
                          ? `Đã kết nối (${dbStatus.latencyMs ?? 0}ms)` 
                          : "Mất kết nối Supabase Cloud"}
                      </span>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold ${
                    dbStatus?.connected 
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dbStatus?.connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                    {dbStatus?.connected ? `${dbStatus.itemCount ?? items.length} mã` : "Offline"}
                  </span>
                </div>

                {/* Zalo Bot Status (đa máy: liệt kê từng bot) */}
                {(botStatus?.bots?.length
                  ? botStatus.bots
                  : [{ name: "Bot", online: !!botStatus?.online, lastPing: botStatus?.lastPing ?? null }]
                ).map((bot) => (
                  <div key={bot.name} className="p-3.5 flex items-center justify-between border-t border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-xl text-white flex items-center justify-center shrink-0 shadow-2xs ${
                        bot.online ? "bg-emerald-600" : "bg-amber-500"
                      }`}>
                        <Radio className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block">
                          Bot {bot.name}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {bot.online
                            ? `Đang chạy${bot.lastPing ? ` · ping ${new Date(bot.lastPing).toLocaleTimeString("vi-VN")}` : ""}`
                            : "Chưa bật / mất kết nối"}
                        </span>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold ${
                      bot.online
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${bot.online ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                      {bot.online ? "Online" : "Tắt"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* NHÓM 5: NÚT ĐĂNG XUẤT */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer shadow-xs active:scale-98"
              >
                <LogOut className="h-4 w-4" />
                Đăng Xuất Khỏi Hệ Thống
              </button>
            </div>

          </div>

          {/* FOOTER DRAWER */}
          <div 
            className="p-3.5 border-t border-slate-200 bg-slate-50 text-center flex flex-col items-center gap-0.5 shrink-0"
            style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
          >
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
                <label className="block text-xs font-bold text-slate-600 mb-1">Mã PIN Admin hiện tại</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={currentPinInput}
                  onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="Nhập 4 số PIN Admin"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-center text-lg tracking-[0.3em] font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Mã PIN Admin mới (để trống nếu không đổi)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="Nhập 4 số PIN Admin mới"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-center text-lg tracking-[0.3em] font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Mã PIN Nhân viên mới (chỉ xem, để trống nếu không đổi)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newStaffPinInput}
                  onChange={(e) => setNewStaffPinInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="Nhập 4 số PIN Nhân viên"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-center text-lg tracking-[0.3em] font-mono outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
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
                  disabled={pinChangeLoading || currentPinInput.length !== 4 || (newPinInput.length === 0 && newStaffPinInput.length === 0)}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer shadow-sm shadow-emerald-500/30"
                >
                  {pinChangeLoading ? "Đang lưu..." : "Lưu mã PIN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HỘP THOẠI XÁC NHẬN THÊM Ô KHO CHUẨN IOS PWA (CHỈ MOUNT KHI MỞ) */}
      {showAddWhConfirm && (
        <ConfirmModal
          isOpen={showAddWhConfirm}
          variant="warning"
          title={`Thêm Ô Kho ${pad(totalWarehouses + 1)}`}
          message={`Bạn có chắc chắn muốn tạo thêm KHO ${pad(totalWarehouses + 1)} vào hệ thống không?`}
          subMessage={`Hệ thống sẽ mở rộng từ ${totalWarehouses} ô kho thành ${totalWarehouses + 1} ô kho vận hành.`}
          confirmLabel={`Tạo Kho ${pad(totalWarehouses + 1)}`}
          cancelLabel="Hủy bỏ"
          onConfirm={executeAddWarehouse}
          onCancel={() => setShowAddWhConfirm(false)}
        />
      )}

      {/* HỘP THOẠI XÁC NHẬN PHỤC HỒI SNAPSHOT (NGUY HIỂM) */}
      {restoreTarget && (
        <ConfirmModal
          isOpen={!!restoreTarget}
          variant="danger"
          title="Phục Hồi Kho Từ Snapshot"
          message={`Toàn bộ danh sách hàng trong kho sẽ được thay bằng dữ liệu backup ngày ${restoreTarget.snapshotDate} (${restoreTarget.itemCount} mã)?`}
          subMessage="Một snapshot an toàn sẽ được chụp trước khi ghi. Lịch sử bán/nhập vẫn được giữ nguyên."
          confirmLabel="Phục hồi ngay"
          cancelLabel="Hủy bỏ"
          onConfirm={executeRestore}
          onCancel={() => setRestoreTarget(null)}
        />
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-xs animate-in fade-in duration-200">
        {drawerContent}
      </div>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col border-l border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {drawerContent}
      </div>
    </div>,
    document.body
  );
}
