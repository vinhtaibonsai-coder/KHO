"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Layers, Pencil, Plus, RotateCcw, Save, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import type { Item } from "@/types";

export interface WarehouseLayoutNode {
  id: number;
  buildingId?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  floor?: number;
}

export interface Building {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export interface MapLayout {
  buildings: Building[];
  nodes: WarehouseLayoutNode[];
}

const STORAGE_KEY = "xuong_lua_nhut_warehouse_map_layout_v2";
const ORIGIN = 30;
const NODE_W = 126;
const NODE_H = 88;
const FULL_AT = 10;
const WORLD_W = 1040;
const WORLD_H = 720;

const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// 4 tòa nhà theo đúng ảnh phác thảo của người dùng:
// - Tòa Trái: hình chữ nhật đứng (kho 1..7)
// - Tòa Giữa Trên: hình chữ nhật ngang (kho 8..15)
// - Tòa Giữa Dưới: hình chữ nhật ngang (kho 16..23)
// - Tòa Phải: hình chữ nhật đứng (kho 24..30)
function buildDefault(total: number): MapLayout {
  const buildings: Building[] = [
    {
      id: "building-left",
      name: "TÒA TRÁI (DỌC)",
      x: ORIGIN,
      y: ORIGIN,
      width: 220,
      height: 640,
      color: "border-sky-300 bg-sky-50/50",
    },
    {
      id: "building-center-top",
      name: "TÒA GIỮA TRÊN (NGANG)",
      x: 280,
      y: ORIGIN,
      width: 440,
      height: 300,
      color: "border-indigo-300 bg-indigo-50/50",
    },
    {
      id: "building-center-bottom",
      name: "TÒA GIỮA DƯỚI (NGANG)",
      x: 280,
      y: 360,
      width: 440,
      height: 310,
      color: "border-emerald-300 bg-emerald-50/50",
    },
    {
      id: "building-right",
      name: "TÒA PHẢI (DỌC)",
      x: 750,
      y: ORIGIN,
      width: 220,
      height: 640,
      color: "border-amber-300 bg-amber-50/50",
    },
  ];

  const nodes: WarehouseLayoutNode[] = [];

  for (let id = 1; id <= total; id++) {
    if (id <= 7) {
      // Tòa Trái (dọc): xếp cột đơn hoặc đôi
      const idx = id - 1;
      const col = idx % 1;
      const row = idx;
      nodes.push({
        id,
        buildingId: "building-left",
        x: 48 + col * 130,
        y: 65 + row * 80,
        width: 180,
        height: 70,
        floor: 1,
      });
    } else if (id <= 15) {
      // Tòa Giữa Trên (ngang): 3 cột x 3 hàng
      const idx = id - 8;
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      nodes.push({
        id,
        buildingId: "building-center-top",
        x: 298 + col * 138,
        y: 65 + row * 76,
        width: 130,
        height: 68,
        floor: 1,
      });
    } else if (id <= 23) {
      // Tòa Giữa Dưới (ngang): 3 cột x 3 hàng
      const idx = id - 16;
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      nodes.push({
        id,
        buildingId: "building-center-bottom",
        x: 298 + col * 138,
        y: 395 + row * 76,
        width: 130,
        height: 68,
        floor: 1,
      });
    } else {
      // Tòa Phải (dọc): kho 24..30
      const idx = id - 24;
      const col = idx % 1;
      const row = idx;
      nodes.push({
        id,
        buildingId: "building-right",
        x: 768 + col * 130,
        y: 65 + row * 80,
        width: 180,
        height: 70,
        floor: 1,
      });
    }
  }

  return { buildings, nodes };
}

function ensureNodes(layout: MapLayout, total: number): MapLayout {
  const present = new Set(layout.nodes.map((n) => n.id));
  const missing: number[] = [];
  for (let id = 1; id <= total; id++) if (!present.has(id)) missing.push(id);
  if (missing.length === 0) return layout;
  const nodes = [...layout.nodes];
  for (const id of missing) {
    const at = nodes.length;
    nodes.push({
      id,
      x: ORIGIN + (at % 4) * 140,
      y: 700 + Math.floor(at / 4) * 80,
      width: NODE_W,
      height: NODE_H,
      floor: 1,
    });
  }
  return { ...layout, nodes };
}

export default function WarehouseMapCanvas({
  items,
  highlight,
  highlightWarehouses = [],
  query = "",
  totalWarehouses = 30,
  onSelect,
}: {
  items: Item[];
  highlight: number | null;
  highlightWarehouses?: number[];
  query?: string;
  totalWarehouses?: number;
  onSelect: (warehouse: number) => void;
}) {
  const [raw, setRaw] = useState<MapLayout | null>(null);
  const [edit, setEdit] = useState(false);
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [stackTarget, setStackTarget] = useState("");
  const [newBuildingName, setNewBuildingName] = useState("");
  const [dragNode, setDragNode] = useState<{ id: number; x: number; y: number } | null>(null);
  const [dragBuilding, setDragBuilding] = useState<{ id: string; x: number; y: number } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dragNodeRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);

