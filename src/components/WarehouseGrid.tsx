"use client";

import { ChevronRight, Package, Warehouse } from "lucide-react";
import type { Item } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

export default function WarehouseGrid({
  items,
  highlight,
  totalWarehouses = 30,
  onSelect,
}: {
  items: Item[];
  highlight: number | null;
  totalWarehouses?: number;
  onSelect: (warehouse: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
      {Array.from({ length: totalWarehouses }, (_, i) => i + 1).map((w) => {
        const list = items.filter((it) => it.warehouse === w && it.status !== "sold");
        const count = list.length;
        const hasItem = count > 0;
        const isSelected = highlight === w;

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
                  {list.slice(0, 2).map((it) => (
                    <span
                      key={it.sku}
                      className="inline-block rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 border border-emerald-200/80 shadow-2xs truncate max-w-full"
                    >
                      {it.sku}
                    </span>
                  ))}
                  {count > 2 && (
                    <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100/60 rounded px-1 py-0.5">
                      +{count - 2}
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
