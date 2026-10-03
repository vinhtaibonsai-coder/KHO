"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { 
  Bell, 
  CheckCheck, 
  Clock, 
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  Tag,
  AlertTriangle,
  Cpu,
  Search,
  X
} from "lucide-react";
import type { ZaloMessage, NotificationCategory } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

const fmtFullTime = (iso: string) => {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return `${time} ${date}`;
};

// Hàm tô sáng (highlight) từ khóa tìm kiếm trong chuỗi văn bản
function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim() || !text) return <>{text}</>;
  const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-yellow-200 text-amber-950 font-bold px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

// Hàm phân loại thông báo chuẩn xác với thứ tự ưu tiên tối ưu:
// duplicate -> sold -> error -> out -> in (hoặc system nếu là tin hệ thống)
export function categorizeMessage(m: ZaloMessage): Exclude<NotificationCategory, "all"> {
  const msgText = (m.message || "").toUpperCase();
  const detailText = (m.detail || "").toUpperCase();
  const full = `${msgText} ${detailText}`;

  // 1. Trùng mã: Có thông báo trùng mã rõ ràng
  if (
    full.includes("CẢNH BÁO TRÙNG MÃ") || 
    full.includes("TRÙNG MÃ") || 
    full.includes("BỎ QUA TRÙNG") ||
    full.includes("KHÔNG THỂ NẠP TRÙNG")
  ) {
    return "duplicate";
  }

  // 2. Đã bán
  if (
    full.includes("ĐÃ BÁN") || 
    full.includes("SOLD") ||
    full.includes("ĐÃ ĐƯỢC BÁN")
  ) {
    return "sold";
  }

  // 3. Tin lỗi: Nếu status = error hoặc có lỗi cú pháp, lỗi nhận diện kho
  if (
    m.status === "error" || 
    full.includes("LỖI") || 
    full.includes("KHÔNG HỢP LỆ") || 
    full.includes("KHÔNG NHẬN DIỆN")
  ) {
    return "error";
  }

  // 4. Xuất kho & Chuyển kho (status = ok)
  if (
    full.includes("XUẤT KHO") || 
    full.includes("ĐÃ XUẤT") || 
    full.includes("CHUYỂN KHO") || 
    full.includes("ĐÃ CHUYỂN MÃ") ||
    msgText.startsWith("-") || 
    msgText.startsWith("XK") || 
    msgText.startsWith("CK")
  ) {
    return "out";
  }

  // 5. Hệ thống: thông báo cấu hình kho hoặc thông báo từ admin/bot
  if (
    m.groupId === "SYSTEM" || 
    full.includes("HỆ THỐNG") || 
    full.includes("TẠO THÊM KHO") ||
    full.includes("KHỞI ĐỘNG")
  ) {
    return "system";
  }

  // 6. Nhập kho: Mặc định các tin nạp mã / gán vị trí kho
  return "in";
}

const CATEGORY_CONFIG: Record<
  Exclude<NotificationCategory, "all">,
  { label: string; icon: React.ComponentType<{ className?: string }>; badgeBg: string; badgeText: string; border: string }
