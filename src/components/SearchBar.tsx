"use client";

import React, { forwardRef } from "react";
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

export interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
  availableSkus?: string[];
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, inputRef, autoFocus = false },
  ref
) {
  // Kết hợp ref từ cả forwardRef lẫn prop inputRef
  const combinedRef = (node: HTMLInputElement | null) => {
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;

    if (typeof inputRef === "function") inputRef(node);
    else if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
  };

  return (
    <div className="relative w-full space-y-2.5">
      {/* Khung ô tìm kiếm gọn gàng, không dropdown lịch sử / gợi ý che khuất */}
      <div className="relative w-full flex items-center">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 z-10">
          <Search className="h-4 w-4 text-slate-400" />
        </div>

        <input
          id="main-search-input"
          ref={combinedRef}
          autoFocus={autoFocus}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="Tìm mã sản phẩm (E120.124, K100, PT395...)"
          aria-label="Tìm mã sản phẩm"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          className="w-full rounded-full border border-slate-200/90 bg-slate-100/80 hover:bg-slate-100 py-3 pr-10 pl-9 font-mono text-sm sm:text-base font-bold tracking-wide text-slate-900 uppercase transition placeholder:font-sans placeholder:text-xs sm:placeholder:text-sm placeholder:font-normal placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/15 shadow-inner"
        />

        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer z-10"
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
});

export default SearchBar;
