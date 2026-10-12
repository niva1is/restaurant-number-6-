import React from "react";
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";

interface HeaderProps {
  tableNumber: number;
}

export const Header: React.FC<HeaderProps> = ({ tableNumber }) => {
  const { totalItems } = useCart();
  const navigate = useNavigate();

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <div className="logo-mark">✦</div>
          <div>
            <h1 className="restaurant-name">Мамаридзе</h1>
            <span className="table-badge">Стол #{tableNumber}</span>
          </div>
        </div>
        <button
          className="cart-button"
          onClick={() => navigate(`/t/${tableNumber}/cart`)}
          aria-label="Корзина"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {totalItems > 0 && <span className="cart-badge">{totalItems}</span>}
        </button>
      </div>
    </header>
  );
};
