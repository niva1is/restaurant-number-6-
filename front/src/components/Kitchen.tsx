import React, { useEffect } from "react";
import { useOrder } from "../context/OrderContext";
import type { Order, OrderStatus } from "../types";
import { staffSocket as socket } from "../socket";

const statusLabel: Record<OrderStatus, string> = {
  ACCEPTED: "Новый",
  COOKING: "Готовится",
  READY: "Готов",
  SERVED: "Подан",
  PAID: "Оплачен",
  CANCELLED: "Отменён",
};

function OrderCard({ order }: { order: Order }) {
  const { updateOrderStatus } = useOrder();

  const nextAction =
    order.status === "ACCEPTED"
      ? { status: "COOKING" as OrderStatus, label: "Начать готовить" }
      : order.status === "COOKING"
        ? { status: "READY" as OrderStatus, label: "Готово" }
        : null;

  return (
    <div className="k-card">
      <div className="k-card-header">
        <span className="k-table">Стол {order.tableNumber}</span>
        <span className={`k-badge k-badge-${order.status.toLowerCase()}`}>
          {statusLabel[order.status]}
        </span>
      </div>

      <div className="k-items">
        {order.items.map((item) => (
          <div key={item.dish.id} className="k-item">
            <span>
              {item.quantity}× {item.dish.name}
            </span>
          </div>
        ))}
      </div>

      {nextAction && (
        <button
          className="k-action"
          onClick={() => updateOrderStatus(order.id, nextAction.status)}
        >
          {nextAction.label}
        </button>
      )}
    </div>
  );
}

export const Kitchen: React.FC = () => {
  const { getOrdersByStatus, fetchOrders } = useOrder();

  // Запрашиваем заказы у бэкенда при загрузке страницы и обновляем статус
  useEffect(() => {
    socket.connect();
    
    const onStatusChanged = () => {
      fetchOrders();
    };

    socket.on("ORDER_STATUS_CHANGED", onStatusChanged);
    
    return () => {
      socket.off("ORDER_STATUS_CHANGED", onStatusChanged);
      socket.disconnect();
    };
  }, []);

  const active = getOrdersByStatus(["ACCEPTED", "COOKING"]);
  const ready = getOrdersByStatus(["READY"]);

  return (
    <div className="k-page">
      <header className="k-header">
        <h1>Кухня</h1>
        <span className="k-count">{active.length} активных</span>
      </header>

      {active.length === 0 && ready.length === 0 && (
        <div className="k-empty">Нет заказов</div>
      )}

      {active.length > 0 && (
        <section className="k-section">
          <h2>В работе</h2>
          <div className="k-grid">
            {active.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        </section>
      )}

      {ready.length > 0 && (
        <section className="k-section">
          <h2>Готово к выдаче</h2>
          <div className="k-grid">
            {ready.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};