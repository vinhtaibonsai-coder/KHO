"use client";

import { Search, X } from "lucide-react";

const QUICK_FILTERS = [
  { label: "Tất cả", value: "" },
  { label: "E-Size", value: "E" },
  { label: "P-Size", value: "P" },
  { label: "K-Size", value: "K" },
  { label: "S-Size", value: "S" },
  { label: "PT", value: "PT" },
  { label: "PCT", value: "PCT" },
  { label: "BC", value: "BC" },
];

export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="w-full space-y-2.5">
      {/* GitHub Mobile Style Search Input Bar */}
      <div className="relative w-full flex items-center">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="Tìm mã sản phẩm (E120.124, K100, PT395...)"
          aria-label="Tìm mã sản phẩm"
          className="w-full rounded-full border border-slate-200/90 bg-slate-100/80 hover:bg-slate-100 py-2.5 pr-10 pl-9 font-mono text-sm sm:text-base font-bold tracking-wide text-slate-900 uppercase transition placeholder:font-sans placeholder:text-xs sm:placeholder:text-sm placeholder:font-normal placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 shadow-inner"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer"
            title="Xóa tìm kiếm"
          >
            <div className="rounded-full bg-slate-200 hover:bg-slate-300 p-1 flex items-center justify-center transition">
              <X className="h-3 w-3 text-slate-600" />
            </div>
          </button>
        )}
      </div>

      {/* GitHub Mobile Style Quick Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
        {QUICK_FILTERS.map((f) => {
          const isSelected = f.value === "" ? value === "" : value === f.value;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => onChange(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-mono font-bold whitespace-nowrap transition cursor-pointer shrink-0 border ${
                isSelected
                  ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                  : "bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-900 shadow-2xs"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
