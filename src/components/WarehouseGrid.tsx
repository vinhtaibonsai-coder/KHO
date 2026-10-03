"use client";

import { ChevronRight, Package, Warehouse } from "lucide-react";
import type { Item } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

export default function WarehouseGrid({
  items,
  highlight,
  highlightWarehouses,
  query = "",
  totalWarehouses = 30,
  onSelect,
}: {
  items: Item[];
  highlight: number | null;
  highlightWarehouses?: number[];
  query?: string;
  totalWarehouses?: number;
  onSelect: (warehouse: number) => void;
}) {
  const cleanQuery = query.trim().toUpperCase();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
      {Array.from({ length: totalWarehouses }, (_, i) => i + 1).map((w) => {
        const list = items.filter((it) => it.warehouse === w && it.status !== "sold");
        const count = list.length;
        const hasItem = count > 0;
        const isSelected = highlight === w || (highlightWarehouses && highlightWarehouses.includes(w));

        // Nếu đang tìm kiếm, ưu tiên hiển thị những mã khớp với query trước
        const matchedList = cleanQuery ? list.filter((it) => it.sku.toUpperCase().includes(cleanQuery)) : [];
        const displayList = cleanQuery && matchedList.length > 0
          ? [...matchedList, ...list.filter((it) => !it.sku.toUpperCase().includes(cleanQuery))]
          : list;

        return (
          <button
            key={w}
            type="button"
            onClick={() => onSelect(w)}
            className={`group relative flex flex-col justify-between rounded-xl p-3.5 text-left transition-all duration-200 cursor-pointer min-h-[110px] ${
              isSelected
                ? "border-2 border-emerald-500 bg-emerald-50/90 ring-4 ring-emerald-500/20 shadow-md animate-warehouse-active"
                : hasItem
                ? "border border-emerald-200 bg-emerald-50/30 hover:border-emerald-400 hover:bg-emerald-50/60 hover:shadow-xs"
                : "border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 shadow-2xs"
            }`}
          >
            {/* PHẦN ĐẦU THẺ KHO */}
            <div className="flex items-center justify-between w-full">
              <span
                className={`font-mono text-sm font-extrabold tracking-tight ${
                  isSelected
                    ? "text-emerald-900"
                    : hasItem
                    ? "text-slate-900"
                    : "text-slate-600"
                }`}
              >
                Kho {pad(w)}
              </span>

              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold font-mono ${
                  isSelected
                    ? "bg-emerald-600 text-white"
                    : hasItem
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {count} mã
              </span>
            </div>

            {/* DANH SÁCH MÃ THU GỌN */}
            <div className="my-2 space-y-1">
              {hasItem ? (
                <div className="flex flex-wrap gap-1">
                  {displayList.slice(0, 3).map((it) => {
                    const isMatched = cleanQuery && it.sku.toUpperCase().includes(cleanQuery);
                    return (
                      <span
                        key={it.sku}
                        className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold border shadow-2xs truncate max-w-full ${
                          isMatched
                            ? "bg-emerald-600 text-white border-emerald-700 font-bold ring-1 ring-emerald-300"
                            : "bg-white text-slate-700 border-emerald-200/80"
                        }`}
                      >
                        {it.sku}
                      </span>
                    );
                  })}
                  {count > 3 && (
                    <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100/60 rounded px-1 py-0.5">
                      +{count - 3}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic font-normal">Trống</p>
              )}
            </div>

            {/* CHÂN THẺ */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-400 group-hover:text-emerald-600 transition">
              <span className="font-medium">Xem chi tiết</span>
              <ChevronRight className="h-3 w-3 transition transform group-hover:translate-x-0.5" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
