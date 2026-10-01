export interface Item {
  sku: string;
  name: string;
  warehouse: number;
  qty: number;
  updatedAt: string;
}

export type HistoryAction = "in" | "out" | "transfer";

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
}

export interface ItemsResponse {
  items: Item[];
  messages: ZaloMessage[];
  history: ItemHistory[];
  totalWarehouses: number;
}
