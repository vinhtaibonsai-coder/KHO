"use client";

import { useEffect, useMemo, useState } from "react";
import { 
  Boxes, 
  MapPin, 
  PackageSearch, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Warehouse,
  History,
  Menu,
  Sparkles,
  ShoppingBag,
  ArrowRightLeft,
  RotateCcw,
  Check
} from "lucide-react";
import SearchBar from "@/components/SearchBar";
import WarehouseDetailModal from "@/components/WarehouseDetailModal";
import WarehouseGrid from "@/components/WarehouseGrid";
import ZaloSimulator from "@/components/ZaloSimulator";
import ZaloLiveFeed from "@/components/ZaloLiveFeed";
import PasteImportModal from "@/components/PasteImportModal";
import NotificationBell from "@/components/NotificationBell";
import RightMenuDrawer from "@/components/RightMenuDrawer";
import { ClipboardPaste } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import type { Item, ItemsResponse, ZaloMessage, ItemHistory } from "@/types";

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
  const [query, setQuery] = useState("");
  const [openWarehouse, setOpenWarehouse] = useState<number | null>(null);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [defaultPasteWarehouse, setDefaultPasteWarehouse] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSearchTransferring, setIsSearchTransferring] = useState(false);
  const [searchTargetWarehouse, setSearchTargetWarehouse] = useState(1);

  const fetchData = () => {
    fetch("/api/items", { cache: "no-store" })
      .then((r) => r.json() as Promise<ItemsResponse>)
      .then((data) => {
        setItems(data.items || []);
        setMessages(data.messages || []);
        setHistory(data.history || []);
        if (data.botStatus) {
          setBotStatus(data.botStatus);
        }
        if (data.totalWarehouses && data.totalWarehouses >= 30) {
          setTotalWarehouses(data.totalWarehouses);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Không thể đồng bộ dữ liệu kho");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
    // Tự động kiểm tra trạng thái bot mỗi 15 giây
    const botInterval = setInterval(() => {
      fetch("/api/items", { cache: "no-store" })
        .then((r) => r.json() as Promise<ItemsResponse>)
        .then((data) => {
          if (data.botStatus) setBotStatus(data.botStatus);
        })
        .catch(() => {});
    }, 15000);

    return () => clearInterval(botInterval);
  }, []);

  // Lắng nghe Realtime của Supabase: có mã mới là giao diện tự nhảy số
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    const channel = sb
      .channel("kho-30-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "warehouse_items" }, () => {
        fetchData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "warehouse_history" }, () => {
        fetchData();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zalo_messages" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Record<string, unknown>;
            const msg: ZaloMessage = {
              id: String(row.id),
              groupId: String(row.group_id),
              warehouse: (row.warehouse as number | null) ?? null,
              message: String(row.message),
              status: (row.status as "ok" | "error") ?? "ok",
              detail: String(row.detail ?? ""),
              createdAt: String(row.created_at),
              read: Boolean(row.read),
            };
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev].slice(0, 50)
            );
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Record<string, unknown>;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === String(row.id) ? { ...m, read: Boolean(row.read) } : m
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
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

  async function removeSku(sku: string) {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", sku, note: "Xuất kho từ modal chi tiết" }),
    });
    if (res.ok) {
      setItems((list) => list.filter((i) => i.sku !== sku));
      fetchData();
    }
  }

  async function markSoldSku(sku: string, note: string = "Đã bán") {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_sold", sku, note }),
    });
    if (res.ok) {
      fetchData();
    } else {
      const data = await res.json();
      alert(data.error || "Không thể đánh dấu đã bán");
    }
  }

  async function restockSku(sku: string, warehouse?: number, note: string = "Khách trả / Nhập lại kho") {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restock", sku, warehouse, note }),
    });
    if (res.ok) {
      fetchData();
    } else {
      const data = await res.json();
      alert(data.error || "Không thể nhập lại kho");
    }
  }

  async function transferSku(sku: string, toWarehouse: number) {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "transfer", sku, toWarehouse }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      fetchData();
    } else {
      alert(data.error || "Không thể chuyển kho");
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
    const res = await fetch("/api/webhook/zalo", {
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col antialiased selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* TOPBAR / HEADER THEO CHUẨN DESIGN SYSTEM SÁNG & MOBILE PWA (Hỗ trợ tai thỏ / notch) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs pt-9 sm:pt-0">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2 sm:px-6 sm:py-3.5">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs shrink-0">
              <Boxes className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-base md:text-lg font-black text-slate-900 tracking-tight truncate">
                XƯỞNG LŨA NHỰT
              </h1>
              <p className="text-[11px] text-slate-500 font-medium hidden md:block">
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

            {/* NÚT DÁN ĐOẠN CHAT ZALO */}
            <button
              type="button"
              onClick={() => {
                setDefaultPasteWarehouse(1);
                setIsPasteOpen(true);
              }}
              className="flex items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition active:scale-95 cursor-pointer"
              title="Dán đoạn chat Zalo để bóc tách mã nạp vào kho"
            >
              <ClipboardPaste className="h-3.5 w-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Dán Chat</span>
              <span className="sm:hidden">Dán</span>
            </button>

            {/* HIỂN THỊ TRẠNG THÁI BOT ZALO TRÊN MÁY TÍNH */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border transition ${
                botStatus?.online
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs"
                  : "bg-slate-100 text-slate-500 border-slate-200"
              }`}
              title={
                botStatus?.online
                  ? `Bot Zalo trên máy tính: ĐANG CHẠY\n(Phát tín hiệu lúc ${
                      botStatus.lastPing ? new Date(botStatus.lastPing).toLocaleTimeString("vi-VN") : "mới đây"
                    })`
                  : "Bot Zalo trên máy tính: ĐANG TẮT\n(Khi bật bot lên, máy sẽ tự động đồng bộ lại các tin nhắn cũ)"
              }
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  botStatus?.online ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                }`}
              />
              <span className="hidden md:inline font-mono">
                {botStatus?.online ? "Bot Zalo Online" : "Bot Zalo Offline"}
              </span>
              <span className="md:hidden font-mono">
                {botStatus?.online ? "Bot Bật" : "Bot Tắt"}
              </span>
            </div>

            {/* CHUÔNG THÔNG BÁO NHẬT KÝ ZALO (PHÂN CHIA ĐÃ ĐỌC / CHƯA ĐỌC) */}
            <NotificationBell
              messages={messages}
              onOpenWarehouse={setOpenWarehouse}
              onMarkAllRead={markAllReadHandler}
              onMarkRead={markReadHandler}
            />

            {/* LÀM MỚI DỮ LIỆU */}
            <button
              onClick={fetchData}
              title="Làm mới dữ liệu"
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition active:scale-95 shadow-2xs cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>

            {/* NÚT MENU BÊN PHẢI (RIGHT DRAWER) */}
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-900 bg-slate-900 text-white hover:bg-slate-800 transition active:scale-95 shadow-2xs cursor-pointer"
              title="Mở menu quản lý & tiện ích bên phải"
            >
              <Menu className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* NỘI DUNG CHÍNH */}
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {/* SECTION 1: THANH TÌM KIẾM TRA CỨU ĐỈNH CAO */}
        <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackageSearch className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Tra Cứu Nhanh Vị Trí Sản Phẩm
              </h2>
            </div>
            <span className="text-xs text-slate-400">1 Mã = Duy nhất 1 Vị trí</span>
          </div>

          <SearchBar value={query} onChange={setQuery} />

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
                              {it.status === "sold" ? "Đã bán" : `Kho ${pad(it.warehouse)}`}
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
                              Kho lưu trước đó: <strong>Kho {pad(activeFoundItem.warehouse)}</strong>
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-600">Đang nằm cố định tại:</span>
                            <span className="inline-flex items-center gap-1 font-black text-emerald-800 bg-emerald-200/80 px-2.5 py-0.5 rounded-lg border border-emerald-400 text-sm">
                              KHO {pad(activeFoundItem.warehouse)}
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
                        onClick={async () => {
                          const confirmRestock = window.confirm(`Khách trả hàng hoặc muốn nhập lại mã [${activeFoundItem.sku}] vào Kho ${pad(activeFoundItem.warehouse)}?`);
                          if (!confirmRestock) return;
                          await restockSku(activeFoundItem.sku, activeFoundItem.warehouse);
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
                          onClick={async () => {
                            const confirmSold = window.confirm(
                              `XÁC NHẬN BÁN:\nBạn có chắc chắn muốn đánh dấu mã [${activeFoundItem.sku}] là ĐÃ BÁN?\n(Sản phẩm sẽ ẩn khỏi kho nhưng dữ liệu và lịch sử vẫn được lưu vĩnh viễn)`
                            );
                            if (!confirmSold) return;
                            await markSoldSku(activeFoundItem.sku, "Đã bán từ tra cứu nhanh");
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
              </div>
            ) : (
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-center text-sm font-semibold text-rose-700">
                KHÔNG TÌM THẤY MÃ SẢN PHẨM &quot;<span className="font-mono">{query.trim().toUpperCase()}</span>&quot; TRONG HỆ THỐNG {totalWarehouses} KHO
              </div>
            )
          )}
        </section>

        {/* SECTION 2: SƠ ĐỒ LƯỚI CÁC Ô KHO TRỰC QUAN */}
        <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-slate-700" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Sơ Đồ {totalWarehouses} Ô Kho Vận Hành
              </h2>
              <span className="text-xs text-slate-400">(Nhấp vào ô kho để xem danh sách mã bên trong)</span>
            </div>

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
          </div>

          <WarehouseGrid
            items={items}
            highlight={activeFoundItem ? activeFoundItem.warehouse : null}
            highlightWarehouses={matchingItems.map((m) => m.warehouse)}
            query={query}
            totalWarehouses={totalWarehouses}
            onSelect={setOpenWarehouse}
          />
        </section>

      </main>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
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
      <RightMenuDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        totalWarehouses={totalWarehouses}
        items={items}
        history={history}
        messages={messages}
        botStatus={botStatus}
        onAddWarehouse={addWarehouseHandler}
        onOpenPaste={() => setIsPasteOpen(true)}
        onOpenWarehouse={setOpenWarehouse}
        onSendWebhook={onWebhook}
      />
    </div>
  );
}

