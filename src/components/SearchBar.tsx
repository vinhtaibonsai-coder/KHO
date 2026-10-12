"use client";

import React, { forwardRef, useState, useEffect } from "react";
import { Search, X, Camera, History, Trash2, ArrowUpRight } from "lucide-react";

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

const SEARCH_HISTORY_KEY = "kho_search_history_v1";
const MAX_HISTORY = 10;

export interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
  availableSkus?: string[];
  onScan?: () => void;
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, inputRef, autoFocus = false, onScan },
  ref
) {
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load lịch sử từ localStorage khi mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setHistory(parsed.slice(0, MAX_HISTORY));
      }
    } catch {}
  }, []);

  // Tự động lưu mã vào lịch sử khi tìm kiếm mã hoàn chỉnh (ít nhất 3 ký tự)
  useEffect(() => {
    const trimmed = value.trim().toUpperCase();
    if (trimmed.length < 3) return;

    const timer = setTimeout(() => {
      setHistory((prev) => {
        const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, MAX_HISTORY);
        try {
          localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, [value]);

  const selectHistoryItem = (sku: string) => {
    onChange(sku);
    setShowHistory(false);
  };

  const removeHistoryItem = (e: React.MouseEvent, sku: string) => {
    e.stopPropagation();
    setHistory((prev) => {
      const next = prev.filter((item) => item !== sku);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const clearAllHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory([]);
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch {}
  };

  // Kết hợp ref từ cả forwardRef lẫn prop inputRef
  const combinedRef = (node: HTMLInputElement | null) => {
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;

    if (typeof inputRef === "function") inputRef(node);
    else if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
  };

  return (
    <div className="relative w-full space-y-2.5">
      {/* Khung ô tìm kiếm */}
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

        {/* NÚT CAMERA QUÉT MÃ VẠCH (CHỈ MOBILE + KHI Ô TÌM KIẾM TRỐNG) */}
        {onScan && !value && (
          <button
            type="button"
            onClick={onScan}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-emerald-600 hover:text-emerald-700 cursor-pointer z-10 sm:hidden"
            title="Quét mã vạch bằng camera"
          >
            <div className="rounded-full bg-emerald-100 hover:bg-emerald-200 p-1.5 flex items-center justify-center transition">
              <Camera className="h-4 w-4 text-emerald-700" />
            </div>
          </button>
        )}

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

      {/* DÒNG NÚT BẤM LỊCH SỬ TRA CỨU NGAY PHÍA DƯỚI Ô TÌM KIẾM */}
      {history.length > 0 && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2 sm:p-2.5 space-y-2 transition-all animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowHistory((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950 transition cursor-pointer"
            >
              <History className="h-3.5 w-3.5 text-emerald-600" />
              <span>Lịch sử đã tra ({history.length} mã)</span>
              <span className="text-[10px] text-emerald-600 underline ml-0.5">
                {showHistory ? "Thu gọn" : "Xem tất cả"}
              </span>
            </button>

            <button
              type="button"
              onClick={clearAllHistory}
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600 transition cursor-pointer"
              title="Xóa toàn bộ lịch sử tra cứu"
            >
              <Trash2 className="h-3 w-3" />
              <span>Xóa</span>
            </button>
          </div>

          {/* DANH SÁCH MÃ ĐÃ TRA CỨU */}
          <div
            className={`flex flex-wrap gap-1.5 transition-all ${
              showHistory ? "max-h-48 overflow-y-auto" : "max-h-8 overflow-hidden"
            }`}
          >
            {(showHistory ? history : history.slice(0, 5)).map((sku) => (
              <div
                key={sku}
                onClick={() => selectHistoryItem(sku)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") selectHistoryItem(sku);
                }}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-white hover:bg-emerald-50 hover:border-emerald-300 px-2.5 py-1 text-xs font-mono font-bold text-slate-800 shadow-2xs transition active:scale-95 cursor-pointer"
              >
                <span>{sku}</span>
                <ArrowUpRight className="h-3 w-3 text-slate-400 group-hover:text-emerald-600 transition" />
                <button
                  type="button"
                  onClick={(e) => removeHistoryItem(e, sku)}
                  className="rounded p-0.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition -mr-1"
                  title={`Xóa mã ${sku} khỏi lịch sử`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Filter Pills (Tất cả, E-Size, P-Size...) - Chuẩn màu Emerald & Slate sáng */}
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
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs hover:bg-emerald-700"
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
