"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X, AlertCircle } from "lucide-react";

const FORMATS = ["code_128", "ean_13", "qr_code", "ean_8", "upc_a", "code_39"];

export default function BarcodeScanner({
  isOpen,
  onDetect,
  onClose,
}: {
  isOpen: boolean;
  onDetect: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let rafId = 0;
    let stream: MediaStream | null = null;
    let zxingStop: (() => void) | null = null;
    let lastCode = "";
    let lastAt = 0;

    const handleCode = (code: string) => {
      const now = Date.now();
      // Chặn 2 lần detect cùng mã trong 500ms (tránh lặp)
      if (code === lastCode && now - lastAt < 500) return;
      lastCode = code;
      lastAt = now;
      onDetect(code.trim());
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        // Ưu tiên BarcodeDetector native (Chrome/Android)
        if ("BarcodeDetector" in window && window.BarcodeDetector) {
          const detector = new window.BarcodeDetector({ formats: FORMATS });
          const loop = async () => {
            if (cancelled) return;
            try {
              const results = await detector.detect(video);
              if (results.length > 0 && results[0].rawValue) {
                handleCode(results[0].rawValue);
                return;
              }
            } catch {}
            rafId = requestAnimationFrame(loop);
          };
          rafId = requestAnimationFrame(loop);
          return;
        }

        // Fallback ZXing (iOS Safari không có BarcodeDetector)
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result && !cancelled) handleCode(result.getText());
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        zxingStop = () => controls.stop();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setError("Cần cho phép camera (đang dùng HTTPS)");
        } else {
          setError("Không mở được camera trên thiết bị này");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      zxingStop?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [isOpen, onDetect]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col bg-slate-950/95 animate-in fade-in duration-150">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-2 text-white">
          <Camera className="h-5 w-5 text-emerald-400" />
          <span className="text-sm font-bold">Quét mã vạch / QR trên tem</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:text-white transition cursor-pointer"
          title="Đóng camera"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-700 bg-rose-950/60 px-4 py-3 text-sm font-semibold text-rose-200">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        ) : (
          <div className="relative w-full max-w-lg">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="w-full rounded-2xl border border-emerald-500/50 bg-black shadow-2xl"
            />
            <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.35)]" />
            <p className="mt-3 text-center text-xs text-slate-300 font-medium">
              Đưa mã vạch / QR trên tem vào khung quét
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
