"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Delete, KeyRound, AlertCircle, Sparkles } from "lucide-react";
import { APP_VERSION } from "@/lib/version";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [shake, setShake] = useState<boolean>(false);

  // Auto redirect nếu đã có session hợp lệ
  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => {
        if (res.ok) router.replace("/");
      })
      .catch(() => undefined);
  }, [router]);

  // Haptic vibration feedback nhẹ nhàng khi chạm phím trên smartphone
  const triggerHaptic = (pattern: number | number[] = 15) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignored
      }
    }
  };

  const handleKeyPress = (digit: string) => {
    if (loading) return;
    triggerHaptic(12);
    setError("");
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 4) {
        verifyPinCode(nextPin);
      }
    }
  };

  const handleDelete = () => {
    if (loading) return;
    triggerHaptic(15);
    setError("");
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (loading) return;
    triggerHaptic(20);
    setError("");
    setPin("");
  };

  const verifyPinCode = async (codeToVerify: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: codeToVerify }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Mã PIN không chính xác");
      }

      // Đăng nhập thành công! Rung xúc giác báo thành công & chuyển trang mượt mà
      triggerHaptic([30, 50, 40]);
      // Dùng window.location.assign để đảm bảo cookie mới được load đầy đủ trên Mobile WebKit/Safari
      if (typeof window !== "undefined") {
        window.location.assign("/");
      } else {
        router.replace("/");
      }
    } catch (err) {
      triggerHaptic([50, 40, 50]);
      setError(err instanceof Error ? err.message : "Mã PIN không đúng");
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setPin("");
      }, 500);
    } finally {
      setLoading(false);
    }
  };

  // Lắng nghe bàn phím máy tính (Desktop/Laptop)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        handleKeyPress(e.key);
      } else if (e.key === "Backspace") {
        handleDelete();
      } else if (e.key === "Escape") {
        handleClear();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pin, loading]);

  const keypadNumbers = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
  ];

  return (
    <main className="relative min-h-[100dvh] w-full flex flex-col justify-between items-center bg-gradient-to-b from-slate-50 via-emerald-50/30 to-slate-100 text-slate-800 select-none overflow-y-auto px-4 pt-3 pb-4 sm:py-8" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))", paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
      {/* Decorative Light Background Accents */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-400/15 rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-teal-400/10 rounded-full blur-[90px] pointer-events-none" />

      {/* Top Header / Branding - Theme Sáng */}
      <header className="relative z-10 flex flex-col items-center text-center mt-1 sm:mt-4">
        <div className="relative mb-2 sm:mb-3 flex items-center justify-center">
          <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 p-[2px] shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full rounded-[14px] bg-white flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-600" />
            </div>
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4.5 w-4.5 bg-emerald-600 items-center justify-center text-[9px] font-bold text-white shadow-sm">✓</span>
          </span>
        </div>

        <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 flex items-center gap-1.5">
          Xưởng Lũa Nhựt
        </h1>
        <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 max-w-[260px]">
          Quản lý định vị sản phẩm & kho hàng thời gian thực
        </p>
      </header>

      {/* Center PIN Display & Status */}
      <div className="relative z-10 w-full max-w-xs flex flex-col items-center my-auto py-2 sm:py-3">
        <div className="flex items-center gap-1.5 mb-2 sm:mb-3 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">
          <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
          <span>Nhập mã PIN truy cập</span>
        </div>

        {/* PIN Indicators (4 Dots / Digits) - Light Glass Style */}
        <div
          className={`flex items-center justify-center gap-3.5 py-2.5 px-6 rounded-2xl bg-white/95 border border-slate-200/90 shadow-md shadow-slate-200/50 backdrop-blur-xl transition-all duration-200 ${
            shake ? "-translate-x-2 animate-pulse border-rose-400 shadow-rose-200/50" : ""
          }`}
        >
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            const isCurrent = pin.length === index;
            return (
              <div
                key={index}
                className={`relative w-4 h-4 rounded-full transition-all duration-200 flex items-center justify-center ${
                  isFilled
                    ? "bg-emerald-600 shadow-md shadow-emerald-500/40 scale-110"
                    : isCurrent
                    ? "border-2 border-emerald-500 bg-emerald-50 scale-105"
                    : "border-2 border-slate-300 bg-slate-100"
                }`}
              >
                {isFilled && (
                  <span className="w-1.5 h-1.5 bg-white rounded-full" />
                )}
              </div>
            );
          })}
        </div>

        {/* Notification / Error message */}
        <div className="min-h-[26px] mt-2 flex items-center justify-center text-center">
          {loading ? (
            <p className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-emerald-700 animate-pulse">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
              Đang xác thực thông tin...
            </p>
          ) : error ? (
            <p className="flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-0.5 rounded-full shadow-sm">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
              {error}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 font-medium">
              Chạm 4 số mã bảo mật được cấp
            </p>
          )}
        </div>
      </div>

      {/* Modern Custom On-Screen Keypad - Giao Diện Sáng Tinh Tế & Vừa Vặn Mobile */}
      <div className="relative z-10 w-full max-w-[280px] sm:max-w-[310px] mb-1 sm:mb-4">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 place-items-center">
          {keypadNumbers.map((row) =>
            row.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                disabled={loading}
                className="w-15 h-15 sm:w-18 sm:h-18 rounded-full bg-white hover:bg-slate-50 border border-slate-200/90 active:border-emerald-500 text-2xl font-bold text-slate-800 hover:text-emerald-700 flex flex-col items-center justify-center active:scale-90 active:bg-emerald-50 transition-all duration-100 shadow-sm shadow-slate-200 active:shadow-inner cursor-pointer touch-manipulation"
              >
                <span>{num}</span>
              </button>
            ))
          )}

          {/* Bottom row: Clear, 0, Backspace */}
          <button
            type="button"
            onClick={handleClear}
            disabled={loading || pin.length === 0}
            className="w-15 h-15 sm:w-18 sm:h-18 rounded-full bg-slate-100 hover:bg-slate-200/80 active:bg-slate-200 text-[10px] font-bold text-slate-600 hover:text-slate-800 flex items-center justify-center active:scale-90 transition-all duration-100 disabled:opacity-25 disabled:pointer-events-none cursor-pointer touch-manipulation"
          >
            XÓA HẾT
          </button>

          <button
            type="button"
            onClick={() => handleKeyPress("0")}
            disabled={loading}
            className="w-15 h-15 sm:w-18 sm:h-18 rounded-full bg-white hover:bg-slate-50 border border-slate-200/90 active:border-emerald-500 text-2xl font-bold text-slate-800 hover:text-emerald-700 flex items-center justify-center active:scale-90 active:bg-emerald-50 transition-all duration-100 shadow-sm shadow-slate-200 active:shadow-inner cursor-pointer touch-manipulation"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || pin.length === 0}
            className="w-15 h-15 sm:w-18 sm:h-18 rounded-full bg-slate-100 hover:bg-rose-50 active:bg-rose-100 text-slate-600 hover:text-rose-600 flex items-center justify-center active:scale-90 transition-all duration-100 disabled:opacity-25 disabled:pointer-events-none cursor-pointer touch-manipulation"
          >
            <Delete className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>

      {/* Footer Info & Version */}
      <footer className="relative z-10 text-center pb-1 flex flex-col items-center gap-1">
        <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
          Dành riêng cho nhân viên thủ kho & quản lý Xưởng Lũa Nhựt
        </p>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-200/60 text-slate-600 border border-slate-300/60">
          Phiên bản v{APP_VERSION}
        </span>
      </footer>
    </main>
  );
}
