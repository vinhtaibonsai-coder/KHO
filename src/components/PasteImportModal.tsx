"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { 
  ClipboardPaste, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Warehouse as WarehouseIcon, 
  ArrowRight,
  ListChecks
} from "lucide-react";

import type { Item } from "@/types";
import { extractValidSkusFromText } from "@/lib/sku-rules";

const pad = (n: number) => String(n).padStart(2, "0");

export default function PasteImportModal({
  isOpen,
  onClose,
  onSuccess,
  defaultWarehouse = 1,
  existingItems = [],
  totalWarehouses = 30,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: { warehouse: number; skus: string[] }) => void;
  defaultWarehouse?: number;
  existingItems?: Item[];
  totalWarehouses?: number;
}) {
  const [warehouse, setWarehouse] = useState<number>(defaultWarehouse);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  // Chặn double-click trong cùng 1 tick (state `loading` chỉ cập nhật sau tick)
  const isSubmittingRef = useRef(false);

  // Luôn đồng bộ kho đích được chọn với kho mở modal (defaultWarehouse)
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setWarehouse(defaultWarehouse);
      setStatus(null);
    }
  }

  // Khóa cứng cuộn trang nền ngoài chuẩn Mobile PWA (iOS Safari & Android Chrome)
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPosition = document.body.style.position;
    const originalBodyTop = document.body.style.top;
    const originalBodyWidth = document.body.style.width;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.position = originalBodyPosition;
      document.body.style.top = originalBodyTop;
      document.body.style.width = originalBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // Tự động phân loại xem trước: Mã Hợp Lệ, Mã Trùng (Kho Này hoặc Kho Khác hoặc lặp lại), Mã Lỗi/Sai Chuẩn
  const analysis = useMemo(() => {
    const res = extractValidSkusFromText(rawText);
    
    // Map tra cứu vị trí kho hiện tại của các mã (chỉ tính mã chưa bán/active)
    const itemMap = new Map<string, number>();
    for (const it of existingItems) {
      if (it.status !== "sold") {
        itemMap.set(it.sku, it.warehouse);
      }
    }

    const availableSkus: typeof res.details = [];
    const duplicateSkus: { sku: string; existingWarehouse: number; reason: string }[] = [];
    const seenInText = new Set<string>();

    for (const d of res.details) {
      const code = d.normalizedSku;

      // 1. Kiểm tra lặp lại nhiều lần ngay trong đoạn text vừa dán
      if (seenInText.has(code)) {
        duplicateSkus.push({
          sku: code,
          existingWarehouse: warehouse,
          reason: "Lặp lại trong danh sách",
        });
        continue;
      }
      seenInText.add(code);

      // 2. Kiểm tra tồn tại trong kho
      const curWh = itemMap.get(code);
      if (curWh !== undefined) {
        if (curWh === warehouse) {
          duplicateSkus.push({
            sku: code,
            existingWarehouse: curWh,
            reason: `Đã có trong Kho ${pad(warehouse)}`,
          });
        } else {
          duplicateSkus.push({
            sku: code,
            existingWarehouse: curWh,
            reason: `Đang ở Kho ${pad(curWh)}`,
          });
        }
      } else {
        availableSkus.push(d);
      }
    }

    return {
      availableSkus,
      duplicateSkus,
      invalidSkus: res.invalidSkus,
      totalValid: res.validSkus.length,
    };
  }, [rawText, existingItems, warehouse]);

  if (!isOpen) return null;

  async function handleImport() {
    if (isSubmittingRef.current) return;
    if (analysis.availableSkus.length === 0) {
      setStatus({
        type: "error",
        msg: "Không có mã hợp lệ nào sẵn sàng để nạp (các mã hoặc bị lỗi quy chuẩn hoặc đang bị trùng ở kho khác).",
      });
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/items/batch-paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouse, text: rawText }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không thể nạp mã vào kho");
      }

      setStatus({
        type: "success",
        msg: `Thành công! Đã nạp ${data.totalFound} mã hàng vào Kho ${pad(warehouse)}.`,
      });

      onSuccess({ warehouse, skus: data.skus });

      setTimeout(() => {
        onClose();
        setRawText("");
        setStatus(null);
      }, 1200);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Lỗi khi gửi dữ liệu lên máy chủ";
      setStatus({
        type: "error",
        msg: errorMsg,
      });
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  }

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200 touch-none overscroll-none"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] sm:max-h-[90vh] h-[88vh] sm:h-auto w-full max-w-2xl flex flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <ClipboardPaste className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Dán Đoạn Chat Zalo Cũ · Tự Bóc Tách Mã Hàng
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Copy tin nhắn từ Zalo dán vào đây, hệ thống tự lọc mã và nạp vào kho
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div 
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain touch-pan-y"
          style={{ WebkitOverflowScrolling: "touch" }}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {/* CHỌN KHO ĐÍCH */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
              <WarehouseIcon className="h-4 w-4 text-emerald-600" />
              1. Chọn Kho Cần Nạp Hàng (Kho 1 - Kho {pad(totalWarehouses)})
            </label>
            <select
              value={warehouse}
              onChange={(e) => setWarehouse(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 shadow-2xs focus:border-emerald-500 focus:outline-none focus:ring-3 focus:ring-emerald-500/10 cursor-pointer"
            >
              {Array.from({ length: totalWarehouses }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Kho {pad(n)} (KHO_{pad(n)})
                </option>
              ))}
            </select>
          </div>

          {/* Ô DÁN ĐOẠN CHAT */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                2. Dán Nội Dung Tin Nhắn Zalo Vào Đây (Ctrl + V)
              </label>
              {rawText && (
                <button
                  type="button"
                  onClick={() => setRawText("")}
                  className="text-xs text-slate-400 hover:text-rose-600 font-medium cursor-pointer"
                >
                  Xóa trắng
                </button>
              )}
            </div>
            <textarea
              rows={5}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Ví dụ đoạn chat bạn copy từ Zalo:&#10;&#10;Huy: +E90.100 em nhập kho nhé&#10;Nam: có thêm K100.101, S100.02, P150.12&#10;và các mã PT395, PCT124, BC12 nữa..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3.5 font-mono text-xs text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-emerald-500/10 placeholder:text-slate-400"
            />
          </div>

          {/* BẢNG QUY TẮC SIZE & TIỀN TỐ THEO CHUẨN */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs space-y-2">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              📌 Bảng Quy Chuẩn Hợp Lệ Của Kho:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div className="rounded-lg bg-white border border-slate-200 p-2 space-y-1">
                <span className="font-bold text-emerald-800">1. Mã có Size:</span>
                <p>Tiền tố: <strong className="text-slate-900 font-mono">E, K, P, S</strong></p>
                <p>Chỉ chấp nhận các size: <strong className="text-emerald-700 font-mono">60, 80, 90, 100, 120, 135, 150, 160</strong></p>
                <p className="text-slate-400">VD: <span className="font-mono text-slate-700">E90.100, E120.584, K100.101, S100.02, P150.12</span></p>
              </div>

              <div className="rounded-lg bg-white border border-slate-200 p-2 space-y-1">
                <span className="font-bold text-blue-800">2. Mã không có Size:</span>
                <p>Tiền tố cố định: <strong className="text-slate-900 font-mono">PT, PCT, BC</strong> + Số thứ tự</p>
                <p className="text-slate-400">VD: <span className="font-mono text-slate-700">PT395, PCT124, BC12</span></p>
                <p className="text-rose-600 font-medium">* Ngăn chặn hoàn toàn mọi mã trùng kho</p>
              </div>
            </div>
          </div>

          {/* KẾT QUẢ BÓC TÁCH THỜI GIAN THỰC (PREVIEW) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ListChecks className="h-4 w-4 text-emerald-600" />
                Kết Quả Bóc Tách Tự Động:
              </span>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">
                  {analysis.availableSkus.length} Hợp lệ
                </span>
                {analysis.duplicateSkus.length > 0 && (
                  <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                    {analysis.duplicateSkus.length} Trùng
                  </span>
                )}
                {analysis.invalidSkus.length > 0 && (
                  <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5">
                    {analysis.invalidSkus.length} Sai chuẩn
                  </span>
                )}
              </div>
            </div>

            {/* KHỐI 1: MÃ HỢP LỆ */}
            {analysis.availableSkus.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                  ✓ Mã hợp lệ sẵn sàng nạp vào Kho {pad(warehouse)}:
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-white rounded-lg border border-emerald-200">
                  {analysis.availableSkus.map((d) => (
                    <span
                      key={d.normalizedSku}
                      className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-300 px-2 py-0.5 text-xs shadow-2xs"
                    >
                      <span className="font-mono font-extrabold text-slate-900">
                        {d.normalizedSku}
                      </span>
                      {d.type === "sized" && (
                        <span className="rounded bg-emerald-200/70 text-emerald-900 text-[10px] font-bold px-1">
                          Size {d.size}
                        </span>
                      )}
                      {d.type === "fixed" && (
                        <span className="rounded bg-blue-100 text-blue-800 text-[10px] font-bold px-1">
                          {d.prefix}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* KHỐI 2: MÃ BỊ TRÙNG */}
            {analysis.duplicateSkus.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                  ⚠ Mã bị trùng (Đã có trong kho hoặc lặp lại, sẽ tự động bỏ qua):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-white rounded-lg border border-amber-200">
                  {analysis.duplicateSkus.map((d, idx) => (
                    <span
                      key={`${d.sku}-${idx}`}
                      className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-300 px-2 py-0.5 text-xs shadow-2xs text-amber-900"
                    >
                      <span className="font-mono font-bold line-through text-slate-500">{d.sku}</span>
                      <span className="font-bold text-[10px] bg-amber-200 px-1 rounded text-amber-900">
                        {d.reason}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* KHỐI 3: MÃ SAI QUY CHUẨN / BỊ LỖI */}
            {analysis.invalidSkus.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1">
                  ✕ Mã sai quy chuẩn hoặc bị lỗi:
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-white rounded-lg border border-rose-200">
                  {analysis.invalidSkus.map((d, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded bg-rose-50 border border-rose-300 px-2 py-0.5 text-xs shadow-2xs text-rose-900"
                      title={d.error}
                    >
                      <span className="font-mono font-bold text-rose-700">{d.raw}</span>
                      <span className="text-[10px] text-rose-600 italic">({d.error})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis.availableSkus.length === 0 && analysis.duplicateSkus.length === 0 && analysis.invalidSkus.length === 0 && (
              <p className="text-xs text-slate-400 italic">
                Chưa phát hiện mã nào. Hãy dán đoạn chat có mã (VD: E90.100, E120.584, K100.101, PT395...)
              </p>
            )}
          </div>

          {/* THÔNG BÁO TRẠNG THÁI */}
          {status && (
            <div
              className={`flex items-center gap-2 rounded-xl p-3 text-xs font-medium ${
                status.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {status.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{status.msg}</span>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div 
          className="border-t border-slate-200 bg-slate-50 px-4 sm:px-6 py-3.5 flex justify-between items-center shrink-0"
          style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            disabled={loading || analysis.availableSkus.length === 0}
            onClick={handleImport}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <span>Đang lưu vào kho...</span>
            ) : (
              <>
                <span>Nạp {analysis.availableSkus.length} Mã Hợp Lệ Vào Kho {pad(warehouse)}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
