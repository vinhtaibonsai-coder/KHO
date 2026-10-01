"use client";

import { useMemo, useState } from "react";
import { 
  ArrowDownUp, 
  ArrowRightLeft, 
  Calendar, 
  Clock, 
  History, 
  PackageOpen, 
  Trash2, 
  X,
  Warehouse as WarehouseIcon,
  Check
} from "lucide-react";
import type { Item, ItemHistory } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return { time, date };
};

export default function WarehouseDetailModal({
  warehouse,
  items,
  history = [],
  onClose,
  onRemove,
  onTransfer,
  onOpenPaste,
}: {
  warehouse: number;
  items: Item[];
  history?: ItemHistory[];
  onClose: () => void;
  onRemove: (sku: string) => void;
  onTransfer: (sku: string, toWarehouse: number) => Promise<boolean | void>;
  onOpenPaste?: (warehouse: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<"items" | "history">("items");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  
  // Sản phẩm đang được chọn xem chi tiết & lịch sử chuyển/xuất
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  // State phục vụ việc chọn kho chuyển
  const [transferringSku, setTransferringSku] = useState<string | null>(null);
  const [targetWarehouse, setTargetWarehouse] = useState<number>(warehouse === 1 ? 2 : 1);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // Danh sách item hiện tại trong kho
  const list = useMemo(() => {
    const raw = items.filter((i) => i.warehouse === warehouse);
    return raw.sort((a, b) => {
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    });
  }, [items, warehouse, sortOrder]);

  // Thông tin sản phẩm đang được chọn
  const selectedItem = useMemo(() => {
    return selectedSku ? items.find((i) => i.sku === selectedSku) : null;
  }, [items, selectedSku]);

  // Lịch sử điều chuyển / xuất kho riêng của sản phẩm được chọn
  const selectedItemHistory = useMemo(() => {
    if (!selectedSku) return [];
    return history.filter((h) => h.sku === selectedSku);
  }, [history, selectedSku]);

  // Lịch sử liên quan đến kho này (đã xuất từ kho này, hoặc chuyển đi/đến kho này)
  const warehouseHistory = useMemo(() => {
    return history.filter(
      (h) => h.fromWarehouse === warehouse || h.toWarehouse === warehouse
    );
  }, [history, warehouse]);

  async function handleConfirmTransfer() {
    if (!transferringSku) return;
    setTransferSubmitting(true);
    try {
      await onTransfer(transferringSku, targetWarehouse);
      setTransferringSku(null);
    } finally {
      setTransferSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER MODAL */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white font-extrabold text-base shadow-xs">
              {pad(warehouse)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Chi Tiết Kho {pad(warehouse)}</h2>
              <p className="text-xs text-slate-500 font-medium">
                Đang lưu trữ <strong className="text-emerald-700 font-bold">{list.length}</strong> mã sản phẩm độc bản
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* NÚT DÁN ĐOẠN CHAT VÀO KHO NÀY */}
            {onOpenPaste && (
              <button
                type="button"
                onClick={() => onOpenPaste(warehouse)}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer shadow-2xs"
                title="Dán đoạn chat Zalo để nạp mã vào kho này"
              >
                <span>+ Dán chat</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION: HÀNG TRONG KHO & LỊCH SỬ XUẤT/CHUYỂN */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("items")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                activeTab === "items"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <WarehouseIcon className="h-3.5 w-3.5" />
              <span>Hàng trong kho ({list.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                activeTab === "history"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Lịch sử Xuất & Chuyển kho ({warehouseHistory.length})</span>
            </button>
          </div>

          {activeTab === "items" && (
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition cursor-pointer shadow-2xs"
              title="Đổi thứ tự sắp xếp theo thời gian"
            >
              <ArrowDownUp className="h-3.5 w-3.5 text-emerald-600" />
              <span className="hidden sm:inline">{sortOrder === "newest" ? "Mới nhất trước" : "Cũ nhất trước"}</span>
            </button>
          )}
        </div>

        {/* NỘI DUNG CHÍNH */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
          
          {/* TRƯỜNG HỢP 1: ĐANG XEM CHI TIẾT 1 SẢN PHẨM CỤ THỂ KHI BẤM VÀO */}
          {selectedItem ? (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* THANH ĐIỀU HƯỚNG QUAY LẠI */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSku(null);
                    setTransferringSku(null);
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-emerald-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs transition cursor-pointer"
                >
                  <span>← Quay lại danh sách Kho {pad(warehouse)}</span>
                </button>

                <span className="text-xs text-slate-400 font-medium">
                  Chi tiết sản phẩm độc bản
                </span>
              </div>

              {/* CARD THÔNG TIN SẢN PHẨM */}
              <div className="rounded-2xl border-2 border-emerald-500/40 bg-white p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-2xl font-black text-slate-900 tracking-wider">
                        {selectedItem.sku}
                      </span>
                      <span className="rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800 border border-emerald-300">
                        1 CÁI ĐỘC BẢN
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {selectedItem.name || "Hàng độc bản"} · Cập nhật lúc: {fmtDate(selectedItem.updatedAt).time} ({fmtDate(selectedItem.updatedAt).date})
                    </p>
                  </div>

                  {/* CÁC NÚT THAO TÁC */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTransferringSku(transferringSku === selectedItem.sku ? null : selectedItem.sku);
                        setTargetWarehouse(warehouse === 1 ? 2 : 1);
                      }}
                      className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                        transferringSku === selectedItem.sku
                          ? "border-amber-400 bg-amber-50 text-amber-800"
                          : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300"
                      }`}
                    >
                      <ArrowRightLeft className="h-4 w-4 text-indigo-600" />
                      <span>{transferringSku === selectedItem.sku ? "Đóng chuyển" : "Chuyển kho"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onRemove(selectedItem.sku);
                        setSelectedSku(null);
                      }}
                      className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Xuất kho</span>
                    </button>
                  </div>
                </div>

                {/* KHUNG CHỌN KHO ĐÍCH NẾU BẤM CHUYỂN KHO */}
                {transferringSku === selectedItem.sku && (
                  <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-950">
                      <span>Chuyển sang:</span>
                      <select
                        value={targetWarehouse}
                        onChange={(e) => setTargetWarehouse(Number(e.target.value))}
                        className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {Array.from({ length: 30 }, (_, i) => i + 1)
                          .filter((wh) => wh !== warehouse)
                          .map((wh) => (
                            <option key={wh} value={wh}>
                              Kho {pad(wh)}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTransferringSku(null)}
                        className="px-2 text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                      >
                        Huỷ
                      </button>
                      <button
                        type="button"
                        disabled={transferSubmitting}
                        onClick={handleConfirmTransfer}
                        className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700 transition disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>{transferSubmitting ? "Đang chuyển..." : `Xác nhận chuyển sang Kho ${pad(targetWarehouse)}`}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* LỊCH SỬ CHUYỂN KHO VÀ ĐIỀU ĐỘNG CỦA RIÊNG MÃ NÀY */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-indigo-600" />
                    Lịch sử điều chuyển / xuất kho của mã [{selectedItem.sku}]
                  </h3>

                  {selectedItemHistory.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                      Chưa có lịch sử điều chuyển cho mã này (đây là vị trí đầu tiên hoặc mới được nạp).
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedItemHistory.map((h, i) => {
                        const { time, date } = fmtDate(h.createdAt);
                        const isOut = h.action === "out";
                        const isTransfer = h.action === "transfer";

                        return (
                          <div
                            key={h.id || i}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-2xs text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                  isOut
                                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                                    : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                                }`}
                              >
                                {isOut ? "XUẤT KHO" : "CHUYỂN KHO"}
                              </span>
                              <div>
                                <p className="font-semibold text-slate-800">
                                  {isOut
                                    ? `Xuất khỏi Kho ${pad(h.fromWarehouse || warehouse)}`
                                    : `Chuyển từ Kho ${pad(h.fromWarehouse || 0)} sang Kho ${pad(h.toWarehouse || 0)}`}
                                </p>
                                {h.note && (
                                  <p className="text-[11px] text-slate-500 mt-0.5">{h.note}</p>
                                )}
                              </div>
                            </div>

                            <div className="text-right text-[11px] text-slate-500">
                              <span className="font-bold text-slate-700 block">{time}</span>
                              <span className="text-slate-400">{date}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* TRƯỜNG HỢP 2: DANH SÁCH MÃ SẢN PHẨM TRONG KHO (BẤM VÀO ĐỂ XEM CHI TIẾT) */
            list.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <PackageOpen className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">Ô kho này hiện đang trống</p>
                <p className="text-xs text-slate-500 mt-1">Khi nhân viên nhắn mã qua Zalo, hàng sẽ hiển thị tại đây.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                  <span>💡 Nhấp vào sản phẩm để xem thông tin và lịch sử chuyển kho:</span>
                  <button
                    type="button"
                    onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
                    className="flex items-center gap-1 text-slate-700 hover:text-emerald-700 cursor-pointer"
                  >
                    <ArrowDownUp className="h-3 w-3 text-emerald-600" />
                    <span>{sortOrder === "newest" ? "Mới nhập trước" : "Cũ nhất trước"}</span>
                  </button>
                </div>

                {list.map((it, idx) => {
                  const { time, date } = fmtDate(it.updatedAt);
                  const isTransferringThis = transferringSku === it.sku;

                  // Đếm xem sản phẩm này đã có bao nhiêu lượt chuyển/xuất
                  const itemHistCount = history.filter((h) => h.sku === it.sku).length;

                  return (
                    <div
                      key={it.sku}
                      className="rounded-xl border border-slate-200/90 bg-white p-3.5 hover:border-emerald-500 hover:shadow-sm transition cursor-pointer group"
                      onClick={() => setSelectedSku(it.sku)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="font-mono text-xs font-bold text-slate-400 mt-1">
                            #{pad(idx + 1)}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-base font-extrabold text-slate-900 group-hover:text-emerald-700 tracking-wider transition">
                                {it.sku}
                              </span>
                              <span className="rounded bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                Độc bản (1 cái)
                              </span>
                              {itemHistCount > 0 && (
                                <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold text-indigo-700 flex items-center gap-1">
                                  <History className="h-2.5 w-2.5" />
                                  {itemHistCount} lượt chuyển
                                </span>
                              )}
                            </div>
                            {/* THỜI GIAN NHẬP / CẬP NHẬT */}
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                {time}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                {date}
                              </span>
                              <span className="text-emerald-600 font-semibold group-hover:underline">
                                Xem chi tiết & lịch sử →
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* NÚT THAO TÁC NHANH: CHUYỂN KHO & XUẤT KHO */}
                        <div 
                          className="self-end sm:self-center flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* NÚT CHUYỂN KHO */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isTransferringThis) {
                                setTransferringSku(null);
                              } else {
                                setTransferringSku(it.sku);
                                setTargetWarehouse(warehouse === 1 ? 2 : 1);
                              }
                            }}
                            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                              isTransferringThis
                                ? "border-amber-400 bg-amber-50 text-amber-800"
                                : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300"
                            }`}
                            title="Chuyển mã này sang ô kho khác"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 text-indigo-600" />
                            <span>{isTransferringThis ? "Huỷ" : "Chuyển kho"}</span>
                          </button>

                          {/* NÚT XUẤT KHO */}
                          <button
                            type="button"
                            onClick={() => onRemove(it.sku)}
                            className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition cursor-pointer"
                            title="Xuất mã này ra khỏi kho"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Xuất kho</span>
                          </button>
                        </div>
                      </div>

                      {/* KHUNG CHỌN KHO ĐÍCH NẾU BẤM CHUYỂN KHO TRỰC TIẾP */}
                      {isTransferringThis && (
                        <div 
                          className="mt-3.5 pt-3 border-t border-slate-100 bg-indigo-50/50 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-950">
                            <span>Chuyển mã <strong className="font-mono text-indigo-700 font-bold">{it.sku}</strong> sang:</span>
                            <select
                              value={targetWarehouse}
                              onChange={(e) => setTargetWarehouse(Number(e.target.value))}
                              className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {Array.from({ length: 30 }, (_, i) => i + 1)
                                .filter((wh) => wh !== warehouse)
                                .map((wh) => (
                                  <option key={wh} value={wh}>
                                    Kho {pad(wh)}
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setTransferringSku(null)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                            >
                              Đóng
                            </button>
                            <button
                              type="button"
                              disabled={transferSubmitting}
                              onClick={handleConfirmTransfer}
                              className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>{transferSubmitting ? "Đang chuyển..." : `Xác nhận chuyển`}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* FOOTER */}
        <div className="border-t border-slate-200 bg-white px-6 py-3 flex justify-between items-center text-xs text-slate-500">
          <span>* Nhấp vào từng mã sản phẩm để xem toàn bộ lịch sử xuất và chuyển kho của mã đó.</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
