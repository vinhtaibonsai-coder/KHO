"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Layers, Pencil, Plus, RotateCcw, Save, ZoomIn, ZoomOut } from "lucide-react";
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

interface Building {
  id: string;
  name: string;
}

interface MapLayout {
  buildings: Building[];
  nodes: WarehouseLayoutNode[];
}

const STORAGE_KEY = "xuong_lua_nhut_warehouse_map_layout_v1";
const COLS = 5;
const CELL_W = 150;
const CELL_H = 118;
const ORIGIN = 40;
const NODE_W = 132;
const NODE_H = 94;
const FULL_AT = 10;
const WORLD_W = ORIGIN * 2 + COLS * CELL_W;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const worldHeight = (nodeCount: number) =>
  ORIGIN * 2 + Math.max(6, Math.ceil(nodeCount / COLS)) * CELL_H;

function buildDefault(total: number): MapLayout {
  const nodes: WarehouseLayoutNode[] = [];
  for (let i = 0; i < total; i++) {
    nodes.push({
      id: i + 1,
      buildingId: `block-${Math.floor(i / 10)}`,
      x: ORIGIN + (i % COLS) * CELL_W,
      y: ORIGIN + Math.floor(i / COLS) * CELL_H,
      width: NODE_W,
      height: NODE_H,
      floor: 1,
    });
  }
  const buildings: Building[] = Array.from(
    { length: Math.max(1, Math.ceil(total / 10)) },
    (_, i) => ({ id: `block-${i}`, name: `Tòa ${LETTERS[i % LETTERS.length]}` })
  );
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
      x: ORIGIN + (at % COLS) * CELL_W,
      y: ORIGIN + Math.floor(at / COLS) * CELL_H,
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
  const [stackTarget, setStackTarget] = useState("");
  const [newBuildingName, setNewBuildingName] = useState("");
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dragRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);
  const movedRef = useRef(false);

  // Tải layout đã lưu (chạy sau hydration để tránh lệch SSR)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as MapLayout;
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.buildings)) setRaw(parsed);
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
  const worldH = worldHeight(visibleNodes.length);
  const selectedNode = selected ? layout.nodes.find((n) => n.id === selected) ?? null : null;

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

  // Tự động lưu vào localStorage sau mỗi thay đổi bố cục
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

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, node: WarehouseLayoutNode) => {
    movedRef.current = false;
    if (!edit) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      id: node.id,
      startX: e.clientX,
      startY: e.clientY,
      ox: node.x,
      oy: node.y,
      moved: false,
    };
    setSelected(node.id);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    const node = layout.nodes.find((n) => n.id === d.id);
    if (!node) return;
    setDrag({
      id: d.id,
      x: clamp(d.ox + dx, 0, WORLD_W - (node.width ?? NODE_W)),
      y: clamp(d.oy + dy, 0, worldH - (node.height ?? NODE_H)),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    if (!d.moved || !drag || drag.id !== d.id) return;
    movedRef.current = true;
    const { id, x, y } = drag;
    update((l) => ({ ...l, nodes: l.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }));
    setDrag(null);
  };

  const onNodeClick = (e: React.MouseEvent<HTMLButtonElement>, id: number) => {
    e.stopPropagation();
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    if (edit) {
      setSelected(id);
      return;
    }
    onSelect(id);
  };

  const addBuilding = () => {
    const name = newBuildingName.trim() || `Tòa ${layout.buildings.length + 1}`;
    const id = `b-${Date.now().toString(36)}`;
    update((l) => ({
      ...l,
      buildings: [...l.buildings, { id, name }],
      nodes: selected
        ? l.nodes.map((n) => (n.id === selected ? { ...n, buildingId: id } : n))
        : l.nodes,
    }));
    setNewBuildingName("");
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
    if (!window.confirm("Đặt lại toàn bộ bố cục bản đồ về mặc định?")) return;
    persist(buildDefault(totalWarehouses));
    setSelected(null);
  };

  const btn =
    "inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="space-y-3">
      {/* THANH ĐIỀU KHIỂN BẢN ĐỒ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">
          {edit
            ? "Chỉnh sửa: kéo ô kho tới vị trí thật · nhấp ô để chọn cấu hình."
            : "Nhấp ô kho để mở chi tiết · cuộn/thả để di chuyển bản đồ."}
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

      {/* THANH CÔNG CỤ CHỈNH SỬA */}
      {edit && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-2.5 text-xs">
          <input
            value={newBuildingName}
            onChange={(e) => setNewBuildingName(e.target.value)}
            placeholder="Tên tòa nhà / cụm kho mới"
            className="w-44 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button type="button" onClick={addBuilding} className={`${btn} border-indigo-200`}>
            <Plus className="h-3.5 w-3.5" /> Thêm tòa nhà / cụm kho
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
            <Layers className="h-3.5 w-3.5" /> Xếp chồng lên kho khác
          </button>

          <span className="hidden h-5 w-px bg-indigo-200 sm:block" />

          <button type="button" onClick={resetLayout} className={`${btn} border-indigo-200`}>
            <RotateCcw className="h-3.5 w-3.5" /> Đặt lại bố cục mặc định
          </button>
          <button
            type="button"
            onClick={() => persist(layout)}
            className={`${btn} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`}
          >
            <Save className="h-3.5 w-3.5" /> Lưu vị trí
          </button>
        </div>
      )}

      {/* THANH CẤU HÌNH Ô KHO ĐANG CHỌN */}
      {edit && selectedNode && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white p-2.5 text-xs shadow-xs">
          <span className="font-mono text-xs font-extrabold text-slate-800">
            KHO {pad(selectedNode.id)}
          </span>

          <label className="flex items-center gap-1.5 text-slate-500">
            Tòa nhà
            <select
              value={selectedNode.buildingId ?? ""}
              onChange={(e) => patchSelected({ buildingId: e.target.value || undefined })}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <option value="">Không nhóm</option>
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
            Cỡ ô
            <button
              type="button"
              className={btn}
              onClick={() =>
                patchSelected({
                  width: clamp((selectedNode.width ?? NODE_W) - 12, 72, 420),
                  height: clamp((selectedNode.height ?? NODE_H) - 8, 60, 300),
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
                  width: clamp((selectedNode.width ?? NODE_W) + 12, 72, 420),
                  height: clamp((selectedNode.height ?? NODE_H) + 8, 60, 300),
                })
              }
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* KHUNG BẢN ĐỒ 2D */}
      <div className="relative h-[460px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 sm:h-[560px]">
        <div style={{ width: WORLD_W * scale, height: worldH * scale, position: "relative" }}>
          <div
            onClick={() => edit && setSelected(null)}
            style={{
              width: WORLD_W,
              height: worldH,
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

            {/* KHUNG TÒA NHÀ / CỤM KHO */}
            {layout.buildings.map((b) => {
              const members = visibleNodes.filter((n) => n.buildingId === b.id);
              if (members.length === 0) return null;
              const left = Math.min(...members.map((m) => m.x)) - 14;
              const top = Math.min(...members.map((m) => m.y)) - 30;
              const right = Math.max(...members.map((m) => m.x + (m.width ?? NODE_W))) + 14;
              const bottom = Math.max(...members.map((m) => m.y + (m.height ?? NODE_H))) + 14;
              return (
                <div
                  key={b.id}
                  className="pointer-events-none absolute rounded-2xl border-2 border-dashed border-slate-300 bg-white/40"
                  style={{ left, top, width: right - left, height: bottom - top, zIndex: 1 }}
                >
                  <span className="absolute -top-3 left-3 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
                    {b.name}
                  </span>
                </div>
              );
            })}

            {/* Ô KHO */}
            {visibleNodes.map((n) => {
              const stat = stats.get(n.id) ?? { count: 0, matched: [] };
              const pos = drag && drag.id === n.id ? drag : n;
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
                  ? "border-indigo-400 bg-white ring-2 ring-indigo-500 shadow-md"
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
                  onPointerDown={(e) => onPointerDown(e, n)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
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
                      {buildingName(n.buildingId) || "Không nhóm"}
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
