import React, { useEffect, useState } from "react";
import type { Order, OrderStatus as OrderStatusType } from "../types";
import { useNavigate } from "react-router-dom";
import { guestSocket as socket } from "../socket";

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
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [activeCall, setActiveCall] = useState(false);
  
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL;
  const tableToken = localStorage.getItem("table_token") || "";
  const currentOrderId = localStorage.getItem("current_order_id");

  // Функция загрузки данных заказа
  const fetchOrder = async () => {
    try {
      const res = await fetch(`${API_URL}/orders/my`, {
        headers: { "X-Table-Token": tableToken }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          const found = data.find((o: any) => String(o.id) === currentOrderId) || data[data.length - 1];

          setCurrentOrder({
            id: String(found.id),
            status: found.status,
            tableNumber: found.tableNumber,
            createdAt: found.createdAt,
            items: found.items.map((i: any) => ({
              quantity: i.quantity,
              dish: {
                id: String(i.dishId),
                name: i.dishName,
                price: Number(i.orderedPrice)
              }
            })),
            statusHistory: []
          });
        }
      }
    } catch (err) {
      console.error("Ошибка загрузки заказа", err);
    } finally {
      setLoading(false);
    }
  };

  //Обновление статуса
  useEffect(() => {
    fetchOrder();
    socket.connect();

    const onStatusChanged = (data: any) => {
      console.log("Сокет: статус заказа изменился", data);
      if (String(data.orderId) === currentOrderId) {
        fetchOrder();
      }
    };

    const onCallResolved = () => {
       setActiveCall(false);
    };

    socket.on("ORDER_STATUS_CHANGED", onStatusChanged);
    socket.on("WAITER_CALL_RESOLVED", onCallResolved);

    return () => {
      socket.off("ORDER_STATUS_CHANGED", onStatusChanged);
      socket.off("WAITER_CALL_RESOLVED", onCallResolved);
      socket.disconnect();
    };
  }, [currentOrderId]);

  // Обработчик вызова официанта
  const handleCallWaiter = async () => {
    try {
      const res = await fetch(`${API_URL}/notifications/call-waiter`, {
        method: "POST",
        headers: { "X-Table-Token": tableToken }
      });
      if (res.ok) {
        setActiveCall(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Обработчик отмены вызова
  const handleCancelCall = () => {
    setActiveCall(false);
  };

  if (loading) {
    return <div className="order-status-empty">Загрузка...</div>;
  }

  if (!currentOrder) {
    return (
      <div className="order-status-empty">
        <h2>Нет активного заказа</h2>
        <button
          onClick={() => navigate(`/t/${tableToken}`)}
          className="back-button"
        >
          Вернуться к меню
        </button>
      </div>
    );
  }

  const statusOrder: OrderStatusType[] = ["ACCEPTED", "COOKING", "READY", "SERVED", "PAID"];
  const currentIndex = statusOrder.indexOf(currentOrder.status);

  const isPaid = currentOrder.status === "PAID";

  return (
    <div className="order-status">
      <h2 className="order-status-title">
        Статус заказа #{currentOrder.id.slice(-4)}
      </h2>

      <div className="status-timeline">
        {statusOrder.map((status, index) => {
          const isCompleted = isPaid || index < currentIndex;
          const isActive = index === currentIndex && !isPaid;

          return (
            <div
              key={status}
              className={`status-step ${
                isCompleted ? "completed" : isActive ? "active" : "pending"
              }`}
            >
              <div className="status-icon">{statusIcons[status]}</div>
              <div className="status-label">{statusLabels[status]}</div>
            </div>
          );
        })}
      </div>

      <div className="order-details">
        <h3>Состав заказа</h3>
        <div className="order-items">
          {currentOrder.items.map((item, idx) => (
            <div key={idx} className="order-item">
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
            onClick={handleCallWaiter}
            className="call-waiter-button"
          >
            🙋 Вызвать официанта
          </button>
        ) : (
          <div className="waiter-call-status pending">
            <p>⏳ Официант уведомлен, ожидайте...</p>
            <button
              onClick={handleCancelCall}
              className="cancel-call-button"
            >
              Отменить вызов
            </button>
          </div>
        )}
      </div>

      {(currentOrder.status === "PAID" || currentOrder.status === "CANCELLED") && (
        <button
          onClick={() => navigate(`/t/${tableToken}`)}
          className="new-order-button"
        >
          Новый заказ
        </button>
      )}
    </div>
  );
};