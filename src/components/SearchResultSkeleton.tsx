"use client";

import React from "react";
import { Loader2, Warehouse } from "lucide-react";

export default function SearchResultSkeleton({ query }: { query?: string }) {
  const code = query?.trim().toUpperCase();

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* THẺ SKELETON KẾT QUẢ TÌM KIẾM */}
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-4 sm:p-5 shadow-xs animate-pulse">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          {/* Thông tin mã & vị trí đang tải */}
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs shrink-0 mt-0.5 sm:mt-0">
              <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-white" />
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-emerald-800 uppercase tracking-wide">
                  ĐANG KẾT NỐI DATABASE TRA CỨU:
                </span>
                {code ? (
                  <span className="font-mono text-xl sm:text-2xl font-black text-slate-900 tracking-wider">
                    {code}
                  </span>
                ) : (
                  <span className="inline-block h-6 w-24 bg-slate-200 rounded-lg animate-pulse" />
                )}
                <span className="text-[11px] text-emerald-600 font-medium italic">
                  (Đang đồng bộ dữ liệu...)
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm text-slate-600 font-medium">
                  Đang xác định vị trí ô kho:
                </span>
                <span className="inline-flex items-center gap-1.5 font-bold text-blue-900 bg-blue-100 px-3 py-1 rounded-xl text-xs sm:text-sm">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                  Kho ...
                </span>
                <span className="inline-block h-5 w-24 bg-indigo-100 rounded-xl" />
              </div>
            </div>
          </div>

          {/* Cụm nút thao tác Skeleton */}
          <div className="flex items-center gap-1.5 sm:gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-emerald-200/60 shrink-0 flex-wrap">
            <div className="h-8 w-20 bg-amber-200/80 rounded-xl" />
            <div className="h-8 w-24 bg-slate-200 rounded-xl" />
            <div className="h-8 w-28 bg-emerald-300/80 rounded-xl" />
          </div>
        </div>
      </div>

      {/* SKELETON BẢN ĐỒ VỊ TRÍ KHO */}
      <div className="mt-4 pt-4 border-t border-slate-200/80 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Warehouse className="h-4 w-4 text-emerald-600" />
            Vị trí trực tiếp trên bản đồ kho &amp; toà nhà:
          </span>
          <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Đang tải dữ liệu bản đồ...
          </span>
        </div>

        <div className="h-44 sm:h-56 w-full rounded-2xl bg-slate-100 border border-slate-200/80 flex flex-col items-center justify-center p-4 text-center space-y-2 animate-pulse">
          <Loader2 className="h-6 w-6 text-emerald-600 animate-spin" />
          <p className="text-xs text-slate-500 font-medium">
            Đang tải sơ đồ định vị kho từ cơ sở dữ liệu...
          </p>
        </div>
      </div>
    </div>
  );
}
