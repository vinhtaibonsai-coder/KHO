"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Search, 
  LayoutGrid, 
  Layers,
  Bell, 
  Menu
} from "lucide-react";

export type BottomTabType = "search" | "warehouse" | "size" | "paste" | "zalo" | "menu";

export default function BottomTabBar({
  activeTab = "search",
  unreadCount = 0,
  onTabSelect,
}: {
  activeTab: BottomTabType;
  unreadCount?: number;
  onTabSelect: (tab: BottomTabType) => void;
}) {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollThreshold = 10; // Ngưỡng cuộn tối thiểu để tránh rung giật nhấp nháy

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY || window.pageYOffset || 0;
          const diff = currentScrollY - lastScrollY.current;

          // Nếu đang ở gần đầu trang (< 60px) thì luôn hiện
          if (currentScrollY < 60) {
            setIsVisible(true);
          } else if (diff > scrollThreshold) {
            // Vuốt xuống -> Ẩn thanh menu như Facebook / Safari iOS
            setIsVisible(false);
          } else if (diff < -scrollThreshold) {
            // Vuốt lên -> Hiện thanh menu trở lại ngay
            setIsVisible(true);
          }

          lastScrollY.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const tabs = [
    {
      id: "warehouse" as BottomTabType,
      label: "Ô Kho",
      icon: LayoutGrid,
    },
    {
      id: "size" as BottomTabType,
      label: "Theo Size",
      icon: Layers,
    },
    {
      id: "search" as BottomTabType,
      label: "Tra Cứu",
      icon: Search,
      isCenter: true,
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
      className={`fixed bottom-3 sm:bottom-4 left-0 right-0 z-40 flex justify-center pointer-events-none px-4 transition-all duration-300 ease-in-out ${
        isVisible 
          ? "translate-y-0 opacity-100" 
          : "translate-y-24 opacity-0 pointer-events-none"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Floating Island Capsule theo phong cách GitHub iOS */}
      <nav 
        className="pointer-events-auto flex items-center gap-1 sm:gap-2 px-2 py-1.5 rounded-full bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-950/5 max-w-md w-full justify-between select-none"
        aria-label="Thanh điều hướng chính"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const isCenter = "isCenter" in tab && tab.isCenter;

          if (isCenter) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabSelect(tab.id)}
                className="relative -top-2 flex flex-col items-center justify-center cursor-pointer group active:scale-95 transition-all"
                title="Tra cứu nhanh sản phẩm"
              >
                <div className={`h-12 w-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 border-2 ${
                  isActive
                    ? "bg-emerald-600 text-white border-white ring-4 ring-emerald-500/25 scale-105 shadow-emerald-600/30"
                    : "bg-emerald-700 text-white border-white hover:bg-emerald-600 shadow-emerald-700/25"
                }`}>
                  <Search className="h-5 w-5 stroke-[2.5]" />
                </div>
                <span className={`text-[10px] sm:text-[11px] mt-0.5 tracking-tight font-black ${
                  isActive ? "text-emerald-700" : "text-emerald-900"
                }`}>
                  {tab.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabSelect(tab.id)}
              className={`relative flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-full transition-all duration-200 cursor-pointer active:scale-95 ${
                isActive
                  ? "bg-emerald-600 text-white font-bold shadow-xs shadow-emerald-600/20"
                  : "text-slate-600 hover:text-emerald-800 hover:bg-emerald-50/60"
              }`}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 ${isActive ? "text-white stroke-[2.2]" : "text-slate-500"}`} />

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
