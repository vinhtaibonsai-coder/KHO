"use client";

import { useMemo, useState } from "react";
import { 
  CheckCircle2, 
  Clock, 
  Filter, 
  MessageSquare, 
  Radio, 
  Search, 
  TrendingUp, 
  Warehouse, 
  XCircle 
} from "lucide-react";
import type { ZaloMessage } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

const fmtFullTime = (iso: string) => {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return { time, date };
};

export default function ZaloLiveFeed({
  messages,
  totalWarehouses = 30,
  onOpenWarehouse,
}: {
  messages: ZaloMessage[];
  totalWarehouses?: number;
  onOpenWarehouse: (warehouse: number) => void;
}) {
  const [filterWh, setFilterWh] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Thống kê nhanh
  const stats = useMemo(() => {
    const success = messages.filter((m) => m.status === "ok").length;
    const error = messages.filter((m) => m.status === "error").length;
    return { total: messages.length, success, error };
  }, [messages]);

  // Bộ lọc tin nhắn
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      // Lọc theo kho
      if (filterWh !== "all") {
        const whNum = parseInt(filterWh, 10);
        if (m.warehouse !== whNum) return false;
      }
      // Lọc theo từ khóa tìm kiếm (mã hoặc nội dung)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        const matchMsg = m.message.toUpperCase().includes(q);
        const matchDetail = m.detail.toUpperCase().includes(q);
        const matchGroup = m.groupId.toUpperCase().includes(q);
        if (!matchMsg && !matchDetail && !matchGroup) return false;
      }
      return true;
    });
  }, [messages, filterWh, searchQuery]);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
      {/* TIÊU ĐỀ & THỐNG KÊ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-extrabold border border-blue-200 shadow-2xs">
            <Radio className="h-5 w-5 animate-pulse text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Nhật Ký Tin Nhắn Zalo Quét Được
              </h2>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                Đồng bộ tự động
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Toàn bộ tin nhắn nhận diện được từ 30 nhóm kho (kèm tin nhắn quét lịch sử cũ)
            </p>
          </div>
        </div>

        {/* THẺ THỐNG KÊ NHANH */}
        <div className="flex items-center gap-2 text-xs">
          <div className="rounded-lg bg-slate-50 px-3 py-1.5 border border-slate-200 flex items-center gap-1.5 font-medium text-slate-600">
            <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
            <span>Tổng: <strong className="font-mono text-slate-900 font-bold">{stats.total}</strong></span>
          </div>
          <div className="rounded-lg bg-emerald-50 px-3 py-1.5 border border-emerald-200 flex items-center gap-1.5 font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Đã nạp: <strong className="font-mono font-bold">{stats.success}</strong></span>
          </div>
          {stats.error > 0 && (
            <div className="rounded-lg bg-rose-50 px-3 py-1.5 border border-rose-200 flex items-center gap-1.5 font-medium text-rose-800">
              <XCircle className="h-3.5 w-3.5 text-rose-600" />
              <span>Bỏ qua: <strong className="font-mono font-bold">{stats.error}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* THANH TÌM KIẾM & BỘ LỌC KHO */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Lọc theo mã hàng, nội dung tin nhắn..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <select
            value={filterWh}
            onChange={(e) => setFilterWh(e.target.value)}
            className="w-full sm:w-44 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-blue-500 transition"
          >
            <option value="all">Tất cả các kho ({totalWarehouses} kho)</option>
            {Array.from({ length: totalWarehouses }, (_, i) => i + 1).map((w) => (
              <option key={w} value={String(w)}>
                Kho {pad(w)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* DANH SÁCH TIN NHẮN HIỂN THỊ */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/30 overflow-hidden">
        {filteredMessages.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">Chưa có tin nhắn nào</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Khi chạy tool quét tin nhắn cũ hoặc công nhân nhắn tin vào nhóm Zalo, dữ liệu sẽ hiển thị ngay tại đây.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
            {filteredMessages.map((m) => {
              const { time, date } = fmtFullTime(m.createdAt);
              const isOk = m.status === "ok";

              return (
                <div
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 hover:bg-white transition"
                >
                  <div className="flex items-start gap-3">
                    {/* ICON TRẠNG THÁI */}
                    <div className="mt-0.5">
                      {isOk ? (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                          <XCircle className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    <div>
                      {/* DÒNG TIÊU ĐỀ: NHÓM + NỘI DUNG TIN GỐC */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                          {m.groupId}
                        </span>
                        <span className="font-mono text-sm font-extrabold text-slate-900 tracking-wide">
                          &quot;{m.message}&quot;
                        </span>
                      </div>

                      {/* DÒNG KẾT QUẢ XỬ LÝ */}
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className={`font-semibold ${isOk ? "text-emerald-700" : "text-rose-600"}`}>
                          ➔ {m.detail}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* THỜI GIAN NHẬN TIN & NÚT TRUY CẬP KHO */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                      <span className="flex items-center gap-1 font-mono text-slate-500">
                        <Clock className="h-3 w-3" />
                        {time}
                      </span>
                      <span>·</span>
                      <span>{date}</span>
                    </div>

                    {m.warehouse && (
                      <button
                        type="button"
                        onClick={() => onOpenWarehouse(m.warehouse!)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <Warehouse className="h-3 w-3" />
                        Mở Kho {pad(m.warehouse)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
