import React from "react";
import { useOrder } from "../context/OrderContext";
import type { OrderStatus as OrderStatusType } from "../types";
import { useNavigate, useParams } from "react-router-dom";

const statusLabels: Record<OrderStatusType, string> = {
  ACCEPTED: "Принят",
  COOKING: "Готовится",
  READY: "Готов",
  SERVED: "Подан",
  PAID: "Оплачен",
  CANCELLED: "Отменен",
};

const statusIcons: Record<OrderStatusType, string> = {
  ACCEPTED: "📋",
  COOKING: "👨‍🍳",
  READY: "✅",
  SERVED: "🍽️",
  PAID: "💳",
  CANCELLED: "❌",
};

export const OrderStatus: React.FC = () => {
  const { tableId } = useParams();
  const tableNumber = Number(tableId) || 1;
  const { orders, waiterCalls, callWaiter, cancelWaiterCall } = useOrder();
  const navigate = useNavigate();

  // Берём последний заказ этого стола
  const currentOrder = orders.find(
    (o) =>
      o.tableNumber === tableNumber &&
      o.status !== "PAID" &&
      o.status !== "CANCELLED",
  );

  const activeCall = waiterCalls.find(
    (c) => c.tableNumber === tableNumber && c.status === "PENDING",
  );

  if (!currentOrder) {
    return (
      <div className="order-status-empty">
        <h2>Нет активного заказа</h2>
        <button
          onClick={() => navigate(`/t/${tableNumber}`)}
          className="back-button"
        >
          Вернуться к меню
        </button>
      </div>
    );
  }

  const statusOrder: OrderStatusType[] = [
    "ACCEPTED",
    "COOKING",
    "READY",
    "SERVED",
    "PAID",
  ];
  const currentIndex = statusOrder.indexOf(currentOrder.status);

  return (
    <div className="order-status">
      <h2 className="order-status-title">
        Статус заказа #{currentOrder.id.slice(-4)}
      </h2>

      <div className="status-timeline">
        {statusOrder.map((status, index) => (
          <div
            key={status}
            className={`status-step ${
              index < currentIndex
                ? "completed"
                : index === currentIndex
                  ? "active"
                  : "pending"
            }`}
          >
            <div className="status-icon">{statusIcons[status]}</div>
            <div className="status-label">{statusLabels[status]}</div>
          </div>
        ))}
      </div>

      <div className="order-details">
        <h3>Состав заказа</h3>
        <div className="order-items">
          {currentOrder.items.map((item) => (
            <div key={item.dish.id} className="order-item">
              <span>{item.dish.name}</span>
              <span>
                {item.quantity} × {item.dish.price} ₽
              </span>
            </div>
          ))}
        </div>
        <div className="order-total">
          <span>Итого:</span>
          <span>
            {currentOrder.items.reduce(
              (sum, item) => sum + item.dish.price * item.quantity,
              0,
            )}{" "}
            ₽
          </span>
        </div>
      </div>

      <div className="waiter-call-section">
        {!activeCall ? (
          <button
            onClick={() => callWaiter(tableNumber)}
            className="call-waiter-button"
          >
            🙋 Вызвать официанта
          </button>
        ) : (
          <div className="waiter-call-status pending">
            <p>⏳ Официант уведомлен, ожидайте...</p>
            <button
              onClick={() => cancelWaiterCall(activeCall.id)}
              className="cancel-call-button"
            >
              Отменить вызов
            </button>
          </div>
        )}
      </div>

      {currentOrder.status === "PAID" && (
        <button
          onClick={() => navigate(`/t/${tableNumber}`)}
          className="new-order-button"
        >
          Новый заказ
        </button>
      )}
    </div>
  );
};
