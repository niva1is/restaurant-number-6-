import React, { useEffect } from "react";
import { useOrder } from "../context/OrderContext";
import type { Order, OrderStatus } from "../types";
import { staffSocket as socket } from "../socket";

const statusLabel: Record<OrderStatus, string> = {
  ACCEPTED: "Принят",
  COOKING: "Готовится",
  READY: "Готов",
  SERVED: "Подан",
  PAID: "Оплачен",
  CANCELLED: "Отменён",
};

function OrderCard({ order }: { order: Order }) {
  const { updateOrderStatus } = useOrder();

  const nextAction =
    order.status === "READY"
      ? { status: "SERVED" as OrderStatus, label: "Подать" }
      : null;

  return (
    <div className="w-card">
      <div className="w-card-header">
        <span className="w-table">Стол {order.tableNumber}</span>
        <span className={`w-badge w-badge-${order.status.toLowerCase()}`}>
          {statusLabel[order.status]}
        </span>
      </div>

      <div className="w-items">
        {order.items.map((item) => (
          <div key={item.dish.id} className="w-item">
            <span>
              {item.quantity}× {item.dish.name}
            </span>
            <span>{item.dish.price * item.quantity} ₽</span>
          </div>
        ))}
      </div>

      <div className="w-total">
        Итого: {order.items.reduce((s, i) => s + i.dish.price * i.quantity, 0)} ₽
      </div>

      {nextAction && (
        <button
          className="w-action"
          onClick={() => updateOrderStatus(order.id, nextAction.status)}
        >
          {nextAction.label}
        </button>
      )}
    </div>
  );
}

export const Waiter: React.FC = () => {
  const { getOrdersByStatus, waiterCalls, acceptWaiterCall, fetchOrders, fetchWaiterCalls } = useOrder();

  useEffect(() => {
    socket.connect();
    
    const onNewCall = (call: any) => {
      console.log("Новый вызов", call);
      fetchWaiterCalls();
    };
    const onStatusChanged = () => {
      fetchOrders();
    };
    
    socket.on("NEW_WAITER_CALL", onNewCall);
    socket.on("ORDER_STATUS_CHANGED", onStatusChanged);
    
    return () => {
      socket.off("NEW_WAITER_CALL", onNewCall);
      socket.off("ORDER_STATUS_CHANGED", onStatusChanged);
      socket.disconnect();
    };
  }, []);

  const ready = getOrdersByStatus(["READY"]);
  const served = getOrdersByStatus(["SERVED"]);
  
  const pendingCalls = waiterCalls.filter((c: any) => c.status === "PENDING" || !c.status);

  return (
    <div className="w-page">
      <header className="w-header">
        <h1>Официант</h1>
      </header>

      {/* Вызовы */}
      {pendingCalls.length > 0 && (
        <section className="w-section">
          <h2>Вызовы столов</h2>
          <div className="w-calls">
            {pendingCalls.map((call: any) => (
              <div key={call.eventId} className="w-call">
                <div>
                  <strong>Стол {call.tableNumber}</strong>
                  <span className="w-call-time">
                    {call.createdAt ? new Date(call.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "Только что"}
                  </span>
                </div>
                <button
                  className="w-call-btn"
                  onClick={() => acceptWaiterCall(call.eventId)}
                >
                  Принять
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Готовые заказы */}
      <section className="w-section">
        <h2>Готово к подаче ({ready.length})</h2>
        {ready.length === 0 ? (
          <div className="w-empty">Нет готовых заказов</div>
        ) : (
          <div className="w-grid">
            {ready.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </section>

      {/* Поданные */}
      {served.length > 0 && (
        <section className="w-section">
          <h2>Ожидают оплаты ({served.length})</h2>
          <div className="w-grid">
            {served.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};