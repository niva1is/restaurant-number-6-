import React from "react";
import { useOrder } from "../context/OrderContext";
import { useMenu } from "../context/MenuContext";
import type { OrderStatus } from "../types";

const statusLabel: Record<OrderStatus, string> = {
  ACCEPTED: "Принят",
  COOKING: "Готовится",
  READY: "Готов",
  SERVED: "Подан",
  PAID: "Оплачен",
  CANCELLED: "Отменён",
};

const statusColor: Record<OrderStatus, string> = {
  ACCEPTED: "#e8f5e9",
  COOKING: "#fff3e0",
  READY: "#e3f2fd",
  SERVED: "#f3e5f5",
  PAID: "#e0e0e0",
  CANCELLED: "#ffebee",
};

export const Admin: React.FC = () => {
  const { orders } = useOrder();
  const { dishes, toggleStock } = useMenu();

  const activeOrders = orders.filter(
    (o) => o.status !== "PAID" && o.status !== "CANCELLED",
  );
  const finishedOrders = orders.filter(
    (o) => o.status === "PAID" || o.status === "CANCELLED",
  );

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Администратор</h1>
      </header>

      {/* Стоп-лист */}
      <section className="admin-section">
        <h2>Стоп-лист</h2>
        <div className="admin-dishes">
          {dishes.map((dish) => (
            <div key={dish.id} className="admin-dish">
              <div className="admin-dish-info">
                <span className="admin-dish-name">{dish.name}</span>
                <span className="admin-dish-price">{dish.price} ₽</span>
              </div>
              <button
                className={`admin-stock-btn ${dish.inStock ? "in" : "out"}`}
                onClick={() => toggleStock(dish.id)}
              >
                {dish.inStock ? "В наличии" : "Стоп"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Активные заказы */}
      <section className="admin-section">
        <h2>Активные заказы ({activeOrders.length})</h2>
        {activeOrders.length === 0 ? (
          <div className="admin-empty">Нет активных заказов</div>
        ) : (
          <div className="admin-orders">
            {activeOrders.map((order) => (
              <div key={order.id} className="admin-order">
                <div className="admin-order-top">
                  <span className="admin-order-table">
                    Стол {order.tableNumber}
                  </span>
                  <span
                    className="admin-order-status"
                    style={{ background: statusColor[order.status] }}
                  >
                    {statusLabel[order.status]}
                  </span>
                </div>
                <div className="admin-order-items">
                  {order.items.map((item) => (
                    <div key={item.dish.id}>
                      {item.quantity}× {item.dish.name}
                    </div>
                  ))}
                </div>
                <div className="admin-order-meta">
                  #{order.id.slice(-4)} ·{" "}
                  {new Date(order.createdAt).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Завершённые */}
      {finishedOrders.length > 0 && (
        <section className="admin-section">
          <h2>Завершённые ({finishedOrders.length})</h2>
          <div className="admin-orders">
            {finishedOrders.slice(0, 10).map((order) => (
              <div key={order.id} className="admin-order finished">
                <div className="admin-order-top">
                  <span className="admin-order-table">
                    Стол {order.tableNumber}
                  </span>
                  <span
                    className="admin-order-status"
                    style={{ background: statusColor[order.status] }}
                  >
                    {statusLabel[order.status]}
                  </span>
                </div>
                <div className="admin-order-meta">
                  #{order.id.slice(-4)} ·{" "}
                  {new Date(order.createdAt).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
