"use client";

import React, { forwardRef, useState, useEffect } from "react";
import { Search, X, Camera, History, Trash2, ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";

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

  // Hàm lưu tức thời một mã vào lịch sử
  const saveToHistory = (sku: string) => {
    const trimmed = sku.trim().toUpperCase();
    if (trimmed.length < 2) return;
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, MAX_HISTORY);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Tự động lưu mã vào lịch sử khi người dùng gõ tìm kiếm (giảm debounce xuống 500ms cho nhạy)
  useEffect(() => {
    const trimmed = value.trim().toUpperCase();
    if (trimmed.length < 2) return;

    const timer = setTimeout(() => {
      saveToHistory(trimmed);
    }, 500);

    return () => clearTimeout(timer);
  }, [value]);

  const selectHistoryItem = (sku: string) => {
    onChange(sku);
    saveToHistory(sku);
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

  const clearAllHistory = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              saveToHistory(value.trim());
            }
          }}
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

      {/* KHỐI NHẬT KÝ / LỊCH SỬ TRA CỨU - THU GỌN THÀNH 1 DÒNG, BẤM VÀO MỚI SỔ RA */}
      <div className="rounded-xl border border-emerald-100/90 bg-emerald-50/50 transition-all overflow-hidden">
        {/* Thanh tiêu đề 1 dòng (Click để đóng / mở) */}
        <div 
          onClick={() => setShowHistory((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setShowHistory((prev) => !prev);
          }}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none hover:bg-emerald-100/40 transition active:bg-emerald-100/60"
        >
          <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-950">
            <History className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>Nhật ký tìm kiếm</span>
            {history.length > 0 ? (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200/80">
                {history.length} mã
              </span>
            ) : (
              <span className="text-[11px] font-normal text-slate-400 italic">(chưa có mã)</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {history.length > 0 && showHistory && (
              <button
                type="button"
                onClick={(e) => clearAllHistory(e)}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600 transition px-1 py-0.5 rounded cursor-pointer hover:bg-white/80"
                title="Xóa toàn bộ nhật ký tìm kiếm"
              >
                <Trash2 className="h-3 w-3" />
                <span>Xóa hết</span>
              </button>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
              {showHistory ? (
                <>
                  <span>Thu gọn</span>
                  <ChevronUp className="h-3.5 w-3.5 text-emerald-600" />
                </>
              ) : (
                <>
                  <span>Mở xem</span>
                  <ChevronDown className="h-3.5 w-3.5 text-emerald-600" />
                </>
              )}
            </span>
          </div>
        </div>

        {/* PHẦN SỔ RA KHI NGƯỜI DÙNG BẤM MỞ */}
        {showHistory && (
          <div className="px-3 pt-1 pb-2.5 border-t border-emerald-100/80 space-y-2 animate-in fade-in-50 duration-150">
            {history.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pt-1">
                {history.map((sku) => (
                  <div
                    key={sku}
                    onClick={() => selectHistoryItem(sku)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") selectHistoryItem(sku);
                    }}
                    className="group inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/90 bg-white hover:bg-emerald-50 hover:border-emerald-400 px-2.5 py-1 text-xs font-mono font-bold text-slate-800 shadow-2xs transition active:scale-95 cursor-pointer"
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
            ) : (
              <div className="flex items-center justify-between text-xs text-slate-500 py-1">
                <span>Gõ tìm mã hoặc bấm chọn mã gợi ý:</span>
                <div className="flex items-center gap-1">
                  {["E120", "P150", "K100"].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => selectHistoryItem(sample)}
                      className="rounded bg-white px-2 py-0.5 text-[11px] font-mono font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
