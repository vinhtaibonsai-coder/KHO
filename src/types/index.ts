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

export interface ZaloMessage {
  id: string;
  groupId: string;
  warehouse: number | null;
  message: string;
  status: "ok" | "error";
  detail: string;
  createdAt: string;
  read?: boolean;
}

export interface ItemsResponse {
  items: Item[];
  messages: ZaloMessage[];
  history: ItemHistory[];
  totalWarehouses: number;
}

