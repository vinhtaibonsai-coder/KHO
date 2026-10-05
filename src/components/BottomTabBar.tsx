"use client";

import { 
  Search, 
  LayoutGrid, 
  ClipboardPaste, 
  Bell, 
  Menu
} from "lucide-react";

export type BottomTabType = "search" | "warehouse" | "paste" | "zalo" | "menu";

export default function BottomTabBar({
  activeTab = "search",
  unreadCount = 0,
  onTabSelect,
}: {
  activeTab: BottomTabType;
  unreadCount?: number;
  onTabSelect: (tab: BottomTabType) => void;
}) {
  const tabs = [
    {
      id: "search" as BottomTabType,
      label: "Tra Cứu",
      icon: Search,
      primaryFocus: true,
    },
    {
      id: "warehouse" as BottomTabType,
      label: "Ô Kho",
      icon: LayoutGrid,
    },
    {
      id: "paste" as BottomTabType,
      label: "Dán Chat",
      icon: ClipboardPaste,
    },
    {
      id: "zalo" as BottomTabType,
      label: "Nhật Ký",
      icon: Bell,
      badge: unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : undefined,
    },
    {
      id: "menu" as BottomTabType,
      label: "Menu",
      icon: Menu,
    },
  ];

  return (
    <div 
      className="fixed bottom-3 sm:bottom-4 left-0 right-0 z-40 flex justify-center pointer-events-none px-4"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Floating Island Capsule theo phong cách GitHub iOS */}
      <nav 
        className="pointer-events-auto flex items-center gap-1 sm:gap-2 px-2 py-1.5 rounded-full bg-white/90 backdrop-blur-xl border border-slate-200/90 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-950/5 max-w-md w-full justify-between select-none animate-in slide-in-from-bottom-3 duration-300"
        aria-label="Thanh điều hướng chính"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabSelect(tab.id)}
              className={`relative flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-full transition-all duration-200 cursor-pointer active:scale-95 ${
                isActive
                  ? "bg-slate-900 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
              }`}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 ${isActive ? "text-emerald-400 stroke-[2.2]" : "text-slate-500"}`} />

                {/* Badge số lượng thông báo chưa đọc */}
                {tab.badge && (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[1rem] px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-mono font-bold text-white shadow-2xs">
                    {tab.badge}
                  </span>
                )}
              </div>

              <span className={`text-[10px] sm:text-[11px] mt-0.5 tracking-tight ${
                isActive ? "font-bold text-white" : "font-medium text-slate-500"
              }`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
