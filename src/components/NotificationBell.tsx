"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { 
  Bell, 
  CheckCheck, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Warehouse, 
  ExternalLink,
  ChevronRight,
  Filter
} from "lucide-react";
import type { ZaloMessage } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

const fmtFullTime = (iso: string) => {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return `${time} ${date}`;
};

export default function NotificationBell({
  messages,
  onOpenWarehouse,
  onMarkAllRead,
  onMarkRead,
}: {
  messages: ZaloMessage[];
  onOpenWarehouse: (warehouse: number) => void;
  onMarkAllRead?: () => void;
  onMarkRead?: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread" | "read">("all");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Lưu và đồng bộ trạng thái đã đọc từ localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("lua_nhut_read_notifications");
      if (stored) {
        setReadIds(new Set(JSON.parse(stored)));
      }
    } catch (e) {
      console.warn("Lỗi đọc read_notifications từ localStorage", e);
    }
  }, []);

  const saveReadIds = (newSet: Set<string>) => {
    setReadIds(newSet);
    try {
      localStorage.setItem("lua_nhut_read_notifications", JSON.stringify(Array.from(newSet)));
    } catch (e) {
      console.warn("Lỗi ghi read_notifications vào localStorage", e);
    }
  };

  // Click ngoài đóng dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Đếm số lượng chưa đọc (kết hợp cả cờ từ DB và readIds local)
  const unreadCount = useMemo(() => {
    return messages.filter((m) => !readIds.has(m.id) && !m.read).length;
  }, [messages, readIds]);

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      const isRead = readIds.has(m.id) || !!m.read;
      if (tab === "unread") return !isRead;
      if (tab === "read") return isRead;
      return true;
    });
  }, [messages, tab, readIds]);

  const handleMarkItemRead = (id: string) => {
    const next = new Set(readIds);
    next.add(id);
    saveReadIds(next);
    if (onMarkRead) {
      onMarkRead(id);
    }
  };

  const handleMarkAll = () => {
    const next = new Set(readIds);
    messages.forEach((m) => next.add(m.id));
    saveReadIds(next);
    if (onMarkAllRead) {
      onMarkAllRead();
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* NÚT CHUÔNG THÔNG BÁO */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition active:scale-95 shadow-2xs cursor-pointer"
        title="Thông báo nhật ký Zalo"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white ring-2 ring-white animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* DROPDOWN MENU - Định vị chuẩn trên cả Mobile và Desktop */}
      {isOpen && (
        <div className="fixed inset-x-2 top-14 sm:inset-x-auto sm:right-4 sm:top-14 sm:w-[420px] rounded-2xl border border-slate-200 bg-white shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* HEADER DROPDOWN */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900">Thông báo kho</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-700">
                  {unreadCount} mới
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Đọc tất cả</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>
          </div>

          {/* TABS PHÂN LOẠI */}
          <div className="flex border-b border-slate-100 bg-slate-50/40 px-2 py-1.5 gap-1 text-xs">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`flex-1 rounded-lg py-1 text-center font-bold transition cursor-pointer ${
                tab === "all"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Tất cả ({messages.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("unread")}
              className={`flex-1 rounded-lg py-1 text-center font-bold transition cursor-pointer ${
                tab === "unread"
                  ? "bg-white text-rose-700 shadow-2xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Chưa đọc ({unreadCount})
            </button>
            <button
              type="button"
              onClick={() => setTab("read")}
              className={`flex-1 rounded-lg py-1 text-center font-bold transition cursor-pointer ${
                tab === "read"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Đã đọc ({messages.length - unreadCount})
            </button>
          </div>

          {/* DANH SÁCH THÔNG BÁO */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {filteredMessages.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Không có thông báo nào trong mục này
              </div>
            ) : (
              filteredMessages.map((m) => {
                const isRead = readIds.has(m.id) || !!m.read;
                const isSuccess = m.status === "ok";

                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      handleMarkItemRead(m.id);
                      if (m.warehouse) {
                        onOpenWarehouse(m.warehouse);
                        setIsOpen(false);
                      }
                    }}
                    className={`p-3 flex items-start gap-2.5 transition cursor-pointer hover:bg-slate-50 ${
                      !isRead ? "bg-emerald-50/30" : "bg-white"
                    }`}
                  >
                    {/* ICON TRẠNG THÁI */}
                    <div className="mt-0.5 shrink-0">
                      {isSuccess ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-500" />
                      )}
                    </div>

                    {/* NỘI DUNG */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {m.warehouse ? (
                            <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              Kho {pad(m.warehouse)}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1 rounded">
                              Chung
                            </span>
                          )}
                          <span className="font-mono text-xs font-semibold text-slate-800 truncate max-w-[160px]">
                            {m.message}
                          </span>
                        </div>

                        {!isRead && (
                          <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" title="Chưa đọc" />
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        {m.detail}
                      </p>

                      <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmtFullTime(m.createdAt)}
                        </span>
                        {m.warehouse && (
                          <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                            Xem kho <ChevronRight className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
