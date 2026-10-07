"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { 
  Boxes, 
  PackageSearch, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Warehouse,
  ShoppingBag,
  ArrowRightLeft,
  RotateCcw,
  Check,
  Database,
  Bot
} from "lucide-react";
import SearchBar from "@/components/SearchBar";
import WarehouseDetailModal from "@/components/WarehouseDetailModal";
import WarehouseGrid from "@/components/WarehouseGrid";
import WarehouseMapCanvas, { getWarehouseBuildingInfo } from "@/components/WarehouseMapCanvas";
import SizeInventoryManager from "@/components/SizeInventoryManager";
import PasteImportModal from "@/components/PasteImportModal";
import NotificationBell from "@/components/NotificationBell";
import RightMenuDrawer from "@/components/RightMenuDrawer";
import BottomTabBar, { type BottomTabType } from "@/components/BottomTabBar";
import ConfirmModal, { type ConfirmVariant } from "@/components/ConfirmModal";
import { APP_VERSION } from "@/lib/version";
import type { Item, ItemsResponse, ZaloMessage, ItemHistory } from "@/types";
import { 
  saveLocalItems, 
  getLocalItems, 
  saveLocalMessages, 
  getLocalMessages, 
  saveLocalHistory, 
  getLocalHistory,
  enqueueMutation
} from "@/pwa/db";

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} - ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

type Effect = { action: "in" | "out" | "assign"; sku: string; warehouse: number; qty: number };

