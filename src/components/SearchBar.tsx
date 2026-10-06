"use client";

import React, { forwardRef, useState, useEffect, useRef, useMemo } from "react";
import { Search, X, Clock, Trash2, ArrowUpLeft, TrendingUp } from "lucide-react";

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

const SEARCH_HISTORY_KEY = "lua_nhut_search_history";
const MAX_HISTORY_ITEMS = 10;

function loadSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("Lỗi đọc lịch sử tìm kiếm:", e);
    return [];
  }
}

function saveSearchHistory(history: string[]) {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)));
  } catch (e) {
    console.warn("Lỗi lưu lịch sử tìm kiếm:", e);
  }
}

export interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
  availableSkus?: string[]; // Danh sách toàn bộ SKU trong hệ thống để gợi ý tự động như Google
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, inputRef, autoFocus = false, availableSkus = [] },
  ref
) {
  const [history, setHistory] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Đọc lịch sử tìm kiếm lúc khởi tạo
  useEffect(() => {
    setHistory(loadSearchHistory());
  }, []);

  // Đóng gợi ý khi nhấp chuột ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  // Lưu một từ khóa vào lịch sử tìm kiếm
  const addToHistory = (term: string) => {
    const clean = term.trim().toUpperCase();
    if (!clean || clean.length < 2) return;
    setHistory((prev) => {
      const filtered = prev.filter((item) => item !== clean);
      const updated = [clean, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      saveSearchHistory(updated);
      return updated;
    });
  };

  // Xóa 1 mục khỏi lịch sử
  const removeHistoryItem = (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory((prev) => {
      const updated = prev.filter((item) => item !== term);
      saveSearchHistory(updated);
      return updated;
    });
  };

  // Xóa toàn bộ lịch sử tìm kiếm
  const clearAllHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory([]);
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch {}
  };

  // Chọn từ khóa từ gợi ý
  const selectSuggestion = (term: string) => {
    onChange(term);
    addToHistory(term);
    setIsFocused(false);
  };

  // Kết hợp ref từ cả forwardRef lẫn prop inputRef
  const combinedRef = (node: HTMLInputElement | null) => {
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;

    if (typeof inputRef === "function") inputRef(node);
    else if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
  };

  // Lọc lịch sử khớp với từ khóa đang gõ (nếu có gõ)
  const queryClean = value.trim().toUpperCase();

  const matchingHistory = useMemo(() => {
    if (!queryClean) return history;
    return history.filter((item) => item.includes(queryClean));
  }, [history, queryClean]);

  // Gợi ý thông minh từ danh sách SKU sản phẩm thực tế trong kho (Google Auto-complete)
  const skuSuggestions = useMemo(() => {
    if (!queryClean || !availableSkus || availableSkus.length === 0) return [];
    const results: string[] = [];
    for (const sku of availableSkus) {
      const upper = sku.toUpperCase();
      if (upper.includes(queryClean) && !history.includes(upper)) {
        results.push(upper);
        if (results.length >= 5) break;
      }
    }
    return results;
  }, [availableSkus, queryClean, history]);

  const showDropdown = isFocused && (matchingHistory.length > 0 || skuSuggestions.length > 0);

  return (
    <div ref={containerRef} className="relative w-full space-y-2.5">
      {/* Khung ô tìm kiếm Google / iOS Capsule */}
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
          onFocus={() => setIsFocused(true)}
          onChange={(e) => {
            onChange(e.target.value.toUpperCase());
            setIsFocused(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              addToHistory(value.trim());
              setIsFocused(false);
            }
          }}
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
            onClick={() => {
              onChange("");
              setIsFocused(true);
            }}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer z-10"
            title="Xóa tìm kiếm"
          >
            <div className="rounded-full bg-slate-200 hover:bg-slate-300 p-1 flex items-center justify-center transition">
              <X className="h-3 w-3 text-slate-600" />
            </div>
          </button>
        )}
      </div>

      {/* DROPDOWN GỢI Ý & LỊCH SỬ TÌM KIẾM THEO PHONG CÁCH GOOGLE SEARCH */}
      {showDropdown && (
        <div 
          className="absolute left-0 right-0 top-11 z-50 mt-1 bg-white rounded-2xl border border-slate-200/90 shadow-2xl overflow-hidden divide-y divide-slate-100 animate-in fade-in zoom-in-98 duration-150"
          style={{ maxHeight: "360px" }}
        >
          {/* TIÊU ĐỀ LỊCH SỬ TÌM KIẾM */}
          {matchingHistory.length > 0 && (
            <div className="bg-slate-50/80 px-3.5 py-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5 uppercase tracking-wider text-slate-500">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                {queryClean ? "Lịch sử phù hợp" : "Tìm kiếm gần đây"}
              </span>

              <button
                type="button"
                onClick={clearAllHistory}
                className="text-slate-400 hover:text-rose-600 font-semibold cursor-pointer transition flex items-center gap-1"
                title="Xóa toàn bộ lịch sử"
              >
                <Trash2 className="h-3 w-3" />
                <span>Xóa hết</span>
              </button>
            </div>
          )}

          {/* DANH SÁCH CÁC TỪ KHÓA ĐÃ TÌM GẦN ĐÂY */}
          <div className="overflow-y-auto max-h-[220px] divide-y divide-slate-50">
            {matchingHistory.map((item) => (
              <div
                key={item}
                onClick={() => selectSuggestion(item)}
                className="group flex items-center justify-between px-3.5 py-2.5 hover:bg-emerald-50/60 cursor-pointer transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-slate-100 group-hover:bg-emerald-100 flex items-center justify-center text-slate-400 group-hover:text-emerald-700 transition shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-mono text-sm font-extrabold text-slate-800 group-hover:text-emerald-900 truncate tracking-wide">
                    {item}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {/* Nút bấm để điền vào ô mà không submit ngay */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(item);
                    }}
                    className="p-1 rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                    title="Điền vào ô tìm kiếm"
                  >
                    <ArrowUpLeft className="h-3.5 w-3.5" />
                  </button>

                  {/* Nút xóa 1 mục lịch sử */}
                  <button
                    type="button"
                    onClick={(e) => removeHistoryItem(item, e)}
                    className="p-1 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    title="Xóa mục này"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* GỢI Ý MÃ SẢN PHẨM TRỰC TIẾP TRONG KHO (KHI ĐANG GÕ) */}
          {skuSuggestions.length > 0 && (
            <div>
              <div className="bg-slate-50/80 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                Gợi ý mã có trong kho
              </div>

              <div className="divide-y divide-slate-50">
                {skuSuggestions.map((sku) => (
                  <div
                    key={sku}
                    onClick={() => selectSuggestion(sku)}
                    className="group flex items-center justify-between px-3.5 py-2.5 hover:bg-emerald-50/70 cursor-pointer transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <Search className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-mono text-sm font-black text-emerald-950 group-hover:text-emerald-700 truncate tracking-wide">
                        {sku}
                      </span>
                    </div>

                    <span className="text-[11px] font-bold text-emerald-600 group-hover:underline">
                      Chọn mã này
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* GitHub Mobile Style Quick Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
        {QUICK_FILTERS.map((f) => {
          const isSelected = f.value === "" ? value === "" : value === f.value;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => {
                onChange(f.value);
                if (f.value) addToHistory(f.value);
              }}
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

