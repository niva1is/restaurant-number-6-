import React from "react";
import { useOrder } from "../context/OrderContext";
import type { Order, OrderStatus } from "../types";

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
      : order.status === "SERVED"
        ? { status: "PAID" as OrderStatus, label: "Оплачен" }
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
        Итого: {order.items.reduce((s, i) => s + i.dish.price * i.quantity, 0)}{" "}
        ₽
      </div>

      {nextAction && (
        <button
          className="w-action"
          onClick={() =>
            updateOrderStatus(order.id, nextAction.status, "Официант")
          }
        >
          {nextAction.label}
        </button>
      )}
    </div>
  );
}

export const Waiter: React.FC = () => {
  const { getOrdersByStatus, waiterCalls, acceptWaiterCall } = useOrder();

  const ready = getOrdersByStatus(["READY"]);
  const served = getOrdersByStatus(["SERVED"]);
  const pendingCalls = waiterCalls.filter((c) => c.status === "PENDING");

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
            {pendingCalls.map((call) => (
              <div key={call.id} className="w-call">
                <div>
                  <strong>Стол {call.tableNumber}</strong>
                  <span className="w-call-time">
                    {new Date(call.timestamp).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <button
                  className="w-call-btn"
                  onClick={() => acceptWaiterCall(call.id)}
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
