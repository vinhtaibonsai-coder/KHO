"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Layers, MapPin, PackageSearch, Search } from "lucide-react";
import type { Item } from "@/types";
import { ALLOWED_SIZES } from "@/lib/sku-rules";

const pad = (n: number) => String(n).padStart(2, "0");

type SizeGroup = {
  key: string;
  label: string;
  sub: string;
  items: Item[];
  warehouses: number;
};

function groupKeyOf(sku: string): { key: string; sized: boolean } {
  const clean = sku.trim().toUpperCase();
  const sized = clean.match(/^([EKPS])(\d+)\./);
  if (sized) return { key: sized[2], sized: true };
  const fixed = clean.match(/^(PT|PCT|BC)/);
  if (fixed) return { key: fixed[1], sized: false };
  return { key: "KHAC", sized: false };
}

function parseSkuNum(sku: string): number {
  const m = sku.match(/\.(\d+)/);
  if (m) return parseInt(m[1], 10);
  const m2 = sku.match(/(\d+)/);
  return m2 ? parseInt(m2[1], 10) : 0;
}

const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100, 0]; // 0 là Tất cả

export default function SizeInventoryManager({
  items,
  totalWarehouses = 30,
  onOpenWarehouse,
}: {
  items: Item[];
  totalWarehouses?: number;
  onOpenWarehouse?: (warehouse: number) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50); // Mặc định 50 mã / trang hoặc người dùng có thể chọn tất cả
  const [filterQuery, setFilterQuery] = useState<string>("");

  const activeItems = useMemo(() => items.filter((i) => i.status !== "sold"), [items]);

  const groups = useMemo<SizeGroup[]>(() => {
    const map = new Map<string, Item[]>();
    for (const it of activeItems) {
      const { key } = groupKeyOf(it.sku);
      const list = map.get(key);
      if (list) list.push(it);
      else map.set(key, [it]);
    }

    const result: SizeGroup[] = [];
    for (const [key, list] of map) {
      const isSize = /^\d+$/.test(key);
      // Sắp xếp mã bên trong theo số thứ tự lớn tới nhỏ (giảm dần)
      const sorted = list.slice().sort((a, b) => {
        const numA = parseSkuNum(a.sku);
        const numB = parseSkuNum(b.sku);
        if (numA !== numB) return numB - numA;
        return b.sku.localeCompare(a.sku, "vi", { numeric: true });
      });
      result.push({
        key,
        label: isSize ? key : key === "KHAC" ? "Khác" : key,
        sub: isSize ? "Size" : key === "KHAC" ? "Không rõ" : "Tiền tố",
        items: sorted,
        warehouses: new Set(sorted.map((i) => i.warehouse)).size,
      });
    }

    const sizeOrder = new Map(ALLOWED_SIZES.map((s, i) => [s as string, i]));
    return result.sort((a, b) => {
      const sa = sizeOrder.has(a.key) ? 0 : 1;
      const sb = sizeOrder.has(b.key) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      if (sa === 0) return Number(b.key) - Number(a.key);
      return a.key.localeCompare(b.key);
    });
  }, [activeItems]);

  const openGroup = openKey ? groups.find((g) => g.key === openKey) ?? null : null;

  // Lọc mã bên trong size nếu có tìm kiếm nhanh
  const filteredGroupItems = useMemo(() => {
    if (!openGroup) return [];
    const q = filterQuery.trim().toUpperCase();
    if (!q) return openGroup.items;
    return openGroup.items.filter((it) => it.sku.toUpperCase().includes(q));
  }, [openGroup, filterQuery]);

  // Phân trang
  const totalItems = filteredGroupItems.length;
  const isShowAll = pageSize === 0;
  const totalPages = isShowAll ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    if (isShowAll) return filteredGroupItems;
    const start = (validCurrentPage - 1) * pageSize;
    return filteredGroupItems.slice(start, start + pageSize);
  }, [filteredGroupItems, isShowAll, validCurrentPage, pageSize]);

  const occupiedWarehouses = useMemo(() => new Set(activeItems.map((i) => i.warehouse)).size, [activeItems]);

  const handleSelectGroup = (key: string) => {
    if (openKey === key) {
      setOpenKey(null);
    } else {
      setOpenKey(key);
      setCurrentPage(1);
      setFilterQuery("");
    }
  };

  return (
    <div className="space-y-4">
      {/* ĐẦU MỤC */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-emerald-600" />
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Quản Lý Kho Theo Size
          </h2>
          <span className="text-xs text-slate-400 hidden sm:inline">(Chạm size để bung danh sách mã)</span>
        </div>

        <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
          <span>
            <strong className="font-mono text-slate-900 font-bold">{groups.length}</strong> nhóm
          </span>
          <span className="text-slate-300">|</span>
          <span>
            <strong className="font-mono text-emerald-700 font-bold">{activeItems.length}</strong> mã
          </span>
          <span className="text-slate-300">|</span>
          <span>
            <strong className="font-mono text-emerald-700 font-bold">{occupiedWarehouses}</strong>/{totalWarehouses} ô kho
          </span>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="py-10 flex flex-col items-center justify-center text-center space-y-2 px-4">
          <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200/80">
            <PackageSearch className="h-7 w-7 text-slate-400 stroke-[1.5]" />
          </div>
          <p className="text-sm font-semibold text-slate-500">Chưa có mã nào trong kho</p>
        </div>
      ) : (
        <>
          {/* LƯỚI CÁC THẺ SIZE */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {groups.map((g) => {
              const isOpen = openKey === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => handleSelectGroup(g.key)}
                  aria-expanded={isOpen}
                  className={`group flex flex-col items-start justify-between rounded-xl p-3 text-left transition-all duration-200 cursor-pointer min-h-[92px] ${
                    isOpen
                      ? "border-2 border-emerald-500 bg-emerald-600 text-white shadow-md ring-4 ring-emerald-500/20 scale-[1.02]"
                      : "border border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/60 shadow-2xs"
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-1">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        isOpen ? "text-emerald-100" : "text-slate-400"
                      }`}
                    >
                      {g.sub}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-white" : "text-slate-300 group-hover:text-emerald-500"
                      }`}
                    />
                  </div>

                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`font-mono text-2xl font-black tracking-tight leading-none ${
                        isOpen ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {g.label}
                    </span>
                    <span
                      className={`text-[11px] font-bold font-mono ${
                        isOpen ? "text-emerald-100" : "text-emerald-700"
                      }`}
                    >
                      {g.items.length} mã
                    </span>
                  </div>

                  <div
                    className={`mt-1 text-[10px] font-semibold font-mono ${
                      isOpen ? "text-emerald-100" : "text-slate-400"
                    }`}
                  >
                    {g.warehouses} ô kho chứa
                  </div>
                </button>
              );
            })}
          </div>

          {/* DANH SÁCH MÃ KHI BUNG 1 SIZE */}
          {openGroup && (
            <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/70 p-3 sm:p-5 shadow-sm animate-in fade-in duration-150 space-y-3">
              {/* THANH ĐIỀU KHIỂN & BỘ LỌC CỦA SIZE ĐANG MỞ */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-emerald-200/70">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wide">
                    {openGroup.sub} {openGroup.label} · <span className="font-mono text-emerald-800">{totalItems}</span> mã · {openGroup.warehouses} ô kho
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end">
                  {/* TÌM KIẾM NHANH TRONG SIZE */}
                  <div className="relative flex-1 sm:flex-initial min-w-[140px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={filterQuery}
                      onChange={(e) => {
                        setFilterQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Lọc mã..."
                      className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-emerald-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold text-slate-800"
                    />
                  </div>

                  {/* CHỌN SỐ LƯỢNG HIỂN THỊ MỖI TRANG */}
                  <div className="flex items-center gap-1 text-[11px] text-slate-600 font-medium">
                    <span className="hidden xs:inline">Hiện:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value={20}>20 mã / trang</option>
                      <option value={50}>50 mã / trang</option>
                      <option value={100}>100 mã / trang</option>
                      <option value={0}>Tất cả ({totalItems} mã)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenKey(null)}
                    className="text-[11px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 cursor-pointer px-2.5 py-1 rounded-lg transition"
                  >
                    Thu gọn
                  </button>
                </div>
              </div>

              {/* DANH SÁCH MÃ SẢN PHẨM (HIỂN THỊ ĐẦY ĐỦ KHÔNG BỊ CẮT VỚI LƯỚI 2 CỘT TRÊN MÀN HÌNH RỘNG) */}
              {paginatedItems.length === 0 ? (
                <div className="py-6 text-center text-xs font-bold text-slate-500">
                  Không tìm thấy mã nào khớp với &quot;{filterQuery}&quot; trong size {openGroup.label}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {paginatedItems.map((it) => (
                    <button
                      key={it.sku}
                      type="button"
                      onClick={() => onOpenWarehouse?.(it.warehouse)}
                      title={`Mở ô kho ${pad(it.warehouse)}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/90 bg-white px-3.5 py-2.5 text-left shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-50 active:scale-[0.99] cursor-pointer"
                    >
                      <span className="font-mono text-sm sm:text-base font-black text-slate-900 truncate tracking-wide">
                        {it.sku}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-mono font-bold text-slate-400">x{it.qty}</span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-black text-white shadow-2xs">
                          <MapPin className="h-3 w-3" />
                          Kho {pad(it.warehouse)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* THANH ĐIỀU HƯỚNG PHÂN TRANG (CHỈ HIỆN KHI CÓ NHIỀU HƠN 1 TRANG VÀ KHÔNG CHỌN TẤT CẢ) */}
              {!isShowAll && totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-emerald-200/70 text-xs font-medium text-slate-600">
                  <span>
                    Trang <strong className="font-mono text-emerald-800">{validCurrentPage}</strong> / <span className="font-mono">{totalPages}</span> (Tổng {totalItems} mã)
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={validCurrentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 bg-white font-bold text-slate-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      <span className="hidden xs:inline">Trước</span>
                    </button>

                    {/* Hiển thị các số trang */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - validCurrentPage) <= 1)
                        .map((p, idx, arr) => {
                          const prev = arr[idx - 1];
                          return (
                            <div key={p} className="flex items-center gap-1">
                              {prev && p - prev > 1 && <span className="px-1 text-slate-400">...</span>}
                              <button
                                type="button"
                                onClick={() => setCurrentPage(p)}
                                className={`h-7 w-7 rounded-lg text-xs font-mono font-bold transition ${
                                  p === validCurrentPage
                                    ? "bg-emerald-600 text-white shadow-xs"
                                    : "bg-white text-slate-700 border border-emerald-300 hover:bg-emerald-50"
                                }`}
                              >
                                {p}
                              </button>
                            </div>
                          );
                        })}
                    </div>

                    <button
                      type="button"
                      disabled={validCurrentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 bg-white font-bold text-slate-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <span className="hidden xs:inline">Sau</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
