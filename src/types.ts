export interface Dish {
  id: string;
  name: string;
  description: string;
  price: number;
  calories: number;
  ingredients: string[];
  category: string;
  image: string;
  inStock: boolean;
}

export interface CartItem {
  dish: Dish;
  quantity: number;
}

export type OrderStatus =
  | "ACCEPTED"
  | "COOKING"
  | "READY"
  | "SERVED"
  | "PAID"
  | "CANCELLED";

export interface StatusEvent {
  status: OrderStatus;
  timestamp: string;
  initiatedBy: string;
}

export interface Order {
  id: string;
  items: CartItem[];
  status: OrderStatus;
  tableNumber: number;
  createdAt: string;
  statusHistory: StatusEvent[];
}

export interface WaiterCall {
  id: string;
  tableNumber: number;
  timestamp: string;
  status: "PENDING" | "ACCEPTED";
}
