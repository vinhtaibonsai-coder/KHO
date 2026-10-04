"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Delete, ArrowRight, Sparkles, KeyRound, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [shake, setShake] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto redirect nếu đã có session hợp lệ
  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => {
        if (res.ok) router.replace("/");
      })
      .catch(() => undefined);
  }, [router]);

  // Haptic feedback nhẹ nhàng khi bấm phím trên điện thoại
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

      // Đăng nhập thành công! Haptic thành công & chuyển trang
      triggerHaptic([30, 50, 40]);
      router.replace("/");
      router.refresh();
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
    <main className="relative min-h-[100dvh] w-full flex flex-col justify-between items-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white select-none overflow-hidden px-4 py-6 sm:py-10">
      {/* Decorative Glow Elements */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-80 h-80 bg-emerald-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-80 h-80 bg-teal-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header / Branding */}
      <header className="relative z-10 flex flex-col items-center text-center mt-2 sm:mt-6">
        <div className="relative mb-3 flex items-center justify-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/25">
            <div className="w-full h-full rounded-[22px] bg-slate-950/80 backdrop-blur-md flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-400" />
            </div>
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-5 w-5 bg-emerald-500 items-center justify-center text-[10px] font-bold text-slate-950">✓</span>
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
          Xưởng Lũa Nhựt
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-[280px]">
          Hệ thống quản lý kho & định vị sản phẩm nội bộ
        </p>
      </header>

      {/* Center PIN Display & Status */}
      <div className="relative z-10 w-full max-w-xs flex flex-col items-center my-auto">
        <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
          <span>Nhập mã PIN truy cập</span>
        </div>

        {/* PIN Indicators (4 Dots / Digits) */}
        <div 
          className={`flex items-center justify-center gap-4 py-3 px-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl transition-transform duration-200 ${
            shake ? "translate-x-[-10px] animate-pulse border-rose-500/60" : ""
          }`}
        >
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            const isCurrent = pin.length === index;
            return (
              <div
                key={index}
                className={`relative w-4 h-4 sm:w-5 sm:h-5 rounded-full transition-all duration-300 flex items-center justify-center ${
                  isFilled
                    ? "bg-emerald-400 shadow-md shadow-emerald-500/50 scale-110"
                    : isCurrent
                    ? "border-2 border-emerald-400/80 bg-emerald-500/20 scale-105"
                    : "border-2 border-slate-700 bg-slate-800/60"
                }`}
              >
                {isFilled && (
                  <span className="absolute w-1.5 h-1.5 bg-slate-950 rounded-full" />
                )}
              </div>
            );
          })}
        </div>

        {/* Notification / Error message */}
        <div className="min-h-[28px] mt-3 flex items-center justify-center text-center">
          {loading ? (
            <p className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-emerald-400 animate-pulse">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Đang xác thực thông tin...
            </p>
          ) : error ? (
            <p className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-rose-400 bg-rose-950/40 border border-rose-800/60 px-3 py-1 rounded-full">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </p>
          ) : (
            <p className="text-[11px] sm:text-xs text-slate-500">
              Nhấn 4 số mã bảo mật được cấp
            </p>
          )}
        </div>
      </div>

      {/* Modern Custom On-Screen Keypad */}
      <div className="relative z-10 w-full max-w-[290px] sm:max-w-[320px] mb-2 sm:mb-6">
        <div className="grid grid-cols-3 gap-3 sm:gap-4 place-items-center">
          {keypadNumbers.map((row, rIdx) =>
            row.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                disabled={loading}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-xl sm:text-2xl font-bold text-slate-100 flex flex-col items-center justify-center active:scale-95 active:bg-emerald-600/30 transition-all duration-150 backdrop-blur-md shadow-md shadow-black/20"
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
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-900/40 hover:bg-slate-800/80 text-xs font-bold text-slate-400 hover:text-slate-200 flex items-center justify-center active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            XÓA HẾT
          </button>

          <button
            type="button"
            onClick={() => handleKeyPress("0")}
            disabled={loading}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-xl sm:text-2xl font-bold text-slate-100 flex items-center justify-center active:scale-95 active:bg-emerald-600/30 transition-all duration-150 backdrop-blur-md shadow-md shadow-black/20"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || pin.length === 0}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-900/40 hover:bg-slate-800/80 text-slate-300 hover:text-rose-400 flex items-center justify-center active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <Delete className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <footer className="relative z-10 text-center pb-2">
        <p className="text-[11px] text-slate-600">
          Chỉ dành cho nhân viên thủ kho và quản lý được cấp quyền
        </p>
      </footer>
    </main>
  );
}
