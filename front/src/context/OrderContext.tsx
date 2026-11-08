import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import type { Order, OrderStatus, WaiterCall, CartItem } from "../types";

const API_URL = import.meta.env.VITE_API_URL;

interface OrderContextType {
  orders: Order[];
  waiterCalls: WaiterCall[];
  createOrder: (items: CartItem[], _tableNumber: number) => Promise<string | undefined>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  callWaiter: (_tableNumber: number) => Promise<void>;
  acceptWaiterCall: (callId: string) => Promise<void>;
  cancelWaiterCall: (callId: string) => Promise<void>;
  getOrderById: (id: string) => Order | undefined;
  getOrdersByStatus: (statuses: OrderStatus[]) => Order[];
  fetchOrders: () => Promise<void>;
  fetchWaiterCalls: () => Promise<void>;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export const OrderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [waiterCalls, setWaiterCalls] = useState<WaiterCall[]>([]);

  // Заказы
  const fetchOrders = useCallback(async () => {
    const token = localStorage.getItem("staff_token");
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/orders/active`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        const formattedOrders: Order[] = data.map((o: any) => ({
          id: String(o.id),
          status: o.status,
          tableNumber: o.tableNumber || "?",
          createdAt: o.createdAt,
          items: o.items.map((i: any) => ({
            quantity: i.quantity,
            dish: {
              id: String(i.dishId),
              name: i.dishName || "Блюдо",
              price: Number(i.orderedPrice)
            }
          })),
          statusHistory: o.statusHistory || [],
        }));
        setOrders(formattedOrders);
      }
    } catch (err) {
      console.error("Ошибка загрузки заказов", err);
    }
  }, []);

    const fetchWaiterCalls = useCallback(async () => {
    const token = localStorage.getItem("staff_token");
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/notifications/calls/active`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setWaiterCalls(data); 
      }
    } catch (err) {
      console.error("Ошибка загрузки вызовов", err);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Создание заказа
  const createOrder = useCallback(async (items: CartItem[], _tableNumber: number) => {
    const token = localStorage.getItem("table_token");
    if (!token) {
      alert("Ошибка: не найден токен стола.");
      return undefined;
    }

    const expectedTotal = items.reduce((sum, item) => sum + (item.dish.price * item.quantity), 0);

    try {
      const res = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Table-Token": token,
        },
        body: JSON.stringify({
          items: items.map(item => ({ dishId: Number(item.dish.id), quantity: item.quantity })),
          expectedTotal: expectedTotal
        }),
      });

      if (!res.ok) throw new Error("Ошибка при создании заказа");
      const newOrderData = await res.json();
      return String(newOrderData.id);
    } catch (error: any) {
      console.error(error);
      return undefined;
    }
  }, []);

  // Смена статуса
  const updateOrderStatus = useCallback(async (orderId: string, status: OrderStatus) => {
    const token = localStorage.getItem("staff_token");
    if (!token) return alert("Вы не авторизованы!");

    try {
      const res = await fetch(`${API_URL}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status }), 
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Ошибка смены статуса");
      }
      await fetchOrders();
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Не удалось изменить статус");
    }
  }, [fetchOrders]);

  // Вызов официанта
  const callWaiter = useCallback(async (_tableNumber: number) => {
    const token = localStorage.getItem("table_token");
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/notifications/call-waiter`, {
        method: "POST",
        headers: { "X-Table-Token": token }
      });
      if (!res.ok) throw new Error("Ошибка вызова");
    } catch (err) {
      console.error(err);
      alert("Не удалось вызвать официанта");
    }
  }, []);

  const acceptWaiterCall = useCallback(async (eventId: string) => {
    const token = localStorage.getItem("staff_token");
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/notifications/call-waiter/${eventId}/resolve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        await fetchWaiterCalls();
      } else {
        const error = await res.json();
        alert(error.message || "Не удалось принять вызов");
      }
    } catch (err) {
      console.error(err);
    }
  }, [fetchWaiterCalls]);

  // Заглушка для отмены
  const cancelWaiterCall = useCallback(async (_callId: string) => {}, []);
  
  const getOrderById = useCallback((id: string) => orders.find((o) => o.id === id), [orders]);
  const getOrdersByStatus = useCallback((statuses: OrderStatus[]) => orders.filter((o) => statuses.includes(o.status)), [orders]);

  return (
    <OrderContext.Provider
      value={{
        orders, waiterCalls, createOrder, updateOrderStatus, callWaiter,
        acceptWaiterCall, cancelWaiterCall, getOrderById, getOrdersByStatus, 
        fetchOrders, fetchWaiterCalls
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