"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignEndHorizontal,
  AlignStartHorizontal,
  AlignStartVertical,
  Check,
  Grid,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
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
const ORIGIN = 40;
const NODE_W = 126;
const NODE_H = 88;
const FULL_AT = 10;
// Mở rộng đáng kể vùng di chuyển của tòa nhà và các kho (1600 x 1100 px)
const WORLD_W = 1600;
const WORLD_H = 1100;
const GRID_SIZE = 20;

const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const snap = (v: number, snapGrid: boolean, size = GRID_SIZE) =>
  snapGrid ? Math.round(v / size) * size : v;

export function getWarehouseBuildingInfo(
  warehouseId: number,
  totalWarehouses = 30
): { buildingName: string; buildingId?: string } {
  if (typeof window === "undefined") {
    // SSR fallback to default 4 buildings
    if (warehouseId <= 7) return { buildingName: "TÒA TRÁI (DỌC)", buildingId: "building-left" };
    if (warehouseId <= 15) return { buildingName: "TÒA GIỮA TRÊN (NGANG)", buildingId: "building-center-top" };
    if (warehouseId <= 23) return { buildingName: "TÒA GIỮA DƯỚI (NGANG)", buildingId: "building-center-bottom" };
    if (warehouseId <= 30) return { buildingName: "TÒA PHẢI (DỌC)", buildingId: "building-right" };
    return { buildingName: "Ngoài tòa" };
  }

  try {
    const stored =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("xuong_lua_nhut_warehouse_map_layout_v1");
    if (stored) {
      const parsed = JSON.parse(stored) as MapLayout;
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.buildings)) {
        const node = parsed.nodes.find((n) => n.id === warehouseId);
        if (node && node.buildingId) {
          const b = parsed.buildings.find((item) => item.id === node.buildingId);
          if (b) return { buildingName: b.name, buildingId: b.id };
        }
      }
    }
  } catch {
    // fallback
  }

  // Default fallback
  if (warehouseId <= 7) return { buildingName: "TÒA TRÁI (DỌC)", buildingId: "building-left" };
  if (warehouseId <= 15) return { buildingName: "TÒA GIỮA TRÊN (NGANG)", buildingId: "building-center-top" };
  if (warehouseId <= 23) return { buildingName: "TÒA GIỮA DƯỚI (NGANG)", buildingId: "building-center-bottom" };
  if (warehouseId <= 30) return { buildingName: "TÒA PHẢI (DỌC)", buildingId: "building-right" };
  return { buildingName: "Ngoài tòa" };
}

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
      width: 240,
      height: 720,
      color: "border-sky-300 bg-sky-50/50",
    },
    {
      id: "building-center-top",
      name: "TÒA GIỮA TRÊN (NGANG)",
      x: 320,
      y: ORIGIN,
      width: 520,
      height: 340,
      color: "border-indigo-300 bg-indigo-50/50",
    },
    {
      id: "building-center-bottom",
      name: "TÒA GIỮA DƯỚI (NGANG)",
      x: 320,
      y: 420,
      width: 520,
      height: 350,
      color: "border-emerald-300 bg-emerald-50/50",
    },
    {
      id: "building-right",
      name: "TÒA PHẢI (DỌC)",
      x: 880,
      y: ORIGIN,
      width: 240,
      height: 720,
      color: "border-amber-300 bg-amber-50/50",
    },
  ];

  const nodes: WarehouseLayoutNode[] = [];

  for (let id = 1; id <= total; id++) {
    if (id <= 7) {
      // Tòa Trái (dọc): xếp cột
      const idx = id - 1;
      const col = idx % 1;
      const row = idx;
      nodes.push({
        id,
        buildingId: "building-left",
        x: 60 + col * 140,
        y: 80 + row * 88,
        width: 200,
        height: 76,
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
        x: 350 + col * 160,
        y: 80 + row * 82,
        width: 145,
        height: 72,
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
        x: 350 + col * 160,
        y: 470 + row * 82,
        width: 145,
        height: 72,
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
        x: 900 + col * 140,
        y: 80 + row * 88,
        width: 200,
        height: 76,
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
      x: ORIGIN + (at % 6) * 160,
      y: 820 + Math.floor(at / 6) * 95,
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
  const [snapGrid, setSnapGrid] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [stackTarget, setStackTarget] = useState("");
  const [newBuildingName, setNewBuildingName] = useState("");
  const [dragNode, setDragNode] = useState<{ id: number; x: number; y: number } | null>(null);
  const [dragBuilding, setDragBuilding] = useState<{ id: string; x: number; y: number } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [activeFloorFilter, setActiveFloorFilter] = useState<number | "all">("all");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Lưu giá trị đang gõ tạm thời trong các ô input kích thước để tránh nhảy loạn khi đang nhập số
  const [inputBuildingWidth, setInputBuildingWidth] = useState<string>("");
  const [inputBuildingHeight, setInputBuildingHeight] = useState<string>("");
  const [inputNodeWidth, setInputNodeWidth] = useState<string>("");
  const [inputNodeHeight, setInputNodeHeight] = useState<string>("");

  // Tự động căn tỷ lệ zoom (scale) tối ưu theo kích thước màn hình điện thoại / máy tính
  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateAutoFit = () => {
      const containerW = containerRef.current?.clientWidth || window.innerWidth;
      if (containerW < 640) {
        // Màn hình điện thoại dọc: tự động thu nhỏ ~55% - 60% để nhìn bao quát toàn bộ cụm tòa nhà
        const fitScale = clamp(Number((containerW / 1200).toFixed(2)), 0.45, 0.75);
        setScale((prev) => (prev === 1 ? fitScale : prev));
      } else if (containerW < 1024) {
        // Tablet: thu nhỏ vừa phải ~75% - 85%
        const fitScale = clamp(Number((containerW / 1300).toFixed(2)), 0.65, 0.9);
        setScale((prev) => (prev === 1 ? fitScale : prev));
      }
    };
    updateAutoFit();
    window.addEventListener("resize", updateAutoFit);
    return () => window.removeEventListener("resize", updateAutoFit);
  }, []);

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

  // Tải layout đã lưu (ưu tiên API server/database, fallback localStorage)
  useEffect(() => {
    let isMounted = true;

    // 1. Đọc ngay từ localStorage để hiển thị tức thì không bị giật UI
    try {
      const stored =
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem("xuong_lua_nhut_warehouse_map_layout_v1");
      if (stored) {
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
      }
    } catch {}

    // 2. Fetch layout mới nhất từ database / server API
    fetch("/api/items")
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted || !data || !data.mapLayout) return;
        const serverLayout = data.mapLayout as MapLayout;
        if (
          Array.isArray(serverLayout.nodes) &&
          Array.isArray(serverLayout.buildings) &&
          serverLayout.buildings.length > 0
        ) {
          setRaw(serverLayout);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(serverLayout));
          } catch {}
        }
      })
      .catch((err) => {
        console.warn("Lỗi đồng bộ layout bản đồ từ server:", err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const layout = useMemo(
    () => ensureNodes(raw ?? buildDefault(totalWarehouses), totalWarehouses),
    [raw, totalWarehouses]
  );

  const visibleNodes = useMemo(
    () => layout.nodes.filter((n) => n.id >= 1 && n.id <= totalWarehouses),
    [layout, totalWarehouses]
  );

  const singleSelectedNode =
    selectedIds.length === 1 ? layout.nodes.find((n) => n.id === selectedIds[0]) ?? null : null;
  const currentBuilding = selectedBuilding
    ? layout.buildings.find((b) => b.id === selectedBuilding) ?? null
    : null;

  // Đồng bộ giá trị input khi đổi kho hoặc đổi tòa nhà được chọn
  useEffect(() => {
    if (currentBuilding) {
      setInputBuildingWidth(String(currentBuilding.width));
      setInputBuildingHeight(String(currentBuilding.height));
    }
  }, [currentBuilding?.id, currentBuilding?.width, currentBuilding?.height]);

  useEffect(() => {
    if (singleSelectedNode) {
      setInputNodeWidth(String(singleSelectedNode.width ?? NODE_W));
      setInputNodeHeight(String(singleSelectedNode.height ?? NODE_H));
    }
  }, [singleSelectedNode?.id, singleSelectedNode?.width, singleSelectedNode?.height]);

  const maxFloor = useMemo(() => {
    let m = 1;
    for (const n of visibleNodes) {
      if ((n.floor ?? 1) > m) m = n.floor ?? 1;
    }
    return m;
  }, [visibleNodes]);

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

  // Tự động lưu vào localStorage và đồng bộ lên Database qua API
  const persist = (next: MapLayout) => {
    setRaw(next);
    const timeStr = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSavedAt(timeStr);
    } catch {
      // hết dung lượng lưu trữ
    }

    // Đồng bộ lên server database
    fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_map_layout", layout: next }),
    })
      .then((res) => {
        if (res.ok) {
          setSavedAt(`${timeStr} (Đã đồng bộ DB)`);
        }
      })
      .catch((err) => {
        console.warn("Không thể đồng bộ layout lên DB:", err);
      });
  };

  const update = (fn: (l: MapLayout) => MapLayout) => persist(fn(layout));

  // --- KÉO THẢ Ô KHO ---
  const onNodePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    node: WarehouseLayoutNode
  ) => {
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

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) =>
        prev.includes(node.id) ? prev.filter((id) => id !== node.id) : [...prev, node.id]
      );
    } else if (!selectedIds.includes(node.id)) {
      setSelectedIds([node.id]);
    }
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
    const rawX = clamp(d.ox + dx, 0, WORLD_W - (node.width ?? NODE_W));
    const rawY = clamp(d.oy + dy, 0, WORLD_H - (node.height ?? NODE_H));

    setDragNode({
      id: d.id,
      x: snap(rawX, snapGrid),
      y: snap(rawY, snapGrid),
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
    const deltaX = x - d.ox;
    const deltaY = y - d.oy;

    // Di chuyển ô kho (hoặc toàn bộ các ô kho đang cùng được chọn)
    const affectedIds = selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];

    update((l) => ({
      ...l,
      nodes: l.nodes.map((n) => {
        if (!affectedIds.includes(n.id)) return n;
        const newX = n.id === id ? x : clamp(n.x + deltaX, 0, WORLD_W - (n.width ?? NODE_W));
        const newY = n.id === id ? y : clamp(n.y + deltaY, 0, WORLD_H - (n.height ?? NODE_H));
        const insideBuilding = l.buildings.find(
          (b) =>
            newX + 20 >= b.x &&
            newX + 40 <= b.x + b.width &&
            newY + 20 >= b.y &&
            newY + 40 <= b.y + b.height
        );
        return {
          ...n,
          x: newX,
          y: newY,
          buildingId: insideBuilding ? insideBuilding.id : n.buildingId,
        };
      }),
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
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        setSelectedIds((prev) =>
          prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
      } else {
        setSelectedIds([id]);
      }
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
    setSelectedIds([]);
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
    const rawX = clamp(d.ox + dx, 0, WORLD_W - b.width);
    const rawY = clamp(d.oy + dy, 0, WORLD_H - b.height);
    setDragBuilding({
      id: d.id,
      x: snap(rawX, snapGrid),
      y: snap(rawY, snapGrid),
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
        n.buildingId === id
          ? {
              ...n,
              x: clamp(n.x + deltaX, 0, WORLD_W - (n.width ?? NODE_W)),
              y: clamp(n.y + deltaY, 0, WORLD_H - (n.height ?? NODE_H)),
            }
          : n
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
      width: 360,
      height: 260,
      color: "border-slate-300 bg-white/70",
    };
    update((l) => ({
      ...l,
      buildings: [...l.buildings, newB],
      nodes:
        selectedIds.length > 0
          ? l.nodes.map((n) => (selectedIds.includes(n.id) ? { ...n, buildingId: id } : n))
          : l.nodes,
    }));
    setNewBuildingName("");
    setSelectedBuilding(id);
  };

  const removeBuilding = (id: string) => {
    if (
      !window.confirm(
        "Bạn muốn xóa tòa nhà này? Toàn bộ các kho bên trong sẽ được giữ nguyên 100% và chuyển ra ngoài tòa nhà."
      )
    )
      return;
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

  // Căn chỉnh Align nhiều kho
  const alignSelectedNodes = (type: "left" | "top" | "horizontal" | "vertical" | "same-size") => {
    if (selectedIds.length < 2) return;
    const selectedNodesList = layout.nodes.filter((n) => selectedIds.includes(n.id));
    if (selectedNodesList.length === 0) return;

    if (type === "left") {
      const minX = Math.min(...selectedNodesList.map((n) => n.x));
      update((l) => ({
        ...l,
        nodes: l.nodes.map((n) => (selectedIds.includes(n.id) ? { ...n, x: minX } : n)),
      }));
    } else if (type === "top") {
      const minY = Math.min(...selectedNodesList.map((n) => n.y));
      update((l) => ({
        ...l,
        nodes: l.nodes.map((n) => (selectedIds.includes(n.id) ? { ...n, y: minY } : n)),
      }));
    } else if (type === "horizontal") {
      // Căn giữa theo trục ngang
      const avgY = Math.round(
        selectedNodesList.reduce((acc, cur) => acc + cur.y, 0) / selectedNodesList.length
      );
      update((l) => ({
        ...l,
        nodes: l.nodes.map((n) => (selectedIds.includes(n.id) ? { ...n, y: avgY } : n)),
      }));
    } else if (type === "vertical") {
      // Căn giữa theo trục dọc
      const avgX = Math.round(
        selectedNodesList.reduce((acc, cur) => acc + cur.x, 0) / selectedNodesList.length
      );
      update((l) => ({
        ...l,
        nodes: l.nodes.map((n) => (selectedIds.includes(n.id) ? { ...n, x: avgX } : n)),
      }));
    } else if (type === "same-size") {
      // Đồng bộ cùng kích thước với kho đầu tiên được chọn
      const ref = selectedNodesList[0];
      const w = ref.width ?? NODE_W;
      const h = ref.height ?? NODE_H;
      update((l) => ({
        ...l,
        nodes: l.nodes.map((n) => (selectedIds.includes(n.id) ? { ...n, width: w, height: h } : n)),
      }));
    }
  };

  const applyStack = () => {
    const target = layout.nodes.find((n) => n.id === Number(stackTarget));
    if (selectedIds.length === 0 || !target) return;
    update((l) => ({
      ...l,
      nodes: l.nodes.map((n) =>
        selectedIds.includes(n.id)
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
    if (selectedIds.length === 0) return;
    update((l) => ({
      ...l,
      nodes: l.nodes.map((n) => (selectedIds.includes(n.id) ? { ...n, ...patch } : n)),
    }));
  };

  const resetLayout = () => {
    if (
      !window.confirm(
        "Đặt lại toàn bộ bố cục bản đồ 4 tòa nhà về chuẩn phác thảo ban đầu?"
      )
    )
      return;
    persist(buildDefault(totalWarehouses));
    setSelectedIds([]);
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
            ? "Chế độ chỉnh sửa: Giữ Shift/Ctrl để chọn nhiều kho để căn chỉnh (Align) · Bật lưới Snap để kéo thẳng hàng."
            : "Nhấp ô kho để mở chi tiết · Bản đồ 4 khối tòa nhà chuẩn theo mặt bằng kho."}
          {savedAt && (
            <span className="ml-2 font-semibold text-emerald-600">Tự động lưu {savedAt}</span>
          )}
        </p>

        <div className="flex items-center gap-1.5">
          {/* BỘ LỌC CHỌN XEM TẦNG */}
          {maxFloor > 1 && (
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs shadow-2xs">
              <span className="px-2 text-[11px] font-extrabold text-slate-500">Xem tầng:</span>
              <button
                type="button"
                onClick={() => setActiveFloorFilter("all")}
                className={`rounded-md px-2 py-1 text-xs font-bold transition ${
                  activeFloorFilter === "all"
                    ? "bg-slate-800 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Cả 2 tầng
              </button>
              {Array.from({ length: maxFloor }, (_, i) => i + 1).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFloorFilter(f)}
                  className={`rounded-md px-2 py-1 text-xs font-bold transition ${
                    activeFloorFilter === f
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Tầng {f}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setSnapGrid((v) => !v)}
            title="Bật/Tắt chế độ hút lưới 20px giúp kéo thẳng hàng"
            className={`${btn} ${
              snapGrid ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-extrabold" : ""
            }`}
          >
            <Grid className="h-3.5 w-3.5" />
            Lưới canh (Snap): {snapGrid ? "BẬT" : "TẮT"}
          </button>

          <span className="hidden h-5 w-px bg-slate-200 sm:block" />

          <button
            type="button"
            className={`${btn} px-2`}
            aria-label="Thu nhỏ"
            onClick={() => setScale((s) => clamp(Number((s - 0.15).toFixed(2)), 0.4, 1.6))}
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
            onClick={() => setScale((s) => clamp(Number((s + 0.15).toFixed(2)), 0.4, 1.6))}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEdit((v) => !v);
              setSelectedIds([]);
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
            className="w-36 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button type="button" onClick={addBuilding} className={`${btn} border-indigo-200`}>
            <Plus className="h-3.5 w-3.5" /> Thêm tòa nhà
          </button>

          <span className="hidden h-5 w-px bg-indigo-200 sm:block" />

          {/* CĂN CHỈNH KHI CHỌN NHIỀU KHO */}
          {selectedIds.length >= 2 && (
            <div className="flex items-center gap-1 rounded-lg bg-indigo-100/80 p-1">
              <span className="px-1 text-[11px] font-extrabold text-indigo-900">
                Canh {selectedIds.length} kho:
              </span>
              <button
                type="button"
                onClick={() => alignSelectedNodes("left")}
                title="Căn thẳng mép trái"
                className={btn}
              >
                <AlignStartVertical className="h-3.5 w-3.5" /> Mép trái
              </button>
              <button
                type="button"
                onClick={() => alignSelectedNodes("top")}
                title="Căn thẳng mép trên"
                className={btn}
              >
                <AlignStartHorizontal className="h-3.5 w-3.5" /> Mép trên
              </button>
              <button
                type="button"
                onClick={() => alignSelectedNodes("horizontal")}
                title="Căn hàng ngang"
                className={btn}
              >
                <AlignCenter className="h-3.5 w-3.5" /> Hàng ngang
              </button>
              <button
                type="button"
                onClick={() => alignSelectedNodes("vertical")}
                title="Căn hàng dọc"
                className={btn}
              >
                <AlignEndHorizontal className="h-3.5 w-3.5" /> Hàng dọc
              </button>
              <button
                type="button"
                onClick={() => alignSelectedNodes("same-size")}
                title="Làm đều kích thước các kho đang chọn"
                className={btn}
              >
                Đều cỡ ô
              </button>
            </div>
          )}

          <span className="hidden h-5 w-px bg-indigo-200 sm:block" />

          <select
            value={stackTarget}
            onChange={(e) => setStackTarget(e.target.value)}
            className="cursor-pointer rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">Kho đích xếp chồng…</option>
            {visibleNodes
              .filter((n) => !selectedIds.includes(n.id))
              .map((n) => (
                <option key={n.id} value={n.id}>
                  Kho {pad(n.id)}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={selectedIds.length === 0 || !stackTarget}
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
            Tên tòa:
            <input
              value={currentBuilding.name}
              onChange={(e) => patchBuilding({ name: e.target.value })}
              className="w-36 rounded-lg border border-slate-200 px-2 py-1 font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>

          <div className="flex items-center gap-2 text-slate-500">
            <span>Rộng (ngang):</span>
            <input
              type="text"
              inputMode="numeric"
              value={inputBuildingWidth}
              onChange={(e) => setInputBuildingWidth(e.target.value)}
              onBlur={() => {
                const val = clamp(Number(inputBuildingWidth) || currentBuilding.width, 100, 1500);
                setInputBuildingWidth(String(val));
                patchBuilding({ width: val });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = clamp(Number(inputBuildingWidth) || currentBuilding.width, 100, 1500);
                  setInputBuildingWidth(String(val));
                  patchBuilding({ width: val });
                  e.currentTarget.blur();
                }
              }}
              title="Nhập số và bấm ra ngoài (hoặc Enter) để áp dụng"
              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              type="button"
              className={btn}
              onClick={() => {
                const val = clamp(currentBuilding.width - 20, 100, 1500);
                setInputBuildingWidth(String(val));
                patchBuilding({ width: val });
              }}
            >
              −20
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                const val = clamp(currentBuilding.width + 20, 100, 1500);
                setInputBuildingWidth(String(val));
                patchBuilding({ width: val });
              }}
            >
              +20
            </button>
          </div>

          <div className="flex items-center gap-2 text-slate-500">
            <span>Dài/Cao (dọc):</span>
            <input
              type="text"
              inputMode="numeric"
              value={inputBuildingHeight}
              onChange={(e) => setInputBuildingHeight(e.target.value)}
              onBlur={() => {
                const val = clamp(Number(inputBuildingHeight) || currentBuilding.height, 100, 1000);
                setInputBuildingHeight(String(val));
                patchBuilding({ height: val });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = clamp(Number(inputBuildingHeight) || currentBuilding.height, 100, 1000);
                  setInputBuildingHeight(String(val));
                  patchBuilding({ height: val });
                  e.currentTarget.blur();
                }
              }}
              title="Nhập số và bấm ra ngoài (hoặc Enter) để áp dụng"
              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              type="button"
              className={btn}
              onClick={() => {
                const val = clamp(currentBuilding.height - 20, 100, 1000);
                setInputBuildingHeight(String(val));
                patchBuilding({ height: val });
              }}
            >
              −20
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                const val = clamp(currentBuilding.height + 20, 100, 1000);
                setInputBuildingHeight(String(val));
                patchBuilding({ height: val });
              }}
            >
              +20
            </button>
          </div>

          <button
            type="button"
            onClick={() => removeBuilding(currentBuilding.id)}
            title="Xóa tòa nhà này. Các ô kho bên trong sẽ tự động ra ngoài tòa nhà, không bị mất kho."
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"
          >
            <Trash2 className="h-3.5 w-3.5" /> Xóa tòa nhà (giữ nguyên kho)
          </button>
        </div>
      )}

      {/* THANH CẤU HÌNH Ô KHO ĐANG CHỌN */}
      {edit && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white p-2.5 text-xs shadow-xs">
          <span className="font-mono text-xs font-extrabold text-emerald-800">
            📦 {selectedIds.length === 1 ? `KHO ${pad(selectedIds[0])}` : `Đang chọn ${selectedIds.length} kho`}
          </span>

          <label className="flex items-center gap-1.5 text-slate-500">
            Gán vào tòa nhà:
            <select
              value={singleSelectedNode?.buildingId ?? ""}
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

          {/* CHỈNH SỬA DÀI/RỘNG Ô KHO TRỰC TIẾP */}
          <div className="flex items-center gap-2 text-slate-500">
            <span>Rộng ô:</span>
            <input
              type="text"
              inputMode="numeric"
              value={inputNodeWidth}
              onChange={(e) => setInputNodeWidth(e.target.value)}
              onBlur={() => {
                const val = clamp(Number(inputNodeWidth) || (singleSelectedNode?.width ?? NODE_W), 60, 400);
                setInputNodeWidth(String(val));
                patchSelected({ width: val });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = clamp(Number(inputNodeWidth) || (singleSelectedNode?.width ?? NODE_W), 60, 400);
                  setInputNodeWidth(String(val));
                  patchSelected({ width: val });
                  e.currentTarget.blur();
                }
              }}
              title="Nhập số và bấm ra ngoài (hoặc Enter) để áp dụng"
              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <button
              type="button"
              className={btn}
              onClick={() => {
                const val = clamp((singleSelectedNode?.width ?? NODE_W) - 10, 60, 400);
                setInputNodeWidth(String(val));
                patchSelected({ width: val });
              }}
            >
              −
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                const val = clamp((singleSelectedNode?.width ?? NODE_W) + 10, 60, 400);
                setInputNodeWidth(String(val));
                patchSelected({ width: val });
              }}
            >
              +
            </button>
          </div>

          <div className="flex items-center gap-2 text-slate-500">
            <span>Dài/Cao ô:</span>
            <input
              type="text"
              inputMode="numeric"
              value={inputNodeHeight}
              onChange={(e) => setInputNodeHeight(e.target.value)}
              onBlur={() => {
                const val = clamp(Number(inputNodeHeight) || (singleSelectedNode?.height ?? NODE_H), 40, 300);
                setInputNodeHeight(String(val));
                patchSelected({ height: val });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = clamp(Number(inputNodeHeight) || (singleSelectedNode?.height ?? NODE_H), 40, 300);
                  setInputNodeHeight(String(val));
                  patchSelected({ height: val });
                  e.currentTarget.blur();
                }
              }}
              title="Nhập số và bấm ra ngoài (hoặc Enter) để áp dụng"
              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <button
              type="button"
              className={btn}
              onClick={() => {
                const val = clamp((singleSelectedNode?.height ?? NODE_H) - 8, 40, 300);
                setInputNodeHeight(String(val));
                patchSelected({ height: val });
              }}
            >
              −
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                const val = clamp((singleSelectedNode?.height ?? NODE_H) + 8, 40, 300);
                setInputNodeHeight(String(val));
                patchSelected({ height: val });
              }}
            >
              +
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-slate-500">
            <span>Tầng</span>
            <button
              type="button"
              className={btn}
              onClick={() =>
                patchSelected({ floor: Math.max(1, (singleSelectedNode?.floor ?? 1) - 1) })
              }
            >
              −
            </button>
            <span className="w-4 text-center font-bold text-slate-800">
              {singleSelectedNode?.floor ?? 1}
            </span>
            <button
              type="button"
              className={btn}
              onClick={() => patchSelected({ floor: (singleSelectedNode?.floor ?? 1) + 1 })}
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* KHUNG BẢN ĐỒ 2D CANVAS */}
      <div ref={containerRef} className="relative h-[560px] overflow-auto rounded-xl border border-slate-200 bg-slate-100 sm:h-[660px]">
        <div style={{ width: WORLD_W * scale, height: WORLD_H * scale, position: "relative" }}>
          <div
            onClick={() => {
              if (edit) {
                setSelectedIds([]);
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
            {/* LỚP NỀN LƯỚI TỌA ĐỘ */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: snapGrid
                  ? "linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)"
                  : "radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)",
                backgroundSize: snapGrid ? "20px 20px" : "24px 24px",
                opacity: snapGrid ? 0.45 : 1,
              }}
            />

            {/* KHUNG CÁC TÒA NHÀ */}
            {layout.buildings.map((b) => {
              const pos = dragBuilding && dragBuilding.id === b.id ? dragBuilding : b;
              const isBuildingSelected = edit && selectedBuilding === b.id;

              // Kiểm tra xem tòa nhà này có chứa kho đang được tìm thấy không
              const buildingWarehouses = visibleNodes.filter((n) => n.buildingId === b.id);
              const matchedInBuilding = buildingWarehouses.filter(
                (n) => highlight === n.id || highlightWarehouses.includes(n.id)
              );
              const hasHighlightWarehouse = matchedInBuilding.length > 0;

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
                      setSelectedIds([]);
                    }
                  }}
                  className={`absolute rounded-2xl border-2 transition-all ${
                    isBuildingSelected
                      ? "border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-400"
                      : hasHighlightWarehouse && !edit
                      ? "border-emerald-500 bg-emerald-50/70 ring-4 ring-emerald-400/40 shadow-lg"
                      : b.color || "border-slate-300 bg-white/50"
                  }`}
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: b.width,
                    height: b.height,
                    zIndex: hasHighlightWarehouse ? 3 : 2,
                    touchAction: edit ? "none" : "auto",
                    cursor: edit ? "grab" : "default",
                  }}
                >
                  <div className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`rounded-md px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white shadow-xs ${
                          hasHighlightWarehouse && !edit ? "bg-emerald-700 animate-pulse" : "bg-slate-800"
                        }`}
                      >
                        🏢 {b.name}
                      </span>
                      {hasHighlightWarehouse && !edit && (
                        <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-black text-emerald-900 border border-emerald-400">
                          🎯 Có {matchedInBuilding.length} kho khớp tìm kiếm
                        </span>
                      )}
                    </div>
                    {edit && (
                      <span className="text-[10px] font-bold text-slate-500 bg-white/80 rounded px-1.5 py-0.5">
                        {b.width}×{b.height}px
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* CÁC Ô KHO */}
            {visibleNodes
              .filter((n) => activeFloorFilter === "all" || (n.floor ?? 1) === activeFloorFilter)
              .map((n) => {
              const stat = stats.get(n.id) ?? { count: 0, matched: [] };
              const pos = dragNode && dragNode.id === n.id ? dragNode : n;
              const w = n.width ?? NODE_W;
              const h = n.height ?? NODE_H;
              const floor = n.floor ?? 1;
              const isMatched =
                highlight === n.id || highlightWarehouses.includes(n.id);
              const isNodeSelected = edit && selectedIds.includes(n.id);

              // Khi ở chế độ xem 'Cả 2 tầng', các ô tầng 2 trở lên sẽ được lệch nhẹ (offset) lên trên-phải
              // để lộ rõ ô tầng 1 bên dưới, không bao giờ bị che lấp hoàn toàn
              const floorOffsetX = activeFloorFilter === "all" && floor > 1 ? (floor - 1) * 12 : 0;
              const floorOffsetY = activeFloorFilter === "all" && floor > 1 ? -(floor - 1) * 12 : 0;

              const badge =
                stat.count === 0
                  ? { cls: "bg-slate-100 text-slate-400", text: "Trống" }
                  : stat.count >= FULL_AT
                  ? { cls: "bg-amber-100 text-amber-700", text: `Đầy ${stat.count}` }
                  : { cls: "bg-emerald-100 text-emerald-800", text: `${stat.count} mã` };
              const cls = edit
                ? isNodeSelected
                  ? "border-indigo-500 bg-white ring-2 ring-indigo-500 shadow-xl"
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
                  title={`KHO ${pad(n.id)} (Tầng ${floor}) · ${stat.count} mã · ${buildingName(n.buildingId) || "Ngoài tòa"}`}
                  style={{
                    left: pos.x + floorOffsetX,
                    top: pos.y + floorOffsetY,
                    width: w,
                    height: h,
                    zIndex: 10 + floor * 5,
                    touchAction: edit ? "none" : "auto",
                    cursor: edit ? "grab" : "pointer",
                  }}
                  className={`absolute flex flex-col justify-between rounded-lg border p-2 text-left transition-all ${cls} ${
                    floor > 1
                      ? "ring-2 ring-indigo-400/80 shadow-lg border-indigo-300 bg-indigo-50/40"
                      : "shadow-xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs font-extrabold tracking-tight text-slate-800">
                        KHO {pad(n.id)}
                      </span>
                      {floor > 1 && (
                        <span className="rounded bg-indigo-600 px-1 py-0.2 text-[9px] font-black text-white shadow-2xs">
                          T{floor}
                        </span>
                      )}
                    </div>
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
                    <span className={`rounded px-1 font-bold ${floor > 1 ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                      Tầng {floor}
                    </span>
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
