import React from "react";
import { useCart } from "../context/CartContext";
import { useOrder } from "../context/OrderContext";
import { useNavigate } from "react-router-dom";

interface CartProps {
  tableNumber: number;
}

export const Cart: React.FC<CartProps> = ({ tableNumber }) => {
  const { items, updateQuantity, removeFromCart, totalAmount, clearCart } =
    useCart();
  const { createOrder } = useOrder();
  const navigate = useNavigate();

  const handleCheckout = () => {
    createOrder(items, tableNumber);
    clearCart();
    navigate(`/t/${tableNumber}/order-status`);
  };

  if (items.length === 0) {
    return (
      <div className="cart-empty">
        <h2>Корзина пуста</h2>
        <p>Добавьте блюда из меню</p>
        <button
          onClick={() => navigate(`/t/${tableNumber}`)}
          className="back-button"
        >
          Вернуться к меню
        </button>
      </div>
    );
  }

  return (
    <div className="cart">
      <h2 className="cart-title">Ваш заказ</h2>
      <div className="cart-items">
        {items.map((item) => (
          <div key={item.dish.id} className="cart-item">
            <img
              src={item.dish.image}
              alt={item.dish.name}
              className="cart-item-image"
            />
            <div className="cart-item-info">
              <h3 className="cart-item-name">{item.dish.name}</h3>
              <p className="cart-item-price">{item.dish.price} ₽</p>
            </div>
            <div className="cart-item-controls">
              <button
                onClick={() => updateQuantity(item.dish.id, item.quantity - 1)}
              >
                -
              </button>
              <span>{item.quantity}</span>
              <button
                onClick={() => updateQuantity(item.dish.id, item.quantity + 1)}
              >
                +
              </button>
              <button
                onClick={() => removeFromCart(item.dish.id)}
                className="remove-button"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="cart-summary">
        <div className="cart-total">
          <span>Итого:</span>
          <span className="total-amount">{totalAmount} ₽</span>
        </div>
        <button onClick={handleCheckout} className="checkout-button">
          Отправить заказ на кухню
        </button>
      </div>
    </div>
  );
};
