"use client";

import { useEffect, useState } from "react";
import { registerServiceWorker } from "@/pwa/registerServiceWorker";
import { processSyncQueue } from "@/pwa/syncManager";
import { Sparkles, WifiOff, X, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAProvider() {
  const [updateReloadFn, setUpdateReloadFn] = useState<(() => void) | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // 1. Đăng ký Service Worker với cơ chế cập nhật an toàn (không reload đột ngột)
    registerServiceWorker({
      onUpdateAvailable: (reload) => {
        setUpdateReloadFn(() => reload);
      },
    });

    // 2. Theo dõi kết nối mạng
    const handleOnline = () => {
      setIsOffline(false);
      processSyncQueue();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    const initialNetworkTimer = window.setTimeout(() => setIsOffline(!navigator.onLine), 0);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // 3. Xử lý Install Prompt trên Android/Desktop
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // 4. Phát hiện xem có phải iOS Safari chưa cài Standalone không
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent);

    // Không hiện nếu đã cài standalone hoặc đã xem gần đây
    const hasSeenIosPrompt = localStorage.getItem("lua_nhut_ios_install_seen");
    if (isIos && !isStandalone && !hasSeenIosPrompt) {
      // Chỉ hiện sau khi dùng một lúc (10 giây) để không làm phiền ngay lúc mở
      const timer = setTimeout(() => {
        setShowIosInstall(true);
      }, 10000);
      return () => {
        clearTimeout(timer);
        clearTimeout(initialNetworkTimer);
      };
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      clearTimeout(initialNetworkTimer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
      }
    }
  };

  const dismissIos = () => {
    setShowIosInstall(false);
    localStorage.setItem("lua_nhut_ios_install_seen", "true");
  };

  return (
    <>
      {/* 1. BANNER NGOẠI TUYẾN KHI MẤT MẠNG */}
      {isOffline && (
        <div 
          className="fixed top-0 inset-x-0 z-[99999] bg-amber-500 text-amber-950 px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 shadow-md animate-in slide-in-from-top duration-200"
          style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}
        >
          <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
          <span>Đang chạy ở chế độ Ngoại Tuyến (Offline). Dữ liệu đã lưu vẫn được bảo toàn.</span>
        </div>
      )}

      {/* 2. BANNER CẬP NHẬT PHIÊN BẢN MỚI AN TOÀN (KHÔNG ÉP RELOAD KHI ĐANG DÙNG) */}
      {updateReloadFn && (
        <div 
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-[99999] bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-200"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs font-bold">Có phiên bản ứng dụng mới</p>
              <p className="text-[11px] text-slate-400">Cập nhật để nhận giao diện và tính năng mới nhất</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => updateReloadFn()}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs px-3 py-1.5 rounded-xl transition cursor-pointer active:scale-95"
            >
              Cập nhật
            </button>
            <button
              type="button"
              onClick={() => setUpdateReloadFn(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. BANNER HƯỚNG DẪN THÊM VÀO MÀN HÌNH CHÍNH CHO IPHONE/IPAD */}
      {showIosInstall && (
        <div 
          className="fixed bottom-4 inset-x-4 sm:max-w-md sm:mx-auto z-[99999] bg-white text-slate-900 p-4 rounded-2xl shadow-2xl border border-slate-200 animate-in slide-in-from-bottom duration-200"
          style={{ marginBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Cài Đặt App Vào Màn Hình Chính</h3>
            </div>
            <button onClick={dismissIos} className="text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Để trải nghiệm toàn màn hình như ứng dụng gốc trên iPhone/iPad:
          </p>
          <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs text-slate-700 space-y-1">
            <p>1. Bấm vào nút <strong>Chia sẻ</strong> (biểu tượng ô vuông mũi tên ⬆️ ở thanh dưới cùng Safari).</p>
            <p>2. Cuộn xuống và chọn <strong>&quot;Thêm vào Màn hình chính&quot; (Add to Home Screen)</strong>.</p>
          </div>
        </div>
      )}

      {/* 4. NÚT CÀI ĐẶT NHANH CHO ANDROID / DESKTOP (NẾU BROWSER HỖ TRỢ PROMPT) */}
      {deferredPrompt && (
        <div 
          className="fixed bottom-4 right-4 z-[99999] animate-in fade-in"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-2xl shadow-xl transition active:scale-95 cursor-pointer border border-emerald-500"
          >
            <Download className="h-4 w-4" />
            <span>Cài đặt ứng dụng</span>
          </button>
        </div>
      )}
    </>
  );
}