  const dragBuildingRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);

  const movedRef = useRef(false);

  // Tải layout đã lưu (fallback storage key cũ nếu có)
  useEffect(() => {
    try {
      const stored =
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem("xuong_lua_nhut_warehouse_map_layout_v1");
      if (!stored) return;
      const parsed = JSON.parse(stored) as MapLayout;
      if (
        parsed &&
        Array.isArray(parsed.nodes) &&
        Array.isArray(parsed.buildings) &&
        parsed.buildings.length > 0 &&
        parsed.buildings[0].width !== undefined
      ) {
        setRaw(parsed);
      }
    } catch {
      // layout hỏng -> dùng bố cục mặc định
    }
  }, []);

  const layout = useMemo(
    () => ensureNodes(raw ?? buildDefault(totalWarehouses), totalWarehouses),
    [raw, totalWarehouses]
  );

  const visibleNodes = useMemo(
    () => layout.nodes.filter((n) => n.id >= 1 && n.id <= totalWarehouses),
    [layout, totalWarehouses]
  );

  const selectedNode = selected ? layout.nodes.find((n) => n.id === selected) ?? null : null;
  const currentBuilding = selectedBuilding
    ? layout.buildings.find((b) => b.id === selectedBuilding) ?? null
    : null;

  const stats = useMemo(() => {
    const map = new Map<number, { count: number; matched: string[] }>();
    for (let id = 1; id <= totalWarehouses; id++) map.set(id, { count: 0, matched: [] });
    const q = query.trim().toUpperCase();
    for (const it of items) {
      if (it.status === "sold") continue;
      const s = map.get(it.warehouse);
      if (!s) continue;
      s.count++;
      if (q && it.sku.toUpperCase().includes(q)) s.matched.push(it.sku);
    }
    return map;
  }, [items, query, totalWarehouses]);

  const buildingName = (id?: string) =>
    layout.buildings.find((b) => b.id === id)?.name ?? "";

  // Tự động lưu vào localStorage sau mỗi thay đổi
  const persist = (next: MapLayout) => {
    setRaw(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSavedAt(
        new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      // hết dung lượng lưu trữ
    }
  };

  const update = (fn: (l: MapLayout) => MapLayout) => persist(fn(layout));

  // --- KÉO THẢ Ô KHO ---
  const onNodePointerDown = (e: React.PointerEvent<HTMLButtonElement>, node: WarehouseLayoutNode) => {
    movedRef.current = false;
    if (!edit) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragNodeRef.current = {
      id: node.id,
      startX: e.clientX,
      startY: e.clientY,
      ox: node.x,
      oy: node.y,
      moved: false,
    };
    setSelected(node.id);
    setSelectedBuilding(null);
  };

  const onNodePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragNodeRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    const node = layout.nodes.find((n) => n.id === d.id);
    if (!node) return;
    setDragNode({
      id: d.id,
      x: clamp(d.ox + dx, 0, WORLD_W - (node.width ?? NODE_W)),
      y: clamp(d.oy + dy, 0, WORLD_H - (node.height ?? NODE_H)),
    });
  };

  const onNodePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragNodeRef.current;
    if (!d) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragNodeRef.current = null;
    if (!d.moved || !dragNode || dragNode.id !== d.id) return;
    movedRef.current = true;
    const { id, x, y } = dragNode;

    // Tự động kiểm tra xem ô kho thả vào tòa nhà nào
    const insideBuilding = layout.buildings.find(
      (b) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
    );

    update((l) => ({
      ...l,
      nodes: l.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              x,
              y,
              buildingId: insideBuilding ? insideBuilding.id : n.buildingId,
            }
          : n
      ),
    }));
    setDragNode(null);
  };

  const onNodeClick = (e: React.MouseEvent<HTMLButtonElement>, id: number) => {
    e.stopPropagation();
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    if (edit) {
      setSelected(id);
      setSelectedBuilding(null);
      return;
    }
    onSelect(id);
  };

  // --- KÉO THẢ TÒA NHÀ ---
  const onBuildingPointerDown = (e: React.PointerEvent<HTMLDivElement>, b: Building) => {
    if (!edit) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragBuildingRef.current = {
      id: b.id,
      startX: e.clientX,
      startY: e.clientY,
      ox: b.x,
      oy: b.y,
      moved: false,
    };
    setSelectedBuilding(b.id);
    setSelected(null);
  };

  const onBuildingPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragBuildingRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    const b = layout.buildings.find((item) => item.id === d.id);
    if (!b) return;
    setDragBuilding({
      id: d.id,
      x: clamp(d.ox + dx, 0, WORLD_W - b.width),
      y: clamp(d.oy + dy, 0, WORLD_H - b.height),
    });
  };

  const onBuildingPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragBuildingRef.current;
    if (!d) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragBuildingRef.current = null;
    if (!d.moved || !dragBuilding || dragBuilding.id !== d.id) return;
    const { id, x, y } = dragBuilding;
    const deltaX = x - d.ox;
    const deltaY = y - d.oy;

    // Di chuyển cả tòa nhà lẫn các ô kho trực thuộc
    update((l) => ({
      ...l,
      buildings: l.buildings.map((b) => (b.id === id ? { ...b, x, y } : b)),
      nodes: l.nodes.map((n) =>
        n.buildingId === id ? { ...n, x: clamp(n.x + deltaX, 0, WORLD_W - 100), y: clamp(n.y + deltaY, 0, WORLD_H - 60) } : n
      ),
    }));
    setDragBuilding(null);
  };

  // Quản lý tòa nhà
  const addBuilding = () => {
    const name = newBuildingName.trim() || `Tòa ${layout.buildings.length + 1}`;
    const id = `b-${Date.now().toString(36)}`;
    const newB: Building = {
      id,
      name,
      x: 100,
      y: 100,
      width: 320,
      height: 240,
      color: "border-slate-300 bg-white/70",
    };
    update((l) => ({
      ...l,
      buildings: [...l.buildings, newB],
      nodes: selected
        ? l.nodes.map((n) => (n.id === selected ? { ...n, buildingId: id } : n))
        : l.nodes,
    }));
    setNewBuildingName("");
    setSelectedBuilding(id);
  };

  const removeBuilding = (id: string) => {
    if (!window.confirm("Bạn muốn xóa tòa nhà này? Các kho bên trong sẽ không bị xóa.")) return;
    update((l) => ({
      ...l,
      buildings: l.buildings.filter((b) => b.id !== id),
      nodes: l.nodes.map((n) => (n.buildingId === id ? { ...n, buildingId: undefined } : n)),
    }));
    setSelectedBuilding(null);
  };

  const patchBuilding = (patch: Partial<Building>) => {
    if (!selectedBuilding) return;
    update((l) => ({
      ...l,
      buildings: l.buildings.map((b) => (b.id === selectedBuilding ? { ...b, ...patch } : b)),
    }));
  };

  const applyStack = () => {
    const target = layout.nodes.find((n) => n.id === Number(stackTarget));
    if (!selected || !target) return;
    update((l) => ({
      ...l,
      nodes: l.nodes.map((n) =>
        n.id === selected
          ? {
              ...n,
              x: target.x,
              y: target.y,
              floor: (target.floor ?? 1) + 1,
              buildingId: target.buildingId ?? n.buildingId,
            }
          : n
      ),
    }));
    setStackTarget("");
  };

  const patchSelected = (patch: Partial<WarehouseLayoutNode>) => {
    if (!selected) return;
    update((l) => ({
      ...l,
      nodes: l.nodes.map((n) => (n.id === selected ? { ...n, ...patch } : n)),
    }));
  };

  const resetLayout = () => {
    if (!window.confirm("Đặt lại toàn bộ bố cục bản đồ 4 tòa nhà về chuẩn phác thảo ban đầu?")) return;
    persist(buildDefault(totalWarehouses));
    setSelected(null);
    setSelectedBuilding(null);
  };

  const btn =
    "inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="space-y-3">
      {/* THANH ĐIỀU KHIỂN BẢN ĐỒ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">
          {edit
            ? "Chế độ chỉnh sửa: Kéo thả Tòa Nhà hoặc Ô Kho · Nhấp để xem thanh công cụ."
            : "Nhấp ô kho để mở chi tiết · Bản đồ 4 khối tòa nhà chuẩn theo mặt bằng kho."}
          {savedAt && <span className="ml-2 font-semibold text-emerald-600">Tự động lưu {savedAt}</span>}
        </p>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={`${btn} px-2`}
            aria-label="Thu nhỏ"
            onClick={() => setScale((s) => clamp(Number((s - 0.15).toFixed(2)), 0.5, 1.6))}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-xs font-bold text-slate-500">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className={`${btn} px-2`}
            aria-label="Phóng to"
            onClick={() => setScale((s) => clamp(Number((s + 0.15).toFixed(2)), 0.5, 1.6))}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEdit((v) => !v);
              setSelected(null);
              setSelectedBuilding(null);
            }}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold shadow-2xs transition ${
              edit
                ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                : "border-slate-700 bg-slate-800 text-white hover:bg-slate-900"
            }`}
          >
            {edit ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {edit ? "Xong chỉnh sửa" : "Chỉnh sửa bố cục"}
          </button>
        </div>
      </div>

      {/* THANH CÔNG CỤ CHỈNH SỬA TỔNG QUÁT */}
      {edit && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-2.5 text-xs">
          <input
            value={newBuildingName}
            onChange={(e) => setNewBuildingName(e.target.value)}
            placeholder="Tên tòa nhà mới"
            className="w-40 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button type="button" onClick={addBuilding} className={`${btn} border-indigo-200`}>
            <Plus className="h-3.5 w-3.5" /> Thêm tòa nhà
          </button>

          <span className="hidden h-5 w-px bg-indigo-200 sm:block" />

          <select
            value={stackTarget}
            onChange={(e) => setStackTarget(e.target.value)}
            className="cursor-pointer rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">Kho đích xếp chồng…</option>
            {visibleNodes
              .filter((n) => n.id !== selected)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  Kho {pad(n.id)}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!selected || !stackTarget}
            onClick={applyStack}
            className={`${btn} border-indigo-200`}
          >
            <Layers className="h-3.5 w-3.5" /> Xếp chồng ô kho
          </button>

          <span className="hidden h-5 w-px bg-indigo-200 sm:block" />

          <button type="button" onClick={resetLayout} className={`${btn} border-indigo-200`}>
            <RotateCcw className="h-3.5 w-3.5" /> Khôi phục 4 tòa mặc định
          </button>
          <button
            type="button"
            onClick={() => persist(layout)}
            className={`${btn} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`}
          >
            <Save className="h-3.5 w-3.5" /> Lưu bản đồ
          </button>
        </div>
      )}

      {/* THANH CẤU HÌNH TÒA NHÀ ĐANG CHỌN */}
      {edit && currentBuilding && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-indigo-200 bg-white p-2.5 text-xs shadow-xs">
          <span className="font-mono text-xs font-extrabold text-indigo-700">
            🏢 {currentBuilding.name}
          </span>

          <label className="flex items-center gap-1.5 text-slate-500">
            Đổi tên
            <input
              value={currentBuilding.name}
              onChange={(e) => patchBuilding({ name: e.target.value })}
              className="w-36 rounded-lg border border-slate-200 px-2 py-1 font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>

          <div className="flex items-center gap-1.5 text-slate-500">
            Kích thước (Rộng x Cao)
            <button
              type="button"
              className={btn}
              onClick={() =>
                patchBuilding({
                  width: clamp(currentBuilding.width - 20, 160, 600),
                  height: clamp(currentBuilding.height - 20, 140, 700),
                })
              }
            >
              −
            </button>
            <span className="font-bold text-slate-800">
              {currentBuilding.width}×{currentBuilding.height}
            </span>
            <button
              type="button"
              className={btn}
              onClick={() =>
                patchBuilding({
                  width: clamp(currentBuilding.width + 20, 160, 600),
                  height: clamp(currentBuilding.height + 20, 140, 700),
                })
              }
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={() => removeBuilding(currentBuilding.id)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"
          >
            <Trash2 className="h-3.5 w-3.5" /> Xóa tòa nhà
          </button>
        </div>
      )}

      {/* THANH CẤU HÌNH Ô KHO ĐANG CHỌN */}
      {edit && selectedNode && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white p-2.5 text-xs shadow-xs">
          <span className="font-mono text-xs font-extrabold text-emerald-800">
            📦 KHO {pad(selectedNode.id)}
          </span>

          <label className="flex items-center gap-1.5 text-slate-500">
            Gán vào tòa nhà:
            <select
              value={selectedNode.buildingId ?? ""}
              onChange={(e) => patchSelected({ buildingId: e.target.value || undefined })}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <option value="">-- Ngoài tòa nhà --</option>
              {layout.buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1.5 text-slate-500">
            Tầng
            <button
              type="button"
              className={btn}
              onClick={() => patchSelected({ floor: Math.max(1, (selectedNode.floor ?? 1) - 1) })}
            >
              −
            </button>
            <span className="w-4 text-center font-bold text-slate-800">{selectedNode.floor ?? 1}</span>
            <button
              type="button"
              className={btn}
              onClick={() => patchSelected({ floor: (selectedNode.floor ?? 1) + 1 })}
            >
              +
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-slate-500">
            Kích thước ô
            <button
              type="button"
              className={btn}
              onClick={() =>
                patchSelected({
                  width: clamp((selectedNode.width ?? NODE_W) - 10, 70, 320),
                  height: clamp((selectedNode.height ?? NODE_H) - 8, 50, 220),
                })
              }
            >
              −
            </button>
            <span className="font-bold text-slate-800">
              {selectedNode.width ?? NODE_W}×{selectedNode.height ?? NODE_H}
            </span>
            <button
              type="button"
              className={btn}
              onClick={() =>
                patchSelected({
                  width: clamp((selectedNode.width ?? NODE_W) + 10, 70, 320),
                  height: clamp((selectedNode.height ?? NODE_H) + 8, 50, 220),
                })
              }
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* KHUNG BẢN ĐỒ 2D CANVAS */}
      <div className="relative h-[520px] overflow-auto rounded-xl border border-slate-200 bg-slate-100 sm:h-[620px]">
        <div style={{ width: WORLD_W * scale, height: WORLD_H * scale, position: "relative" }}>
          <div
            onClick={() => {
              if (edit) {
                setSelected(null);
                setSelectedBuilding(null);
              }
            }}
            style={{
              width: WORLD_W,
              height: WORLD_H,
              position: "absolute",
              top: 0,
              left: 0,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {/* LỚP NỀN LƯỚI */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: "radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)",
                backgroundSize: "24px 24px",
              }}
            />

            {/* KHUNG CÁC TÒA NHÀ */}
            {layout.buildings.map((b) => {
              const pos = dragBuilding && dragBuilding.id === b.id ? dragBuilding : b;
              const isBuildingSelected = edit && selectedBuilding === b.id;

              return (
                <div
                  key={b.id}
                  onPointerDown={(e) => onBuildingPointerDown(e, b)}
                  onPointerMove={onBuildingPointerMove}
                  onPointerUp={onBuildingPointerUp}
                  onPointerCancel={onBuildingPointerUp}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (edit) {
                      setSelectedBuilding(b.id);
                      setSelected(null);
                    }
                  }}
                  className={`absolute rounded-2xl border-2 transition-colors ${
                    isBuildingSelected
                      ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-400"
                      : b.color || "border-slate-300 bg-white/50"
                  }`}
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: b.width,
                    height: b.height,
                    zIndex: 2,
                    touchAction: edit ? "none" : "auto",
                    cursor: edit ? "grab" : "default",
                  }}
                >
                  <div className="flex items-center justify-between p-2">
                    <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white shadow-xs">
                      {b.name}
                    </span>
                    {edit && (
                      <span className="text-[10px] font-semibold text-slate-400">
                        Kéo để di chuyển tòa
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* CÁC Ô KHO */}
            {visibleNodes.map((n) => {
              const stat = stats.get(n.id) ?? { count: 0, matched: [] };
              const pos = dragNode && dragNode.id === n.id ? dragNode : n;
              const w = n.width ?? NODE_W;
              const h = n.height ?? NODE_H;
              const floor = n.floor ?? 1;
              const isMatched =
                highlight === n.id || highlightWarehouses.includes(n.id);
              const badge =
                stat.count === 0
                  ? { cls: "bg-slate-100 text-slate-400", text: "Trống" }
                  : stat.count >= FULL_AT
                  ? { cls: "bg-amber-100 text-amber-700", text: `Đầy ${stat.count}` }
                  : { cls: "bg-emerald-100 text-emerald-800", text: `${stat.count} mã` };
              const cls = edit
                ? selected === n.id
                  ? "border-indigo-400 bg-white ring-2 ring-indigo-500 shadow-lg"
                  : "border-slate-300 bg-white hover:border-indigo-300 hover:shadow-md"
                : isMatched
                ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400/70 shadow-md"
                : stat.count > 0
                ? "border-emerald-300 bg-emerald-50/95 hover:shadow-md"
                : "border-slate-300 bg-white hover:shadow-md";

              return (
                <button
                  key={n.id}
                  type="button"
                  onPointerDown={(e) => onNodePointerDown(e, n)}
                  onPointerMove={onNodePointerMove}
                  onPointerUp={onNodePointerUp}
                  onPointerCancel={onNodePointerUp}
                  onClick={(e) => onNodeClick(e, n.id)}
                  title={`KHO ${pad(n.id)} · ${stat.count} mã · ${buildingName(n.buildingId) || "Không nhóm"}`}
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: w,
                    height: h,
                    zIndex: 10 + floor,
                    touchAction: edit ? "none" : "auto",
                    cursor: edit ? "grab" : "pointer",
                  }}
                  className={`absolute flex flex-col justify-between rounded-lg border p-2 text-left transition-shadow ${cls} ${
                    floor > 1 && !isMatched ? "shadow-md" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-mono text-xs font-extrabold tracking-tight text-slate-800">
                      KHO {pad(n.id)}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${badge.cls}`}
                    >
                      {badge.text}
                    </span>
                  </div>

                  <div className="space-y-0.5 overflow-hidden">
                    {stat.matched.slice(0, 2).map((sku) => (
                      <span
                        key={sku}
                        className="block truncate rounded bg-emerald-600 px-1 py-0.5 font-mono text-[9px] font-bold text-white"
                      >
                        {sku}
                      </span>
                    ))}
                    {stat.matched.length > 2 && (
                      <span className="block font-mono text-[9px] font-bold text-emerald-700">
                        +{stat.matched.length - 2} khớp
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1 text-[9px] text-slate-400">
                    <span className="truncate font-semibold">
                      {buildingName(n.buildingId) || "Ngoài tòa"}
                    </span>
                    {floor > 1 && (
                      <span className="rounded bg-indigo-100 px-1 font-bold text-indigo-700">
                        T{floor}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