> = {
  in: {
    label: "Nhập kho",
    icon: ArrowDownLeft,
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-800",
    border: "border-emerald-300",
  },
  out: {
    label: "Xuất kho",
    icon: ArrowUpRight,
    badgeBg: "bg-indigo-100",
    badgeText: "text-indigo-800",
    border: "border-indigo-300",
  },
  duplicate: {
    label: "Trùng mã",
    icon: ShieldAlert,
    badgeBg: "bg-purple-100",
    badgeText: "text-purple-800",
    border: "border-purple-300",
  },
  sold: {
    label: "Đã bán",
    icon: Tag,
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
    border: "border-amber-300",
  },
  error: {
    label: "Lỗi",
    icon: AlertTriangle,
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-800",
    border: "border-rose-300",
  },
  system: {
    label: "Hệ thống",
    icon: Cpu,
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-800",
    border: "border-slate-300",
  },
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
  const [readTab, setReadTab] = useState<"all" | "unread" | "read">("all");
  const [categoryTab, setCategoryTab] = useState<NotificationCategory>("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus ô tìm kiếm khi mở dropdown nếu muốn hoặc khi người dùng click
  useEffect(() => {
    if (!isOpen) {
      setSearchKeyword("");
    }
  }, [isOpen]);

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

  // Lọc bỏ tin PING rác (chặn triệt để cả hoa lẫn thường)
  const cleanMessages = useMemo(() => {
    return messages.filter(
      (m) =>
        m.id !== "bot_heartbeat" &&
        (m.message || "").trim().toUpperCase() !== "PING" &&
        m.groupId !== "SYSTEM"
    );
  }, [messages]);

  // Đếm số lượng chưa đọc tổng thể
  const unreadCount = useMemo(() => {
    return cleanMessages.filter((m) => !readIds.has(m.id) && !m.read).length;
  }, [cleanMessages, readIds]);

  // Lọc theo từ khóa tìm kiếm (mã sản phẩm, tên kho, chi tiết, tin nhắn...)
  const searchedMessages = useMemo(() => {
    const q = searchKeyword.trim().toUpperCase();
    if (!q) return cleanMessages;
    return cleanMessages.filter((m) => {
      const msgUpper = (m.message || "").toUpperCase();
      const detailUpper = (m.detail || "").toUpperCase();
      const whUpper = m.warehouse !== null && m.warehouse !== undefined 
        ? `KHO ${m.warehouse} KHO ${pad(m.warehouse)} ${pad(m.warehouse)}` 
        : "CHUNG";
      return (
        msgUpper.includes(q) ||
        detailUpper.includes(q) ||
        whUpper.includes(q)
      );
    });
  }, [cleanMessages, searchKeyword]);

  // Đếm số lượng theo trạng thái đọc dựa trên kết quả tìm kiếm hiện tại
  const readStats = useMemo(() => {
    let unread = 0;
    let read = 0;
    for (const m of searchedMessages) {
      const isRead = readIds.has(m.id) || !!m.read;
      if (isRead) read++;
      else unread++;
    }
    return {
      all: searchedMessages.length,
      unread,
      read,
    };
  }, [searchedMessages, readIds]);

  // Danh sách tin đã lọc theo trạng thái đọc (readTab) kết hợp từ khóa tìm kiếm
  const readFilteredMessages = useMemo(() => {
    return searchedMessages.filter((m) => {
      const isRead = readIds.has(m.id) || !!m.read;
      if (readTab === "unread") return !isRead;
      if (readTab === "read") return isRead;
      return true;
    });
  }, [searchedMessages, readTab, readIds]);

  // Map phân loại tin 1 lần duy nhất cho toàn bộ danh sách hiện tại (tránh gọi categorize nhiều lần)
  const messageCategoryMap = useMemo(() => {
    const map = new Map<string, Exclude<NotificationCategory, "all">>();
    for (const m of readFilteredMessages) {
      map.set(m.id, categorizeMessage(m));
    }
    return map;
  }, [readFilteredMessages]);

  // Đếm số lượng cho từng danh mục đồng bộ theo readTab và searchKeyword
  const categoryCounts = useMemo(() => {
    const counts: Record<NotificationCategory, number> = {
      all: readFilteredMessages.length,
      in: 0,
      out: 0,
      duplicate: 0,
      sold: 0,
      error: 0,
      system: 0,
    };
    for (const m of readFilteredMessages) {
      const cat = messageCategoryMap.get(m.id) || "in";
      counts[cat]++;
    }
    return counts;
  }, [readFilteredMessages, messageCategoryMap]);

  // Danh sách thông báo cuối cùng sau khi lọc cả searchKeyword, readTab và categoryTab
  const filteredMessages = useMemo(() => {
    if (categoryTab === "all") return readFilteredMessages;
    return readFilteredMessages.filter((m) => (messageCategoryMap.get(m.id) || "in") === categoryTab);
  }, [readFilteredMessages, categoryTab, messageCategoryMap]);

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
    cleanMessages.forEach((m) => next.add(m.id));
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
        className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition active:scale-95 shadow-2xs cursor-pointer z-50"
        title="Thông báo nhật ký Zalo"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white ring-2 ring-white animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* LỚP NỀN MỜ (BACKDROP OVERLAY) - Che mờ toàn bộ giao diện bên dưới, bấm ra ngoài thì đóng */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      {/* DROPDOWN MENU - Định vị chuẩn trên cả Mobile và Desktop */}
      {isOpen && (
        <div className="fixed inset-x-2 top-14 sm:inset-x-auto sm:right-4 sm:top-14 sm:w-[480px] rounded-2xl border border-slate-200/90 bg-white shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          
          {/* HEADER DROPDOWN */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-4 py-3">
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

          {/* THANH TÌM KIẾM MÃ / THÔNG BÁO */}
          <div className="px-3 py-2 bg-slate-50/70 border-b border-slate-100">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Tìm mã sản phẩm (vd: 192, 100a), tên kho, nội dung..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition shadow-2xs"
              />
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchKeyword("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
                  title="Xóa tìm kiếm"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* TẦNG 1: LỌC TRẠNG THÁI ĐỌC */}
          <div className="flex border-b border-slate-100 bg-slate-50/50 px-3 py-1.5 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setReadTab("all")}
              className={`flex-1 rounded-lg py-1 text-center font-bold transition cursor-pointer ${
                readTab === "all"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Tất cả ({readStats.all})
            </button>
            <button
              type="button"
              onClick={() => setReadTab("unread")}
              className={`flex-1 rounded-lg py-1 text-center font-bold transition cursor-pointer ${
                readTab === "unread"
                  ? "bg-white text-rose-700 shadow-2xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Chưa đọc ({readStats.unread})
            </button>
            <button
              type="button"
              onClick={() => setReadTab("read")}
              className={`flex-1 rounded-lg py-1 text-center font-bold transition cursor-pointer ${
                readTab === "read"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Đã đọc ({readStats.read})
            </button>
          </div>

          {/* TẦNG 2: THANH CUỘN 6 DANH MỤC PHÂN LOẠI CHI TIẾT */}
          <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 border-b border-slate-100 bg-white no-scrollbar text-xs">
            <button
              type="button"
              onClick={() => setCategoryTab("all")}
              className={`shrink-0 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                categoryTab === "all"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Tất cả
            </button>

            {(Object.keys(CATEGORY_CONFIG) as Array<Exclude<NotificationCategory, "all">>).map((key) => {
              const cfg = CATEGORY_CONFIG[key];
              const Icon = cfg.icon;
              const count = categoryCounts[key];
              const isSelected = categoryTab === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategoryTab(key)}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer border ${
                    isSelected
                      ? `${cfg.badgeBg} ${cfg.badgeText} ${cfg.border} ring-2 ring-slate-400/20 shadow-2xs`
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{cfg.label}</span>
                  {count > 0 && (
                    <span
                      className={`ml-0.5 rounded-full px-1.5 py-0.1 text-[10px] font-extrabold ${
                        isSelected
                          ? "bg-white/80"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* DANH SÁCH THÔNG BÁO ĐÃ ĐƯỢC PHÂN LOẠI */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {filteredMessages.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-slate-400">
                {searchKeyword ? (
                  <div>
                    <p className="font-semibold text-slate-600 mb-1">
                      Không tìm thấy thông báo nào khớp với &quot;{searchKeyword}&quot;
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Thử đổi từ khóa hoặc xóa tìm kiếm để xem tất cả
                    </p>
                    <button
                      type="button"
                      onClick={() => setSearchKeyword("")}
                      className="mt-3 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer transition text-xs"
                    >
                      Xóa tìm kiếm
                    </button>
                  </div>
                ) : (
                  "Không có thông báo nào trong mục này"
                )}
              </div>
            ) : (
              filteredMessages.map((m) => {
                const isRead = readIds.has(m.id) || !!m.read;
                const cat = categorizeMessage(m);
                const cfg = CATEGORY_CONFIG[cat];
                const Icon = cfg.icon;

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
                      !isRead ? "bg-emerald-50/20" : "bg-white"
                    }`}
                  >
                    {/* ICON DANH MỤC */}
                    <div
                      className={`mt-0.5 p-1.5 rounded-lg border shrink-0 ${cfg.badgeBg} ${cfg.badgeText} ${cfg.border}`}
                      title={cfg.label}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* NỘI DUNG */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* BADGE PHÂN LOẠI */}
                          <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.2 rounded border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.border}`}>
                            {cfg.label}
                          </span>

                          {m.warehouse ? (
                            <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              <HighlightText text={`Kho ${pad(m.warehouse)}`} highlight={searchKeyword} />
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1 rounded">
                              Chung
                            </span>
                          )}

                          <span className="font-mono text-xs font-bold text-slate-800 truncate max-w-[200px]">
                            <HighlightText text={m.message} highlight={searchKeyword} />
                          </span>
                        </div>

                        {!isRead && (
                          <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" title="Chưa đọc" />
                        )}
                      </div>

                      <p className={`text-[11px] leading-relaxed line-clamp-2 ${cat === "duplicate" ? "text-purple-900 font-semibold" : cat === "sold" ? "text-amber-900 font-semibold" : cat === "error" ? "text-rose-700" : "text-slate-600"}`}>
                        <HighlightText text={m.detail} highlight={searchKeyword} />
                      </p>

                      <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmtFullTime(m.createdAt)}
                        </span>
                        {m.warehouse && (
                          <span className="text-emerald-700 font-semibold flex items-center gap-0.5 hover:underline">
                            Mở kho <ChevronRight className="h-3 w-3" />
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
