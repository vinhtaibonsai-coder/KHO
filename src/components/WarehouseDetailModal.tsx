"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { 
  ArrowDownUp, 
  ArrowRightLeft, 
  History, 
  PackageOpen, 
  Trash2, 
  X, 
  Warehouse as WarehouseIcon, 
  Check, 
  ShoppingBag, 
  RotateCcw,
  ChevronLeft,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  SlidersHorizontal
} from "lucide-react";
import ConfirmModal, { type ConfirmVariant } from "@/components/ConfirmModal";
import type { Item, ItemHistory } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return { time, date };
};

export default function WarehouseDetailModal({
  warehouse,
  items,
  history = [],
  totalWarehouses = 30,
  onClose,
  onRemove,
  onTransfer,
  onMarkSold,
  onRestock,
  onOpenPaste,
}: {
  warehouse: number;
  items: Item[];
  history?: ItemHistory[];
  totalWarehouses?: number;
  onClose: () => void;
  onRemove: (sku: string) => void;
  onTransfer: (sku: string, toWarehouse: number) => Promise<boolean | void>;
  onMarkSold?: (sku: string, note?: string) => Promise<void>;
  onRestock?: (sku: string, warehouse?: number, note?: string) => Promise<void>;
  onOpenPaste?: (warehouse: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<"items" | "sold" | "history">("items");
  const [selectedSizePrefix, setSelectedSizePrefix] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"num_desc" | "num_asc" | "newest" | "oldest">("num_desc");
  
  // Sản phẩm đang được chọn xem chi tiết & lịch sử chuyển/xuất
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  // State phục vụ việc chọn kho chuyển
  const [transferringSku, setTransferringSku] = useState<string | null>(null);
  const [targetWarehouse, setTargetWarehouse] = useState<number>(warehouse === 1 ? 2 : 1);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // Hàm bóc tách tiền tố size và số thứ tự trong mã SKU (ví dụ: E120.124 -> prefix: "E", num: 120.124; K100 -> prefix: "K", num: 100)
  const parseSku = (sku: string) => {
    const clean = sku.trim().toUpperCase();
    const match = clean.match(/^([A-Z]+)\s*(\d+(?:\.\d+)?)/);
    if (match) {
      return {
        prefix: match[1],
        num: parseFloat(match[2]),
        rawNum: match[2]
      };
    }
    // Trường hợp mã số thuần
    const numOnly = clean.match(/(\d+(?:\.\d+)?)/);
    return {
      prefix: "Khác",
      num: numOnly ? parseFloat(numOnly[1]) : -1,
      rawNum: numOnly ? numOnly[1] : ""
    };
  };

  // Khóa cứng cuộn trang nền ngoài chuẩn Mobile PWA (iOS Safari & Android Chrome)
  useEffect(() => {
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
  }, []);

  // Danh sách item thô của kho này
  const rawWarehouseActive = useMemo(() => {
    return items.filter((i) => i.warehouse === warehouse && i.status !== "sold");
  }, [items, warehouse]);

  // Thống kê các nhóm size có trong kho này
  const availableSizes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of rawWarehouseActive) {
      const { prefix } = parseSku(it.sku);
      counts[prefix] = (counts[prefix] || 0) + 1;
    }
    return counts;
  }, [rawWarehouseActive]);

  // Danh sách item đang CÒN TRONG KHO (Đã lọc theo Size & Sắp xếp từ Lớn đến Nhỏ)
  const activeList = useMemo(() => {
    let list = rawWarehouseActive;
    if (selectedSizePrefix !== "all") {
      list = list.filter((i) => parseSku(i.sku).prefix === selectedSizePrefix);
    }
    return list.slice().sort((a, b) => {
      if (sortOrder === "num_desc") {
        // Sắp xếp số thứ tự từ LỚN ĐẾN NHỎ (theo yêu cầu kiểm kho)
        const parsedA = parseSku(a.sku);
        const parsedB = parseSku(b.sku);
        if (parsedA.prefix !== parsedB.prefix && selectedSizePrefix === "all") {
          return parsedA.prefix.localeCompare(parsedB.prefix);
        }
        return parsedB.num - parsedA.num;
      }
      if (sortOrder === "num_asc") {
        // Sắp xếp số thứ tự từ NHỎ ĐẾN LỚN
        const parsedA = parseSku(a.sku);
        const parsedB = parseSku(b.sku);
        if (parsedA.prefix !== parsedB.prefix && selectedSizePrefix === "all") {
          return parsedA.prefix.localeCompare(parsedB.prefix);
        }
        return parsedA.num - parsedB.num;
      }
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    });
  }, [rawWarehouseActive, selectedSizePrefix, sortOrder]);

  // Danh sách item ĐÃ BÁN của ô kho này (để tra cứu hoặc khách trả hàng nhập lại)
  const soldList = useMemo(() => {
    const raw = items.filter((i) => i.warehouse === warehouse && i.status === "sold");
    return raw.sort((a, b) => {
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return timeB - timeA;
    });
  }, [items, warehouse]);

  // Thông tin sản phẩm đang được chọn
  const selectedItem = useMemo(() => {
    return selectedSku ? items.find((i) => i.sku === selectedSku) : null;
  }, [items, selectedSku]);

  // Lịch sử điều chuyển / xuất kho / bán / nhập lại riêng của sản phẩm được chọn
  const selectedItemHistory = useMemo(() => {
    if (!selectedSku) return [];
    return history.filter((h) => h.sku === selectedSku);
  }, [history, selectedSku]);

  // Lịch sử liên quan đến kho này
  const warehouseHistory = useMemo(() => {
    return history.filter(
      (h) => h.fromWarehouse === warehouse || h.toWarehouse === warehouse
    );
  }, [history, warehouse]);

  async function handleConfirmTransfer() {
    if (!transferringSku) return;
    setTransferSubmitting(true);
    try {
      await onTransfer(transferringSku, targetWarehouse);
      setTransferringSku(null);
    } finally {
      setTransferSubmitting(false);
    }
  }

  const [actionNotice, setActionNotice] = useState<{ message: string; type: "success" | "info" } | null>(null);

  // State hộp thoại xác nhận chuẩn iOS
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

  const showNotice = (message: string, type: "success" | "info" = "success") => {
    setActionNotice({ message, type });
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleRemoveItem = (sku: string) => {
    setConfirmConfig({
      isOpen: true,
      variant: "danger",
      title: "Cảnh Báo Xuất / Xoá Mã",
      sku,
      message: `Bạn có chắc chắn muốn XUẤT / XOÁ mã này khỏi Kho ${pad(warehouse)} không?`,
      subMessage: `Mã sẽ bị xoá khỏi danh sách ô kho hiện tại. Nếu sản phẩm đã bán cho khách, bạn nên dùng nút "Đã Bán" để lưu lịch sử chi tiết.`,
      confirmLabel: "Xác nhận xuất mã",
      cancelLabel: "Giữ lại",
      onConfirm: () => {
        onRemove(sku);
        showNotice(`Đã xuất mã [${sku}] khỏi kho thành công!`, "info");
        if (selectedSku === sku) {
          setSelectedSku(null);
        }
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleMarkSoldItem = async (sku: string) => {
    if (!onMarkSold) return;
    setConfirmConfig({
      isOpen: true,
      variant: "sold",
      title: "Xác Nhận Đã Bán",
      sku,
      message: `Bạn có chắc chắn muốn đánh dấu mã [${sku}] là ĐÃ BÁN?`,
      subMessage: `Sản phẩm sẽ ẩn khỏi kho để tránh bán trùng, toàn bộ dữ liệu lịch sử và thông báo vẫn được lưu trữ vĩnh viễn.`,
      confirmLabel: "Xác nhận đã bán",
      cancelLabel: "Hủy bỏ",
      onConfirm: async () => {
        await onMarkSold(sku, "Đã bán cho khách");
        showNotice(`🎉 Đã đánh dấu BÁN THÀNH CÔNG mã [${sku}]! (Đã lưu lịch sử & thông báo)`, "success");
        if (selectedSku === sku) {
          setSelectedSku(null);
        }
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleRestockItem = async (sku: string) => {
    if (!onRestock) return;
    setConfirmConfig({
      isOpen: true,
      variant: "success",
      title: "Xác Nhận Nhập Lại Kho",
      sku,
      message: `Khách trả hàng hoặc muốn nhập lại mã này vào Kho ${pad(warehouse)}?`,
      subMessage: `Sản phẩm sẽ được phục hồi trạng thái còn hàng trong Kho ${pad(warehouse)}.`,
      confirmLabel: `Nhập vào Kho ${pad(warehouse)}`,
      cancelLabel: "Hủy bỏ",
      onConfirm: async () => {
        await onRestock(sku, warehouse, "Khách trả hàng / Nhập lại kho");
        showNotice(`Đã nhập lại mã [${sku}] vào Kho ${pad(warehouse)} thành công!`, "success");
        if (selectedSku === sku) {
          setSelectedSku(null);
        }
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200 touch-none overscroll-none"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] sm:max-h-[90vh] h-[88vh] sm:h-auto w-full max-w-2xl flex flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER MODAL - Tinh gọn, rõ ràng */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4 sm:px-6 py-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-slate-900 text-white font-extrabold text-base shadow-xs shrink-0">
              {pad(warehouse)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  Kho {pad(warehouse)}
                </h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {activeList.length} mã còn
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Xưởng Lũa Nhựt · Quản lý và điều phối sản phẩm
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* NÚT DÁN ĐOẠN CHAT VÀO KHO NÀY */}
            {onOpenPaste && (
              <button
                type="button"
                onClick={() => onOpenPaste(warehouse)}
                className="flex items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer shadow-2xs"
                title="Dán đoạn chat Zalo để nạp mã vào kho này"
              >
                <span>+ Dán chat</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition active:scale-95 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION: HÀNG CÒN KHO / ĐÃ BÁN / LỊCH SỬ KHO */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-6 py-2 gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab("items");
                setSelectedSku(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 ${
                activeTab === "items"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <WarehouseIcon className="h-3.5 w-3.5" />
              <span>Còn trong kho ({activeList.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("sold");
                setSelectedSku(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 ${
                activeTab === "sold"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Đã bán ({soldList.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("history");
                setSelectedSku(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 ${
                activeTab === "history"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Lịch sử ({warehouseHistory.length})</span>
            </button>
          </div>

          {activeTab === "items" && !selectedItem && (
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Nút chuyển đổi kiểu sắp xếp */}
              <button
                type="button"
                onClick={() => {
                  if (sortOrder === "num_desc") setSortOrder("num_asc");
                  else if (sortOrder === "num_asc") setSortOrder("newest");
                  else if (sortOrder === "newest") setSortOrder("num_desc");
                  else setSortOrder("num_desc");
                }}
                className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition cursor-pointer shadow-2xs ${
                  sortOrder.startsWith("num") 
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300" 
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
                title="Bấm để đổi cách sắp xếp"
              >
                {sortOrder === "num_desc" ? (
                  <>
                    <ArrowDownWideNarrow className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Số: Lớn → Nhỏ</span>
                  </>
                ) : sortOrder === "num_asc" ? (
                  <>
                    <ArrowUpNarrowWide className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Số: Nhỏ → Lớn</span>
                  </>
                ) : (
                  <>
                    <ArrowDownUp className="h-3.5 w-3.5 text-slate-500" />
                    <span>Mới nhập nhất</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* THANH LỌC NHANH THEO SIZE SẢN PHẨM TRONG KHO (GIÚP KIỂM KHO DỄ DÀNG) */}
        {activeTab === "items" && !selectedItem && rawWarehouseActive.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 sm:px-6 py-2 bg-slate-50/80 border-b border-slate-200 overflow-x-auto no-scrollbar shrink-0">
            <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1 shrink-0 mr-1">
              <SlidersHorizontal className="h-3 w-3 text-slate-400" />
              Lọc Size:
            </span>

            {/* Nút Tất cả */}
            <button
              type="button"
              onClick={() => setSelectedSizePrefix("all")}
              className={`rounded-full px-2.5 py-0.5 text-xs font-mono font-bold transition cursor-pointer shrink-0 border ${
                selectedSizePrefix === "all"
                  ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              Tất cả ({rawWarehouseActive.length})
            </button>

            {/* Các nhóm size thực tế có trong kho này */}
            {Object.entries(availableSizes).map(([prefix, count]) => {
              const isSelected = selectedSizePrefix === prefix;
              return (
                <button
                  key={prefix}
                  type="button"
                  onClick={() => setSelectedSizePrefix(prefix)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-mono font-bold transition cursor-pointer shrink-0 border flex items-center gap-1 ${
                    isSelected
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                      : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50"
                  }`}
                >
                  <span>Size {prefix}</span>
                  <span className={`text-[10px] px-1 py-0.2 rounded-full ${
                    isSelected ? "bg-emerald-800 text-emerald-100" : "bg-slate-100 text-slate-500 font-normal"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* BANNER THÔNG BÁO KẾT QUẢ THAO TÁC */}
        {actionNotice && (
          <div className={`px-4 py-2 text-xs font-bold flex items-center justify-between border-b animate-in fade-in duration-150 ${
            actionNotice.type === "success" 
              ? "bg-emerald-50 text-emerald-900 border-emerald-200" 
              : "bg-blue-50 text-blue-900 border-blue-200"
          }`}>
            <span>{actionNotice.message}</span>
            <button 
              type="button" 
              onClick={() => setActionNotice(null)} 
              className="text-slate-400 hover:text-slate-700 ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* NỘI DUNG CHÍNH - Cuộn độc lập mượt mà, chặn toàn bộ touch lan ra bên ngoài */}
        <div 
          className="flex-1 overflow-y-auto p-4 sm:p-5 pb-16 sm:pb-6 bg-slate-50/40 overscroll-contain touch-pan-y"
          style={{ WebkitOverflowScrolling: "touch" }}
          onTouchMove={(e) => e.stopPropagation()}
        >
          
          {/* TRƯỜNG HỢP 1: ĐANG XEM CHI TIẾT 1 SẢN PHẨM CỤ THỂ KHI BẤM VÀO */}
          {selectedItem ? (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* THANH ĐIỀU HƯỚNG QUAY LẠI */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSku(null);
                    setTransferringSku(null);
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-emerald-700 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs transition cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Quay lại danh sách</span>
                </button>

                <span className="text-xs text-slate-400 font-medium">
                  Hồ sơ chi tiết & Lịch sử mã
                </span>
              </div>

              {/* CARD THÔNG TIN SẢN PHẨM - TỐI GIẢN & RÕ RÀNG */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-2xl font-black text-slate-900 tracking-wider">
                        {selectedItem.sku}
                      </span>
                      {selectedItem.status === "sold" ? (
                        <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-800 border border-amber-300">
                          ĐÃ BÁN
                        </span>
                      ) : (
                        <span className="rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800 border border-emerald-300">
                          ĐANG TRONG KHO {pad(selectedItem.warehouse)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      Cập nhật: {fmtDate(selectedItem.updatedAt).time} - {fmtDate(selectedItem.updatedAt).date}
                      {selectedItem.soldAt && ` · Bán lúc: ${fmtDate(selectedItem.soldAt).time} ${fmtDate(selectedItem.soldAt).date}`}
                    </p>
                  </div>

                  {/* CÁC NÚT THAO TÁC RÕ RÀNG */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedItem.status === "sold" ? (
                      /* NẾU ĐÃ BÁN: CHO PHÉP NHẬP LẠI KHO KHI KHÁCH TRẢ */
                      <button
                        type="button"
                        onClick={() => handleRestockItem(selectedItem.sku)}
                        className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
                      >
                        <RotateCcw className="h-4 w-4 text-emerald-600" />
                        <span>Khách trả / Nhập lại kho</span>
                      </button>
                    ) : (
                      /* NẾU ĐANG CÒN TRONG KHO */
                      <>
                        <button
                          type="button"
                          onClick={() => handleMarkSoldItem(selectedItem.sku)}
                          className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition cursor-pointer"
                          title="Đánh dấu đã bán để ẩn khỏi kho nhưng vẫn lưu dữ liệu"
                        >
                          <ShoppingBag className="h-4 w-4 text-amber-600" />
                          <span>Đã bán</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setTransferringSku(transferringSku === selectedItem.sku ? null : selectedItem.sku);
                            setTargetWarehouse(warehouse === 1 ? 2 : 1);
                          }}
                          className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                            transferringSku === selectedItem.sku
                              ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          <ArrowRightLeft className="h-4 w-4 text-indigo-600" />
                          <span>{transferringSku === selectedItem.sku ? "Đóng" : "Chuyển kho"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(selectedItem.sku)}
                          className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Xuất</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* KHUNG CHỌN KHO ĐÍCH NẾU BẤM CHUYỂN KHO */}
                {transferringSku === selectedItem.sku && (
                  <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-950">
                      <span>Chuyển sang:</span>
                      <select
                        value={targetWarehouse}
                        onChange={(e) => setTargetWarehouse(Number(e.target.value))}
                        className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {Array.from({ length: totalWarehouses }, (_, i) => i + 1)
                          .filter((wh) => wh !== warehouse)
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
                        onClick={() => setTransferringSku(null)}
                        className="px-2 text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                      >
                        Huỷ
                      </button>
                      <button
                        type="button"
                        disabled={transferSubmitting}
                        onClick={handleConfirmTransfer}
                        className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700 transition disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>{transferSubmitting ? "Đang chuyển..." : `Xác nhận chuyển sang Kho ${pad(targetWarehouse)}`}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* LỊCH SỬ TOÀN DIỆN CỦA RIÊNG MÃ NÀY */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-indigo-600" />
                    Toàn bộ lịch sử mã [{selectedItem.sku}]
                  </h3>

                  {selectedItemHistory.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                      Chưa có lịch sử điều chuyển cho mã này.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedItemHistory.map((h, i) => {
                        const { time, date } = fmtDate(h.createdAt);
                        const isSold = h.action === "sold";
                        const isRestock = h.action === "restock";
                        const isOut = h.action === "out";

                        return (
                          <div
                            key={h.id || i}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-2xs text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                                  isSold
                                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                                    : isRestock
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                    : isOut
                                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                                    : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                                }`}
                              >
                                {isSold ? "ĐÃ BÁN" : isRestock ? "NHẬP LẠI KHO" : isOut ? "XUẤT KHO" : "CHUYỂN KHO"}
                              </span>
                              <div>
                                <p className="font-semibold text-slate-800">
                                  {isSold
                                    ? `Đã bán khỏi Kho ${pad(h.fromWarehouse || warehouse)}`
                                    : isRestock
                                    ? `Nhập lại vào Kho ${pad(h.toWarehouse || warehouse)}`
                                    : isOut
                                    ? `Xuất khỏi Kho ${pad(h.fromWarehouse || warehouse)}`
                                    : `Chuyển từ Kho ${pad(h.fromWarehouse || 0)} sang Kho ${pad(h.toWarehouse || 0)}`}
                                </p>
                                {h.note && (
                                  <p className="text-[11px] text-slate-500 mt-0.5">{h.note}</p>
                                )}
                              </div>
                            </div>

                            <div className="text-right text-[11px] text-slate-500">
                              <span className="font-bold text-slate-700 block">{time}</span>
                              <span className="text-slate-400">{date}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === "history" ? (
            /* TAB LỊCH SỬ KHO TỔNG HỢP */
            warehouseHistory.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <History className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">Chưa có lịch sử xuất/chuyển tại Kho {pad(warehouse)}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {warehouseHistory.map((h, i) => {
                  const { time, date } = fmtDate(h.createdAt);
                  const isSold = h.action === "sold";
                  const isRestock = h.action === "restock";
                  const isOut = h.action === "out";

                  return (
                    <div
                      key={h.id || i}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-2xs text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            isSold
                              ? "bg-amber-100 text-amber-800"
                              : isRestock
                              ? "bg-emerald-100 text-emerald-800"
                              : isOut
                              ? "bg-rose-100 text-rose-800"
                              : "bg-indigo-100 text-indigo-800"
                          }`}
                        >
                          {isSold ? "ĐÃ BÁN" : isRestock ? "NHẬP LẠI" : isOut ? "XUẤT" : "CHUYỂN"}
                        </span>
                        <div>
                          <p className="font-mono font-bold text-slate-900">{h.sku}</p>
                          <p className="text-[11px] text-slate-500">{h.note}</p>
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-700 block">{time}</span>
                        <span>{date}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : activeTab === "sold" ? (
            /* TAB SẢN PHẨM ĐÃ BÁN (ẨN KHỎI KHO NHƯNG DỮ LIỆU VẪN LƯU VĨNH VIỄN) */
            soldList.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <ShoppingBag className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">Chưa có sản phẩm nào được đánh dấu đã bán ở kho này</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 font-medium px-1">
                  💡 Danh sách các mã đã bán. Dữ liệu và lịch sử vẫn được lưu vĩnh viễn. Nếu khách trả lại, bạn có thể bấm <strong>&quot;Nhập lại kho&quot;</strong>.
                </p>
                {soldList.map((it, idx) => {
                  const { time, date } = fmtDate(it.soldAt || it.updatedAt);
                  return (
                    <div
                      key={it.sku}
                      className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-slate-400">#{pad(idx + 1)}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-black text-slate-900">{it.sku}</span>
                            <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                              Đã bán
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">Bán lúc: {time} ({date})</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedSku(it.sku)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                        >
                          Chi tiết
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestockItem(it.sku)}
                          className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
                          title="Nhập lại mã này vào kho"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Nhập lại</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* TAB HÀNG CÒN TRONG KHO (DANH SÁCH TINH GỌN, KHÔNG BỊ RỐI MẮT) */
            activeList.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <PackageOpen className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">Ô kho này hiện đang trống</p>
                <p className="text-xs text-slate-500 mt-1">Khi nhân viên nhắn mã qua Zalo, hàng sẽ hiển thị tại đây.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                  <span>
                    Đang hiển thị: <strong className="text-slate-800 font-bold">{activeList.length}</strong> sản phẩm 
                    {selectedSizePrefix !== "all" && <span> (Size {selectedSizePrefix})</span>}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-bold">
                    {sortOrder === "num_desc" ? "Số giảm dần ↓" : sortOrder === "num_asc" ? "Số tăng dần ↑" : "Theo thời gian"}
                  </span>
                </div>

                {activeList.map((it, idx) => {
                  const { time, date } = fmtDate(it.updatedAt);
                  const isTransferringThis = transferringSku === it.sku;
                  const parsed = parseSku(it.sku);

                  return (
                    <div
                      key={it.sku}
                      className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 hover:border-emerald-400 hover:shadow-2xs transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        {/* THÔNG TIN MÃ: Bấm vào xem lịch sử */}
                        <div 
                          className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1"
                          onClick={() => setSelectedSku(it.sku)}
                          title="Bấm để xem lịch sử chi tiết"
                        >
                          <span className="font-mono text-[11px] font-bold text-slate-400 shrink-0">
                            #{pad(idx + 1)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-base font-black text-slate-900 hover:text-emerald-700 tracking-wide truncate">
                                {it.sku}
                              </span>
                              {parsed.prefix !== "Khác" && (
                                <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.2 rounded-md">
                                  Size {parsed.prefix}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500 font-medium block truncate">
                              {time} · {date}
                            </span>
                          </div>
                        </div>

                        {/* NÚT THAO TÁC RÕ RÀNG, KHOẢNG CÁCH AN TOÀN TRÁNH BẤM NHẦM */}
                        <div 
                          className="flex items-center gap-1.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* NÚT ĐÁNH DẤU ĐÃ BÁN */}
                          <button
                            type="button"
                            onClick={() => handleMarkSoldItem(it.sku)}
                            className="flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 transition active:scale-95 cursor-pointer"
                            title="Đánh dấu đã bán"
                          >
                            <ShoppingBag className="h-3.5 w-3.5 text-amber-600" />
                            <span>Bán</span>
                          </button>

                          {/* NÚT CHUYỂN KHO */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isTransferringThis) {
                                setTransferringSku(null);
                              } else {
                                setTransferringSku(it.sku);
                                setTargetWarehouse(warehouse === 1 ? 2 : 1);
                              }
                            }}
                            className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition active:scale-95 cursor-pointer ${
                              isTransferringThis
                                ? "border-indigo-400 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-200"
                                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                            title="Chuyển sang kho khác"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 text-indigo-600" />
                            <span>{isTransferringThis ? "Huỷ" : "Chuyển"}</span>
                          </button>

                          {/* ĐƯỜNG PHÂN CÁCH NGĂN NÚT XUẤT/XÓA KHỎI CÁC NÚT THƯỜNG DÙNG */}
                          <div className="h-4 w-px bg-slate-200 mx-0.5" />

                          {/* NÚT XUẤT KHO (ĐẶT TÁCH BIỆT RÕ RÀNG) */}
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(it.sku)}
                            className="flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 transition active:scale-95 cursor-pointer"
                            title="Xuất mã này ra khỏi kho"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* KHUNG CHỌN KHO ĐÍCH NẾU BẤM CHUYỂN KHO TRỰC TIẾP */}
                      {isTransferringThis && (
                        <div 
                          className="mt-3 pt-3 border-t border-slate-100 bg-indigo-50/50 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-150"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-950">
                            <span>Chuyển sang:</span>
                            <select
                              value={targetWarehouse}
                              onChange={(e) => setTargetWarehouse(Number(e.target.value))}
                              className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {Array.from({ length: totalWarehouses }, (_, i) => i + 1)
                                .filter((wh) => wh !== warehouse)
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
                              onClick={() => setTransferringSku(null)}
                              className="px-2 text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                            >
                              Huỷ
                            </button>
                            <button
                              type="button"
                              disabled={transferSubmitting}
                              onClick={handleConfirmTransfer}
                              className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Xác nhận</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* FOOTER */}
        <div 
          className="border-t border-slate-200 bg-white px-4 sm:px-6 py-3 flex justify-between items-center text-xs text-slate-500 shrink-0"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <span className="hidden sm:inline">* Dữ liệu các mã đã bán luôn được lưu vết vĩnh viễn trong hệ thống.</span>
          <span className="sm:hidden font-medium text-slate-400">Kho {pad(warehouse)} · Xưởng Lũa Nhựt</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer ml-auto sm:ml-0"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* HỘP THOẠI XÁC NHẬN CHUẨN IOS PWA */}
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
    </div>,
    document.body
  );
}