function applyEffect(list: Item[], e: Effect): Item[] {
  const now = new Date().toISOString();
  const idx = list.findIndex((i) => i.sku === e.sku);
  if (e.action === "out") {
    return idx < 0 ? list : list.filter((_, i) => i !== idx);
  }
  if (idx >= 0) {
    return list.map((it, i) =>
      i === idx
        ? {
            ...it,
            warehouse: e.warehouse,
            qty: e.action === "in" ? it.qty + e.qty : it.qty,
            updatedAt: now,
          }
        : it
    );
  }
  return [
    ...list,
    {
      sku: e.sku,
      name: "Hàng độc bản",
      warehouse: e.warehouse,
      qty: 1,
      updatedAt: now,
    },
  ];
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [messages, setMessages] = useState<ZaloMessage[]>([]);
  const [history, setHistory] = useState<ItemHistory[]>([]);
  const [totalWarehouses, setTotalWarehouses] = useState<number>(30);
  const [botStatus, setBotStatus] = useState<{ online: boolean; lastPing: string | null } | undefined>(undefined);
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; type: "supabase" | "local"; latencyMs?: number; itemCount?: number } | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [openWarehouse, setOpenWarehouse] = useState<number | null>(null);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomTabType>("search");
  const [defaultPasteWarehouse, setDefaultPasteWarehouse] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [, setLoading] = useState(true);
  const [isSearchTransferring, setIsSearchTransferring] = useState(false);
  const [searchTargetWarehouse, setSearchTargetWarehouse] = useState(1);
  const [warehouseView, setWarehouseView] = useState<"grid" | "map">("grid");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fetchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetch("/api/items", { cache: "no-store", signal: controller.signal })
      .then((r) => {
        if (r.status === 401) {
          window.location.assign("/login");
          throw new Error("Chưa đăng nhập");
        }
        if (!r.ok) throw new Error("Không thể đồng bộ dữ liệu kho");
        return r.json() as Promise<ItemsResponse>;
      })
      .then(async (data) => {
        setItems(data.items || []);
        setMessages(data.messages || []);
        setHistory(data.history || []);
        if (data.botStatus) {
          setBotStatus(data.botStatus);
        }
        if (data.dbStatus) {
          setDbStatus(data.dbStatus);
        }
        if (data.totalWarehouses && data.totalWarehouses >= 30) {
          setTotalWarehouses(data.totalWarehouses);
        }
        // Lưu trữ bản sao dữ liệu an toàn vào IndexedDB theo chuẩn PWA 2026
        saveLocalItems(data.items || []).catch(() => undefined);
        saveLocalMessages(data.messages || []).catch(() => undefined);
        saveLocalHistory(data.history || []).catch(() => undefined);
        setError(null);
        setLoading(false);
      })
      .catch(async (caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        // Ngoại tuyến: Đọc từ IndexedDB cục bộ của máy
        try {
          const [cachedItems, cachedMsgs, cachedHist] = await Promise.all([
            getLocalItems(),
            getLocalMessages(),
            getLocalHistory(),
          ]);
          if (cachedItems && cachedItems.length > 0) {
            setItems(cachedItems);
            setMessages(cachedMsgs || []);
            setHistory(cachedHist || []);
            setError(null);
          } else {
            setError("Không thể kết nối máy chủ");
          }
        } catch {
          setError("Không thể đồng bộ dữ liệu kho");
        }
        setLoading(false);
      })
      .finally(() => { fetchingRef.current = false; });
  }, []);

  useEffect(() => {
    fetchData();
    const interval = window.setInterval(fetchData, 10000);
    const refreshVisible = () => { if (document.visibilityState === "visible") fetchData(); };
    window.addEventListener("focus", fetchData);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", fetchData);
      document.removeEventListener("visibilitychange", refreshVisible);
      abortRef.current?.abort();
    };
  }, [fetchData]);

  // Tự động trỏ con trỏ vào ô tra cứu khi vừa vào trang (đặt con trỏ ở cuối chuỗi, không bôi đen text)
  useEffect(() => {
    const focusTimer = setTimeout(() => {
      const el = searchInputRef.current || (document.getElementById("main-search-input") as HTMLInputElement | null);
      if (el) {
        el.focus({ preventScroll: true });
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {}
      }
    }, 200);
    return () => clearTimeout(focusTimer);
  }, []);

  const matchingItems = useMemo(() => {
    const code = query.trim().toUpperCase();
    if (!code) return [];
    return items.filter((i) => i.sku.toUpperCase().includes(code));
  }, [items, query]);

  // Mã được chọn hiển thị chi tiết (ưu tiên mã khớp chính xác, hoặc mã đầu tiên tìm thấy)
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  const activeFoundItem = useMemo(() => {
    if (matchingItems.length === 0) return null;
    if (selectedSku) {
      const match = matchingItems.find((i) => i.sku === selectedSku);
      if (match) return match;
    }
    // Ưu tiên khớp chính xác tuyệt đối nếu có
    const code = query.trim().toUpperCase();
    const exact = matchingItems.find((i) => i.sku.toUpperCase() === code);
    return exact || matchingItems[0];
  }, [matchingItems, selectedSku, query]);

  // State quản lý hộp thoại xác nhận đẹp chuẩn iOS (thay thế window.confirm)
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    variant: ConfirmVariant;
    title: string;
    sku?: string;
    message: string;
    subMessage?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    variant: "sold",
    title: "",
    message: "",
    onConfirm: () => {},
  });

  async function removeSku(sku: string) {
    setItems((list) => list.filter((i) => i.sku !== sku));
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", sku, note: "Xuất kho từ modal chi tiết" }),
      });
      if (res.ok) {
        fetchData();
      } else {
        await enqueueMutation("remove", { sku, note: "Xuất kho từ modal chi tiết" });
      }
    } catch {
      await enqueueMutation("remove", { sku, note: "Xuất kho từ modal chi tiết" });
    }
  }

  async function markSoldSku(sku: string, note: string = "Đã bán") {
    setItems((list) =>
      list.map((it) => (it.sku === sku ? { ...it, status: "sold", soldAt: new Date().toISOString() } : it))
    );
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_sold", sku, note }),
      });
      if (res.ok) {
        fetchData();
      } else {
        await enqueueMutation("sold", { sku, note });
      }
    } catch {
      await enqueueMutation("sold", { sku, note });
    }
  }

  async function restockSku(sku: string, warehouse?: number, note: string = "Khách trả / Nhập lại kho") {
    setItems((list) =>
      list.map((it) => (it.sku === sku ? { ...it, status: "active", warehouse: warehouse || it.warehouse } : it))
    );
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restock", sku, warehouse, note }),
      });
      if (res.ok) {
        fetchData();
      } else {
        await enqueueMutation("restock", { sku, warehouse, note });
      }
    } catch {
      await enqueueMutation("restock", { sku, warehouse, note });
    }
  }

  async function transferSku(sku: string, toWarehouse: number) {
    setItems((list) =>
      list.map((it) => (it.sku === sku ? { ...it, warehouse: toWarehouse } : it))
    );
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transfer", sku, toWarehouse }),
      });
      if (res.ok) {
        fetchData();
      } else {
        await enqueueMutation("transfer", { sku, toWarehouse });
      }
    } catch {
      await enqueueMutation("transfer", { sku, toWarehouse });
    }
  }

  async function bulkTransferSkus(skus: string[], toWarehouse: number) {
    for (const sku of skus) {
      await transferSku(sku, toWarehouse);
    }
  }

  async function bulkMarkSoldSkus(skus: string[], note?: string) {
    for (const sku of skus) {
      await markSoldSku(sku, note || "Đã bán");
    }
  }

  async function addWarehouseHandler() {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_warehouse" }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setTotalWarehouses(data.totalWarehouses);
      fetchData();
    } else {
      throw new Error(data.error || "Không thể tạo thêm kho");
    }
  }

  async function markAllReadHandler() {
    await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    setMessages((prev) => prev.map((m) => ({ ...m, read: true })));
  }

  async function markReadHandler(id: string) {
    try {
      await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", id }),
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, read: true } : m))
      );
    } catch (e) {
      console.error("Lỗi khi lưu trạng thái đã đọc:", e);
    }
  }

  async function onWebhook(payload: { groupId: string; message: string }) {
    const res = await fetch("/api/simulator/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setMessages((m) => [data.message as ZaloMessage, ...m].slice(0, 50));
    if (data.ok) setItems((list) => applyEffect(list, data.effect as Effect));
    return data as { ok: boolean; message: ZaloMessage };
  }

  // Danh sách các mặt hàng đang còn trong kho (chưa bán)
  const activeItems = useMemo(() => {
    return items.filter((i) => i.status !== "sold");
  }, [items]);

  // Thống kê số lượng ô kho đang có hàng thực tế
  const occupiedWarehouses = useMemo(() => {
    const set = new Set(activeItems.map((i) => i.warehouse));
    return set.size;
  }, [activeItems]);

  // Đếm tin nhắn Zalo chưa đọc
  const unreadMessageCount = useMemo(() => {
    return messages.filter((m) => !m.read && m.id !== "bot_heartbeat" && (m.message || "").trim().toUpperCase() !== "PING").length;
  }, [messages]);

  // Xử lý chuyển tab điều hướng dưới đáy (GitHub iOS Bottom Bar)
  const handleTabSelect = (tab: BottomTabType) => {
    if (tab === "paste") {
      setDefaultPasteWarehouse(1);
      setIsPasteOpen(true);
      return;
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (tab === "search") {
      // Focus và đặt con trỏ ở cuối ô tìm kiếm (không bôi đen text để tránh bị ghi đè nhầm)
      const triggerFocus = () => {
        const input = searchInputRef.current || (document.getElementById("main-search-input") as HTMLInputElement | null);
        if (input) {
          input.focus({ preventScroll: true });
          const len = input.value.length;
          try {
            input.setSelectionRange(len, len);
          } catch {}
        }
      };
      triggerFocus();
      setTimeout(triggerFocus, 100);
      setTimeout(triggerFocus, 300);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col antialiased selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* TOPBAR / HEADER THEO CHUẨN DESIGN SYSTEM SÁNG & MOBILE PWA (Hỗ trợ tai thỏ / notch) */}
      <header 
        className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2 sm:px-6 sm:py-3.5">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs shrink-0">
              <Boxes className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400" />
            </div>
            {/* Tên xưởng và phiên bản chuyển vào Drawer menu góc phải trên mobile, chỉ hiện trên màn hình máy tính tablet (md+) */}
            <div className="min-w-0 hidden md:block">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-black text-slate-900 tracking-tight truncate">
                  XƯỞNG LŨA NHỰT
                </h1>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate">
                Tra cứu vị trí mã sản phẩm tức thời · Tự động đọc tin nhắn từ {totalWarehouses} nhóm Zalo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* THỐNG KÊ NHANH MÃ & SỐ KHO */}
            <div className="hidden xs:flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1.5 border border-slate-200 text-xs font-semibold text-slate-700">
              <span><strong className="font-mono text-slate-900 font-bold">{activeItems.length}</strong> mã</span>
              <span className="text-slate-300">|</span>
              <span><strong className="text-emerald-700 font-bold">{occupiedWarehouses}</strong>/{totalWarehouses} kho</span>
            </div>

            {/* ICON TRẠNG THÁI SUPABASE CLOUD (TRÒN, CHỈ BIỂU TƯỢNG) */}
            <div
              role="status"
              aria-label={dbStatus?.connected ? "Supabase đã kết nối" : "Supabase mất kết nối"}
              className={`relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border transition shadow-2xs ${
                dbStatus?.connected
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                  : dbStatus
                  ? "bg-rose-50 border-rose-200 text-rose-600"
                  : "bg-slate-100 border-slate-200 text-slate-400"
              }`}
              title={
                dbStatus?.connected
                  ? `Supabase Cloud: ĐÃ KẾT NỐI THÀNH CÔNG\nĐộ trễ: ${dbStatus.latencyMs ?? 0}ms\nTổng sản phẩm trong DB: ${dbStatus.itemCount ?? activeItems.length}`
                  : dbStatus
                  ? "Supabase Cloud: MẤT KẾT NỐI"
                  : "Đang kiểm tra kết nối Supabase Cloud..."
              }
            >
              <Database className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                  dbStatus?.connected
                    ? "bg-emerald-500 animate-pulse"
                    : dbStatus
                    ? "bg-rose-500"
                    : "bg-slate-300"
                }`}
              />
            </div>

            {/* ICON TRẠNG THÁI BOT ZALO TRÊN MÁY TÍNH (TRÒN, CHỈ BIỂU TƯỢNG) */}
            <div
              role="status"
              aria-label={botStatus?.online ? "Bot Zalo đang chạy" : "Bot Zalo đang tắt"}
              className={`relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border transition shadow-2xs ${
                botStatus?.online
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                  : botStatus
                  ? "bg-amber-50 border-amber-200 text-amber-600"
                  : "bg-slate-100 border-slate-200 text-slate-400"
              }`}
              title={
                botStatus?.online
                  ? `Bot Zalo trên máy tính: ĐANG CHẠY\n(Phát tín hiệu lúc ${
                      botStatus.lastPing ? new Date(botStatus.lastPing).toLocaleTimeString("vi-VN") : "mới đây"
                    })`
                  : "Bot Zalo trên máy tính: ĐANG TẮT\n(Khi bật bot lên, máy sẽ tự động đồng bộ lại các tin nhắn cũ)"
              }
            >
              <Bot className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                  botStatus?.online
                    ? "bg-emerald-500 animate-pulse"
                    : botStatus
                    ? "bg-amber-500"
                    : "bg-slate-300"
                }`}
              />
            </div>

            {/* CHUÔNG THÔNG BÁO NHẬT KÝ ZALO (PHÂN CHIA ĐÃ ĐỌC / CHƯA ĐỌC) */}
            <NotificationBell
              messages={messages}
              onOpenWarehouse={setOpenWarehouse}
              onMarkAllRead={markAllReadHandler}
              onMarkRead={markReadHandler}
              externalIsOpen={isNotificationOpen}
              onOpenChange={setIsNotificationOpen}
            />

            {/* LÀM MỚI DỮ LIỆU */}
            <button
              onClick={fetchData}
              title="Làm mới dữ liệu"
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition active:scale-95 shadow-2xs cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

          </div>
        </div>
      </header>

      {/* NỘI DUNG CHÍNH (Thêm pb-28 để chừa khoảng trống cho Bottom Tab Bar nổi) */}
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 pt-4 sm:pt-6 pb-28 sm:pb-32 sm:px-6">
        
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {/* TAB 1: TRA CỨU VỊ TRÍ SẢN PHẨM TRONG KHO */}
        {activeTab === "search" && (
          <section id="search-section" className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackageSearch className="h-5 w-5 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Tra Cứu Vị Trí Sản Phẩm Trong Kho
                </h2>
              </div>
              <span className="text-xs text-slate-400 hidden xs:inline">1 Mã = Duy nhất 1 Vị trí</span>
            </div>

            <SearchBar 
              value={query} 
              onChange={setQuery} 
              inputRef={searchInputRef}
              autoFocus={true}
              availableSkus={items.map((i) => i.sku)}
            />

            {/* MÀN HÌNH CHỜ TRA CỨU PHONG CÁCH GITHUB IOS (KHI CHƯA NHẬP MÃ) */}
            {!query.trim() && (
              <div className="py-12 sm:py-16 flex flex-col items-center justify-center text-center space-y-3 px-4">
                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-1 border border-slate-200/80 shadow-inner">
                  <PackageSearch className="h-8 w-8 sm:h-10 sm:w-10 text-slate-400 stroke-[1.5]" />
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Tìm vị trí hàng trong kho.
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm leading-relaxed">
                  Nhập mã SKU trên tem sản phẩm (ví dụ: <span className="font-mono font-bold text-slate-700">E120.124</span>, <span className="font-mono font-bold text-slate-700">K100</span>, <span className="font-mono font-bold text-slate-700">PT395</span>...) để định vị chính xác ô kho đang chứa hàng.
                </p>
              </div>
            )}

            {/* BANNER THÔNG BÁO KẾT QUẢ TÌM KIẾM */}
            {query.trim() && (
              matchingItems.length > 0 && activeFoundItem ? (
                <div className="space-y-3">
                  {/* THANH DANH SÁCH TẤT CẢ CÁC MÃ TÌM THẤY (KHI TÌM ĐƯỢC NHIỀU MÃ) */}
                  {matchingItems.length > 1 && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          Tìm thấy <strong className="font-mono text-sm text-emerald-800">{matchingItems.length}</strong> sản phẩm khớp với &quot;{query.trim().toUpperCase()}&quot;:
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">Nhấn vào mã để thao tác nhanh</span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {matchingItems.map((it) => {
                          const isCurrent = activeFoundItem.sku === it.sku;
                          const bInfo = getWarehouseBuildingInfo(it.warehouse, totalWarehouses);
                          return (
                            <button
                              key={it.sku}
                              type="button"
                              onClick={() => {
                                setSelectedSku(it.sku);
                                setIsSearchTransferring(false);
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition cursor-pointer shadow-2xs ${
                                isCurrent
                                  ? "bg-emerald-600 text-white ring-2 ring-emerald-400 scale-102"
                                  : "bg-white text-slate-800 border border-emerald-300/80 hover:bg-emerald-100/70"
                              }`}
                            >
                              <span>{it.sku}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                                  isCurrent
                                    ? "bg-emerald-800 text-emerald-100"
                                    : it.status === "sold"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {it.status === "sold" ? "Đã bán" : `Kho ${pad(it.warehouse)} (${bInfo.buildingName})`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* THẺ CHI TIẾT CỦA MÃ ĐANG CHỌN (ĐẦY ĐỦ CÁC NÚT ĐÃ BÁN, CHUYỂN KHO, MỞ KHO) */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 rounded-2xl border-2 border-emerald-500 bg-emerald-50/90 p-4 sm:p-5 shadow-sm">
                    {/* THÔNG TIN VỊ TRÍ TÌM THẤY */}
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs shrink-0 mt-0.5 sm:mt-0">
                        <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                          <span className="text-[11px] sm:text-xs font-bold text-emerald-800 uppercase tracking-wide">
                            ĐÃ TÌM THẤY:
                          </span>
                          <span className="font-mono text-xl sm:text-2xl font-black text-slate-900 tracking-wider">
                            {activeFoundItem.sku}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            (Nhập lúc {fmt(activeFoundItem.updatedAt)})
                          </span>
                        </div>

                        <div className="text-xs sm:text-sm text-slate-700 font-medium mt-1">
                          {activeFoundItem.status === "sold" ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 font-extrabold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300 text-[11px]">
                                ĐÃ BÁN (Ẩn khỏi kho)
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Kho lưu trước đó: <strong>Kho {pad(activeFoundItem.warehouse)}</strong> ({getWarehouseBuildingInfo(activeFoundItem.warehouse, totalWarehouses).buildingName})
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-slate-600">Đang nằm cố định tại:</span>
                              <span className="inline-flex items-center gap-1 font-black text-emerald-800 bg-emerald-200/80 px-2.5 py-0.5 rounded-lg border border-emerald-400 text-sm">
                                KHO {pad(activeFoundItem.warehouse)}
                              </span>
                              <span className="inline-flex items-center gap-1 font-extrabold text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-lg border border-indigo-300 text-xs shadow-2xs">
                                🏢 {getWarehouseBuildingInfo(activeFoundItem.warehouse, totalWarehouses).buildingName}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* CỤM NÚT THAO TÁC CÙNG HÀNG, ĐỀU NHAU, KHÔNG LỆCH */}
                    <div className="flex items-center gap-1.5 sm:gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-emerald-200/60 shrink-0 flex-wrap">
                      {activeFoundItem.status === "sold" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmConfig({
                              isOpen: true,
                              variant: "success",
                              title: "Xác Nhận Nhập Lại Kho",
                              sku: activeFoundItem.sku,
                              message: `Khách trả hàng hoặc bạn muốn nhập lại mã này vào Kho ${pad(activeFoundItem.warehouse)}?`,
                              subMessage: `Sản phẩm sẽ được phục hồi trạng thái còn hàng tại Kho ${pad(activeFoundItem.warehouse)}.`,
                              confirmLabel: `Nhập vào Kho ${pad(activeFoundItem.warehouse)}`,
                              cancelLabel: "Hủy bỏ",
                              onConfirm: async () => {
                                await restockSku(activeFoundItem.sku, activeFoundItem.warehouse);
                                setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
                              },
                            });
                          }}
                          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-50 transition active:scale-95 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Nhập lại</span>
                        </button>
                      ) : (
                        <>
                          {/* NÚT ĐÁNH DẤU ĐÃ BÁN */}
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmConfig({
                                isOpen: true,
                                variant: "sold",
                                title: "Xác Nhận Bán Hàng",
                                sku: activeFoundItem.sku,
                                message: `Bạn có chắc chắn muốn đánh dấu mã [${activeFoundItem.sku}] là ĐÃ BÁN?`,
                                subMessage: "Sản phẩm sẽ ẩn khỏi kho để tránh xuất trùng, toàn bộ dữ liệu và lịch sử vẫn được lưu trữ vĩnh viễn.",
                                confirmLabel: "Xác nhận đã bán",
                                cancelLabel: "Hủy bỏ",
                                onConfirm: async () => {
                                  await markSoldSku(activeFoundItem.sku, "Đã bán từ tra cứu nhanh");
                                  setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
                                },
                              });
                            }}
                            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-xl border border-amber-300 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 text-xs font-bold shadow-2xs transition active:scale-95 cursor-pointer"
                            title="Đánh dấu đã bán"
                          >
                            <ShoppingBag className="h-3.5 w-3.5" />
                            <span>Đã bán</span>
                          </button>

                          {/* NÚT CHUYỂN KHO */}
                          <button
                            type="button"
                            onClick={() => {
                              setIsSearchTransferring(!isSearchTransferring);
                              setSearchTargetWarehouse(activeFoundItem.warehouse === 1 ? 2 : 1);
                            }}
                            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold shadow-2xs transition active:scale-95 cursor-pointer ${
                              isSearchTransferring
                                ? "border-indigo-500 bg-indigo-600 text-white"
                                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                            }`}
                            title="Chuyển mã này sang ô kho khác"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                            <span>{isSearchTransferring ? "Đóng" : "Chuyển kho"}</span>
                          </button>
                        </>
                      )}

                      {/* NÚT MỞ KHO */}
                      <button
                        type="button"
                        onClick={() => setOpenWarehouse(activeFoundItem.warehouse)}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 transition active:scale-95 cursor-pointer"
                      >
                        <Warehouse className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Mở Kho {pad(activeFoundItem.warehouse)}</span>
                      </button>
                    </div>
                  </div>

                  {/* KHUNG CHỌN KHO ĐÍCH KHI BẤM CHUYỂN KHO TRỰC TIẾP TỪ TRA CỨU */}
                  {isSearchTransferring && activeFoundItem.status !== "sold" && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-3 flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-150">
                      <div className="flex items-center gap-2 text-xs font-semibold text-indigo-950">
                        <span>Chuyển mã [{activeFoundItem.sku}] từ Kho {pad(activeFoundItem.warehouse)} sang:</span>
                        <select
                          value={searchTargetWarehouse}
                          onChange={(e) => setSearchTargetWarehouse(Number(e.target.value))}
                          className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {Array.from({ length: totalWarehouses }, (_, i) => i + 1)
                            .filter((wh) => wh !== activeFoundItem.warehouse)
                            .map((wh) => (
                              <option key={wh} value={wh}>
                                Kho {pad(wh)}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsSearchTransferring(false)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          Huỷ
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await transferSku(activeFoundItem.sku, searchTargetWarehouse);
                            setIsSearchTransferring(false);
                          }}
                          className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700 transition cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Xác nhận chuyển sang Kho {pad(searchTargetWarehouse)}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* BẢN ĐỒ KHO HIỂN THỊ TRỰC TIẾP VỊ TRÍ TOÀ VÀ KHO TÌM THẤY */}
                  <div className="mt-4 pt-4 border-t border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <Warehouse className="h-4 w-4 text-emerald-600" />
                        Vị trí trực tiếp trên bản đồ kho &amp; toà nhà:
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700">
                        Kho {pad(activeFoundItem.warehouse)} đang được khoanh vùng nổi bật
                      </span>
                    </div>

                    <WarehouseMapCanvas
                      items={items}
                      highlight={activeFoundItem.warehouse}
                      highlightWarehouses={matchingItems.map((m) => m.warehouse)}
                      query={query}
                      totalWarehouses={totalWarehouses}
                      onSelect={setOpenWarehouse}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-center text-sm font-semibold text-rose-700">
                  KHÔNG TÌM THẤY MÃ SẢN PHẨM &quot;<span className="font-mono">{query.trim().toUpperCase()}</span>&quot; TRONG HỆ THỐNG {totalWarehouses} KHO
                </div>
              )
            )}
          </section>
        )}

        {/* TAB 2: SƠ ĐỒ LƯỚI CÁC Ô KHO TRỰC QUAN */}
        {activeTab === "warehouse" && (
          <section id="warehouse-section" className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Warehouse className="h-5 w-5 text-slate-700" />
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Sơ Đồ {totalWarehouses} Ô Kho Vận Hành
                </h2>
                <span className="text-xs text-slate-400">(Nhấp vào ô kho để xem danh sách mã bên trong)</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-md bg-slate-100 border border-slate-300"></span> Trống
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-md bg-emerald-50 border border-emerald-300"></span> Có hàng
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-md bg-emerald-500 ring-2 ring-emerald-300"></span> Đang chọn
                  </span>
                </div>

                <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setWarehouseView("grid")}
                    className={`rounded-md px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      warehouseView === "grid"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Lưới
                  </button>
                  <button
                    type="button"
                    onClick={() => setWarehouseView("map")}
                    className={`rounded-md px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      warehouseView === "map"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Bản đồ
                  </button>
                </div>
              </div>
            </div>

            {warehouseView === "grid" ? (
              <WarehouseGrid
                items={items}
                highlight={activeFoundItem ? activeFoundItem.warehouse : null}
                highlightWarehouses={matchingItems.map((m) => m.warehouse)}
                query={query}
                totalWarehouses={totalWarehouses}
                onSelect={setOpenWarehouse}
              />
            ) : (
              <WarehouseMapCanvas
                items={items}
                highlight={activeFoundItem ? activeFoundItem.warehouse : null}
                highlightWarehouses={matchingItems.map((m) => m.warehouse)}
                query={query}
                totalWarehouses={totalWarehouses}
                onSelect={setOpenWarehouse}
              />
            )}
          </section>
        )}

        {/* TAB 3: QUẢN LÝ KHO THEO SIZE (THỐNG KÊ & BUNG DANH SÁCH MÃ) */}
        {activeTab === "size" && (
          <section
            id="size-section"
            className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs animate-in fade-in duration-200"
          >
            <SizeInventoryManager
              items={items}
              totalWarehouses={totalWarehouses}
              onOpenWarehouse={setOpenWarehouse}
            />
          </section>
        )}

        {/* TAB 4: NHẬT KÝ & THÔNG BÁO KHO (HIỂN THỊ MÀN HÌNH RIÊNG) */}
        {activeTab === "zalo" && (
          <section
            id="notification-section"
            className="animate-in fade-in duration-200"
          >
            <NotificationBell
              messages={messages}
              onOpenWarehouse={setOpenWarehouse}
              onMarkAllRead={markAllReadHandler}
              onMarkRead={markReadHandler}
              embedded={true}
            />
          </section>
        )}

        {/* TAB 5: MENU QUẢN LÝ & TIỆN ÍCH (EMBEDDED RIGHT MENU) */}
        {activeTab === "menu" && (
          <section
            id="menu-section"
            className="animate-in fade-in duration-200"
          >
            <RightMenuDrawer
              embedded={true}
              isOpen={true}
              onClose={() => setActiveTab("search")}
              totalWarehouses={totalWarehouses}
              items={items}
              history={history}
              messages={messages}
              botStatus={botStatus}
              dbStatus={dbStatus}
              onAddWarehouse={addWarehouseHandler}
              onOpenPaste={() => setIsPasteOpen(true)}
              onOpenWarehouse={setOpenWarehouse}
              onSendWebhook={onWebhook}
              onFilterSkuType={(prefix) => {
                setQuery(prefix);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </section>
        )}

      </main>

      {/* FOOTER */}
      <footer
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500"
      >
        Xưởng Lũa Nhựt · Hệ Thống Quản Lý Kho Độc Bản · Nền Tảng PWA Tối Ưu Mobile
      </footer>

      {/* MODAL CHI TIẾT Ô KHO */}
      {openWarehouse !== null && (
        <WarehouseDetailModal
          warehouse={openWarehouse}
          items={items}
          history={history}
          totalWarehouses={totalWarehouses}
          onClose={() => setOpenWarehouse(null)}
          onRemove={removeSku}
          onTransfer={transferSku}
          onBulkTransfer={bulkTransferSkus}
          onBulkMarkSold={bulkMarkSoldSkus}
          onMarkSold={markSoldSku}
          onRestock={restockSku}
          onOpenPaste={(wh) => {
            setDefaultPasteWarehouse(wh);
            setIsPasteOpen(true);
          }}
        />
      )}

      {/* MODAL DÁN ĐOẠN CHAT ZALO ĐỂ BÓC TÁCH MÃ */}
      <PasteImportModal
        isOpen={isPasteOpen}
        defaultWarehouse={defaultPasteWarehouse}
        existingItems={items}
        totalWarehouses={totalWarehouses}
        onClose={() => setIsPasteOpen(false)}
        onSuccess={() => {
          fetchData();
        }}
      />

      {/* MENU BÊN PHẢI (RIGHT DRAWER): QUẢN LÝ THÊM KHO, XUẤT CSV, THỐNG KÊ, TÍNH NĂNG ĐANG PHÁT TRIỂN */}
      {isMenuOpen && (
        <RightMenuDrawer
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          totalWarehouses={totalWarehouses}
          items={items}
          history={history}
          messages={messages}
          botStatus={botStatus}
          dbStatus={dbStatus}
          onAddWarehouse={addWarehouseHandler}
          onOpenPaste={() => setIsPasteOpen(true)}
          onOpenWarehouse={setOpenWarehouse}
          onSendWebhook={onWebhook}
          onFilterSkuType={(prefix) => {
            setQuery(prefix);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {/* THANH ĐIỀU HƯỚNG NỔI PHONG CÁCH GITHUB IOS (FLOATING BOTTOM TAB BAR) */}
      <BottomTabBar
        activeTab={activeTab}
        unreadCount={unreadMessageCount}
        onTabSelect={handleTabSelect}
      />

      {/* HỘP THOẠI XÁC NHẬN CHUẨN IOS PWA (THAY THẾ WINDOW.CONFIRM MẶC ĐỊNH) */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        variant={confirmConfig.variant}
        title={confirmConfig.title}
        sku={confirmConfig.sku}
        message={confirmConfig.message}
        subMessage={confirmConfig.subMessage}
        confirmLabel={confirmConfig.confirmLabel}
        cancelLabel={confirmConfig.cancelLabel}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
