"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Layers, MapPin, PackageSearch } from "lucide-react";
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
  const occupiedWarehouses = useMemo(() => new Set(activeItems.map((i) => i.warehouse)).size, [activeItems]);

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
                  onClick={() => setOpenKey(isOpen ? null : g.key)}
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
            <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/70 p-3 sm:p-4 shadow-sm animate-in fade-in duration-150">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-xs font-black text-emerald-900 uppercase tracking-wide">
                  {openGroup.sub} {openGroup.label} · {openGroup.items.length} mã · {openGroup.warehouses} ô kho
                </span>
                <button
                  type="button"
                  onClick={() => setOpenKey(null)}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-emerald-100 transition"
                >
                  Thu gọn
                </button>
              </div>

              <ul className="max-h-[380px] overflow-y-auto pr-1 space-y-1.5">
                {openGroup.items.map((it) => (
                  <li key={it.sku}>
                    <button
                      type="button"
                      onClick={() => onOpenWarehouse?.(it.warehouse)}
                      title={`Mở ô kho ${pad(it.warehouse)}`}
                      className="w-full flex items-center justify-between gap-2 rounded-xl border border-white/80 bg-white px-3 py-2 text-left shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-50 active:scale-[0.99] cursor-pointer"
                    >
                      <span className="font-mono text-sm font-bold text-slate-900 truncate">{it.sku}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono font-bold text-slate-400">x{it.qty}</span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-black text-white shadow-2xs">
                          <MapPin className="h-3 w-3" />
                          Kho {pad(it.warehouse)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
