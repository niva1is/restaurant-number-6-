import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import type {
  Order,
  OrderStatus,
  StatusEvent,
  WaiterCall,
  CartItem,
} from "../types";

interface OrderContextType {
  orders: Order[];
  waiterCalls: WaiterCall[];
  createOrder: (items: CartItem[], tableNumber: number) => string;
  updateOrderStatus: (orderId: string, status: OrderStatus, by: string) => void;
  callWaiter: (tableNumber: number) => void;
  acceptWaiterCall: (callId: string) => void;
  cancelWaiterCall: (callId: string) => void;
  getOrderById: (id: string) => Order | undefined;
  getOrdersByStatus: (statuses: OrderStatus[]) => Order[];
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

const STORAGE_KEY = "restaurant-orders-v1";

const validTransitions: Record<OrderStatus, OrderStatus[]> = {
  ACCEPTED: ["COOKING", "CANCELLED"],
  COOKING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: ["PAID"],
  PAID: [],
  CANCELLED: [],
};

interface StoredData {
  orders: Order[];
  waiterCalls: WaiterCall[];
}

function loadFromStorage(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { orders: [], waiterCalls: [] };
    return JSON.parse(raw);
  } catch {
    return { orders: [], waiterCalls: [] };
  }
}

function saveToStorage(data: StoredData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  // Чтобы другие вкладки узнали об изменении
  window.dispatchEvent(new Event("restaurant-storage-update"));
}

export const OrderProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [orders, setOrders] = useState<Order[]>(() => loadFromStorage().orders);
  const [waiterCalls, setWaiterCalls] = useState<WaiterCall[]>(
    () => loadFromStorage().waiterCalls,
  );

  // Слушаем изменения из других вкладок
  useEffect(() => {
    const sync = () => {
      const data = loadFromStorage();
      setOrders(data.orders);
      setWaiterCalls(data.waiterCalls);
    };

    window.addEventListener("storage", sync);
    window.addEventListener("restaurant-storage-update", sync);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("restaurant-storage-update", sync);
    };
  }, []);

  const persist = useCallback((newOrders: Order[], newCalls: WaiterCall[]) => {
    setOrders(newOrders);
    setWaiterCalls(newCalls);
    saveToStorage({ orders: newOrders, waiterCalls: newCalls });
  }, []);

  const createOrder = useCallback(
    (items: CartItem[], tableNumber: number): string => {
      const now = new Date().toISOString();
      const id = `ORD-${Date.now()}`;
      const order: Order = {
        id,
        items,
        status: "ACCEPTED",
        tableNumber,
        createdAt: now,
        statusHistory: [
          { status: "ACCEPTED", timestamp: now, initiatedBy: "Гость" },
        ],
      };
      const newOrders = [order, ...orders];
      persist(newOrders, waiterCalls);
      return id;
    },
    [orders, waiterCalls, persist],
  );

  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, by: string) => {
      const newOrders = orders.map((order) => {
        if (order.id !== orderId) return order;
        if (!validTransitions[order.status].includes(status)) {
          console.error(`Недопустимый переход: ${order.status} → ${status}`);
          return order;
        }
        const event: StatusEvent = {
          status,
          timestamp: new Date().toISOString(),
          initiatedBy: by,
        };
        return {
          ...order,
          status,
          statusHistory: [...order.statusHistory, event],
        };
      });
      persist(newOrders, waiterCalls);
    },
    [orders, waiterCalls, persist],
  );

  const callWaiter = useCallback(
    (tableNumber: number) => {
      // Не создаём дубль активного вызова
      if (
        waiterCalls.some(
          (c) => c.tableNumber === tableNumber && c.status === "PENDING",
        )
      ) {
        return;
      }
      const call: WaiterCall = {
        id: `CALL-${Date.now()}`,
        tableNumber,
        timestamp: new Date().toISOString(),
        status: "PENDING",
      };
      const newCalls = [call, ...waiterCalls];
      persist(orders, newCalls);
    },
    [orders, waiterCalls, persist],
  );

  const acceptWaiterCall = useCallback(
    (callId: string) => {
      const newCalls = waiterCalls.map((c) =>
        c.id === callId ? { ...c, status: "ACCEPTED" as const } : c,
      );
      persist(orders, newCalls);
    },
    [orders, waiterCalls, persist],
  );

  const cancelWaiterCall = useCallback(
    (callId: string) => {
      const newCalls = waiterCalls.filter((c) => c.id !== callId);
      persist(orders, newCalls);
    },
    [orders, waiterCalls, persist],
  );

  const getOrderById = useCallback(
    (id: string) => orders.find((o) => o.id === id),
    [orders],
  );

  const getOrdersByStatus = useCallback(
    (statuses: OrderStatus[]) =>
      orders.filter((o) => statuses.includes(o.status)),
    [orders],
  );

  return (
    <OrderContext.Provider
      value={{
        orders,
        waiterCalls,
        createOrder,
        updateOrderStatus,
        callWaiter,
        acceptWaiterCall,
        cancelWaiterCall,
        getOrderById,
        getOrdersByStatus,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
};

export const useOrder = () => {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrder must be used within OrderProvider");
  return ctx;
};
