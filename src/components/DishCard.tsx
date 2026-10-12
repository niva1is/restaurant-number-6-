import React from "react";
import type { Dish } from "../types";
import { useCart } from "../context/CartContext";

interface DishCardProps {
  dish: Dish;
}

export const DishCard: React.FC<DishCardProps> = ({ dish }) => {
  const { addToCart, items } = useCart();
  const cartItem = items.find((item) => item.dish.id === dish.id);

  const handleAdd = () => {
    if (dish.inStock) {
      addToCart(dish);
    }
  };

  return (
    <div className={`dish-card ${!dish.inStock ? "out-of-stock" : ""}`}>
      <div className="dish-image-container">
        <img src={dish.image} alt={dish.name} className="dish-image" />
        {!dish.inStock && (
          <div className="out-of-stock-overlay">
            <span>Нет в наличии</span>
          </div>
        )}
      </div>
      <div className="dish-info">
        <h3 className="dish-name">{dish.name}</h3>
        <p className="dish-description">{dish.description}</p>
        <div className="dish-meta">
          <span className="dish-calories">{dish.calories} ккал</span>
        </div>
        <div className="dish-footer">
          <span className="dish-price">{dish.price} ₽</span>
          <button
            className="add-button"
            onClick={handleAdd}
            disabled={!dish.inStock}
          >
            {cartItem ? `+ ${cartItem.quantity}` : "+"}
          </button>
        </div>
      </div>
    </div>
  );
};
