import { useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router-dom";
import { CartProvider } from "./context/CartContext";
import { OrderProvider } from "./context/OrderContext";
import { MenuProvider, useMenu } from "./context/MenuContext";
import { Header } from "./components/Header";
import { CategoryTabs } from "./components/CategoryTabs";
import { DishCard } from "./components/DishCard";
import { Cart } from "./components/Cart";
import { OrderStatus } from "./components/OrderStatus";
import { Kitchen } from "./components/Kitchen";
import { Waiter } from "./components/Waiter";
import { Admin } from "./components/Admin";
import { categories } from "./data/menuData";
import "./App.css";

function MenuPage() {
  const { tableId } = useParams();
  const tableNumber = Number(tableId) || 1;
  const [selectedCategory, setSelectedCategory] = useState("Все");
  const { dishes } = useMenu();

  const filteredDishes =
    selectedCategory === "Все"
      ? dishes
      : dishes.filter((d) => d.category === selectedCategory);

  return (
    <div className="menu-page">
      <Header tableNumber={tableNumber} />
      <CategoryTabs
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />
      <div className="dishes-grid">
        {filteredDishes.map((dish) => (
          <DishCard key={dish.id} dish={dish} />
        ))}
      </div>
    </div>
  );
}

function CartPage() {
  const { tableId } = useParams();
  const tableNumber = Number(tableId) || 1;
  return <Cart tableNumber={tableNumber} />;
}

function OrderStatusPage() {
  return <OrderStatus />;
}

function App() {
  return (
    <Router>
      <MenuProvider>
        <CartProvider>
          <OrderProvider>
            <Routes>
              {/* Гость */}
              <Route path="/t/:tableId" element={<MenuPage />} />
              <Route path="/t/:tableId/cart" element={<CartPage />} />
              <Route
                path="/t/:tableId/order-status"
                element={<OrderStatusPage />}
              />

              {/* Персонал */}
              <Route path="/kitchen" element={<Kitchen />} />
              <Route path="/waiter" element={<Waiter />} />
              <Route path="/admin" element={<Admin />} />

              {/* Редиректы */}
              <Route path="/" element={<Navigate to="/t/1" replace />} />
              <Route path="*" element={<Navigate to="/t/1" replace />} />
            </Routes>
          </OrderProvider>
        </CartProvider>
      </MenuProvider>
    </Router>
  );
}

export default App;
