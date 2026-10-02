"use client";

import { useState } from "react";
import { 
  X, 
  PlusCircle, 
  Download, 
  FileSpreadsheet, 
  Layers, 
  CheckCircle2, 
  Settings, 
  Info,
  Warehouse,
  ExternalLink,
  ShieldCheck,
  RotateCw,
  Sparkles
} from "lucide-react";
import type { Item, ItemHistory } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

export default function RightMenuDrawer({
  isOpen,
  onClose,
  totalWarehouses,
  items,
  history,
  onAddWarehouse,
  onOpenPaste,
  onFilterSkuType,
}: {
  isOpen: boolean;
  onClose: () => void;
  totalWarehouses: number;
  items: Item[];
  history: ItemHistory[];
  onAddWarehouse: () => Promise<void>;
  onOpenPaste: () => void;
  onFilterSkuType?: (prefix: string) => void;
}) {
  const [addingWh, setAddingWh] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  // Thống kê nhanh theo dòng sản phẩm
  const prefixStats = (() => {
    const map: Record<string, number> = {
      E: 0,
      P: 0,
      K: 0,
      S: 0,
      PT: 0,
      PCT: 0,
      BC: 0,
      Khác: 0,
    };
    for (const it of items) {
      const u = it.sku.toUpperCase();
      if (u.startsWith("PCT")) map["PCT"]++;
      else if (u.startsWith("PT")) map["PT"]++;
      else if (u.startsWith("BC")) map["BC"]++;
      else if (u.startsWith("E")) map["E"]++;
      else if (u.startsWith("P")) map["P"]++;
      else if (u.startsWith("K")) map["K"]++;
      else if (u.startsWith("S")) map["S"]++;
      else map["Khác"]++;
    }
    return map;
  })();

  // Xuất file CSV / Excel danh sách mã kho
  const handleExportCSV = () => {
    setExporting(true);
    try {
      // Header CSV với BOM để Excel tiếng Việt không bị lỗi font
      const BOM = "\uFEFF";
      const headers = ["STT", "Mã SKU", "Kho Vị Trí", "Trạng Thái", "Tên Mặt Hàng", "Số Lượng", "Thời Gian Cập Nhật"];
      const rows = items.map((it, idx) => [
        idx + 1,
        `"${it.sku}"`,
        `"Kho ${pad(it.warehouse)}"`,
        `"${it.status === "sold" ? "Đã bán" : "Còn trong kho"}"`,
        `"${it.name}"`,
        it.qty,
        `"${new Date(it.updatedAt).toLocaleString("vi-VN")}"`,
      ]);

      const csvContent = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Bao_Cao_Kho_Xuong_Lua_Nhut_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Lỗi xuất file CSV:", e);
      alert("Không thể xuất file lúc này");
    } finally {
      setExporting(false);
    }
  };

  const handleCreateWarehouse = async () => {
    const confirmAdd = window.confirm(`Bạn có chắc chắn muốn tạo thêm KHO ${pad(totalWarehouses + 1)} vào hệ thống không?`);
    if (!confirmAdd) return;

    setAddingWh(true);
    try {
      await onAddWarehouse();
      setAddSuccess(`Đã tạo thành công KHO ${pad(totalWarehouses + 1)}!`);
      setTimeout(() => setAddSuccess(null), 4000);
    } catch (e) {
      console.error(e);
      alert("Lỗi khi thêm kho mới");
    } finally {
      setAddingWh(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
          
          {/* HEADER MENU BÊN PHẢI - Thêm pt-safe / pt-12 trên mobile để không bị tai thỏ & camera che */}
          <div className="pt-10 sm:pt-4 px-4 sm:px-5 pb-3 sm:pb-4 border-b border-slate-200 bg-white/95 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                <Settings className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                  Menu Quản Lý & Tiện Ích
                </h2>
                <p className="text-[11px] text-slate-500 font-medium">Xưởng Lũa Nhựt</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer border border-slate-200 bg-slate-50"
              title="Đóng menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* NỘI DUNG CUỘN */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 pb-12">

            {/* THÔNG BÁO THÀNH CÔNG */}
            {addSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{addSuccess}</span>
              </div>
            )}

            {/* 1. QUẢN LÝ Ô KHO & TẠO THÊM KHO */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Warehouse className="h-4 w-4 text-emerald-600" />
                  Hệ Thống Ô Kho Hiện Tại
                </span>
                <span className="font-mono text-xs font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                  {totalWarehouses} Ô KHO
                </span>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Bạn có thể mở rộng thêm kho mới bất kỳ lúc nào. Kho mới được thêm sẽ tự động xuất hiện trên sơ đồ và cho phép nạp/chuyển mã hàng.
                </p>

                <button
                  type="button"
                  disabled={addingWh}
                  onClick={handleCreateWarehouse}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2.5 text-xs font-bold hover:bg-slate-800 transition active:scale-98 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <PlusCircle className="h-4 w-4 text-emerald-400" />
                  <span>{addingWh ? "Đang tạo kho mới..." : `+ Tạo Thêm Kho ${pad(totalWarehouses + 1)}`}</span>
                </button>
              </div>
            </div>

            {/* 2. TÍNH NĂNG XUẤT BÁO CÁO EXCEL / CSV */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Xuất Báo Cáo Kho Hàng
              </span>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Tổng số sản phẩm đang có:</span>
                  <span className="font-bold font-mono text-slate-900">{items.length} mã</span>
                </div>

                <button
                  type="button"
                  disabled={exporting || items.length === 0}
                  onClick={handleExportCSV}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 px-4 py-2.5 text-xs font-bold hover:bg-emerald-100 transition active:scale-98 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="h-4 w-4 text-emerald-600" />
                  <span>{exporting ? "Đang xuất file..." : "Tải Bảng Excel/CSV Toàn Bộ Kho"}</span>
                </button>
              </div>
            </div>

            {/* 3. THỐNG KÊ NHANH THEO DÒNG SẢN PHẨM */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-emerald-600" />
                Phân Loại Dòng Hàng Đang Có
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(prefixStats).map(([prefix, count]) => (
                  <div
                    key={prefix}
                    className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/80 flex items-center justify-between"
                  >
                    <span className="font-bold text-slate-700">Dòng {prefix}:</span>
                    <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. TIỆN ÍCH DÁN CHAT NHANH */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                Công Cụ Hỗ Trợ
              </span>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPaste();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition cursor-pointer text-left text-xs font-bold text-slate-800"
              >
                <span>Mở hộp thoại Dán Chat Zalo</span>
                <span className="text-emerald-700 font-semibold text-[11px]">Mở ngay →</span>
              </button>
            </div>

            {/* 5. TRẠNG THÁI HỆ THỐNG */}
            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 text-xs text-slate-500 space-y-2">
              <div className="flex items-center gap-2 text-slate-700 font-bold">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Trạng thái kết nối</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                • Zalo Bot: Đang quét tin nhắn tự động và đồng bộ thời gian thực.<br />
                • Hệ thống lưu trữ: Tự động ghi nhận và bảo lưu vĩnh viễn.<br />
                • Ứng dụng PWA: Đã kích hoạt chế độ App di động.
              </p>
            </div>

          </div>

          {/* FOOTER DRAWER */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 text-center text-[11px] text-slate-400">
            Xưởng Lũa Nhựt · Phiên Bản Vận Hành 2.5
          </div>
        </div>
      </div>
    </div>
  );
}
