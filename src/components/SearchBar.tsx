"use client";

import { Search, X } from "lucide-react";

export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
        <Search className="h-5 w-5 text-slate-400" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="TÌM MÃ HÀNG (VD: E90.100, K100.101, S100.02, PT395, PCT124, BC12)..."
        aria-label="Tìm mã sản phẩm"
        className="w-full rounded-xl border-2 border-slate-200 bg-slate-50/50 py-3.5 pr-10 pl-11 font-mono text-base font-bold tracking-wider text-slate-900 uppercase transition placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600"
          title="Xóa tìm kiếm"
        >
          <X className="h-4 w-4 rounded-full bg-slate-200 p-0.5" />
        </button>
      )}
    </div>
  );
}
