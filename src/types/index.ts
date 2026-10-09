export interface Item {
  sku: string;
  name: string;
  warehouse: number;
  qty: number;
  updatedAt: string;
  status?: "active" | "sold";
  soldAt?: string;
  soldNote?: string;
}

export type HistoryAction = "in" | "out" | "transfer" | "sold" | "restock";

export interface ItemHistory {
  id: string;
  sku: string;
  action: HistoryAction;
  fromWarehouse: number | null;
  toWarehouse: number | null;
  note: string;
  createdAt: string;
}

export type NotificationCategory = "all" | "in" | "out" | "duplicate" | "sold" | "error" | "system";

export interface ZaloMessage {
  id: string;
  groupId: string;
  warehouse: number | null;
  message: string;
  status: "ok" | "error";
  detail: string;
  createdAt: string;
  read?: boolean;
  botName?: string;
}

export interface BotStatusEntry {
  name: string;
  online: boolean;
  lastPing: string | null;
}

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

export interface ItemsResponse {
  items: Item[];
  messages: ZaloMessage[];
  history: ItemHistory[];
  totalWarehouses: number;
  mapLayout?: MapLayout | null;
  botStatus?: {
    online: boolean;
    lastPing: string | null;
    bots: BotStatusEntry[];
  };
  dbStatus?: {
    connected: boolean;
    type: "supabase" | "local";
    latencyMs?: number;
    itemCount?: number;
  };
}

