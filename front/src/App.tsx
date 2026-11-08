import { useState, useEffect } from "react"; 
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
import { Login } from "./components/Login";
import "./App.css";

function MenuPage() {
  const { tableId } = useParams(); // Это токен из URL
  const [realTableNumber, setRealTableNumber] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { dishes, categories } = useMenu();

  // 1. Сохраняем токен для запросов на бэкенд
  if (tableId) {
    localStorage.setItem("table_token", tableId);
  }

  // 2. Запрашиваем настоящий номер стола у бэкенда
  useEffect(() => {
    if (!tableId) return;
    
    fetch(`${import.meta.env.VITE_API_URL}/tables/check/${tableId}`)
      .then(res => {
        if (!res.ok) throw new Error("Стол не найден");
        return res.json();
      })
      .then(data => {
        if (data.valid && data.table && data.table.number) {
          setRealTableNumber(Number(data.table.number));
        }
      })
      .catch(err => {
        console.error("Ошибка проверки стола", err);
      });
  }, [tableId]);

  // Фильтрация блюд
  const filteredDishes =
    selectedCategory === "all"
      ? dishes
      : dishes.filter((d) => d.category === selectedCategory);

  return (
    <div className="menu-page">
      <Header tableNumber={realTableNumber} />
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
  return <Cart tableNumber={0} />; 
}
function OrderStatusPage() {
  return <OrderStatus />;
}

// Обертка для защиты
const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) => {
  const token = localStorage.getItem("staff_token");
  const role = localStorage.getItem("staff_role");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role || "")) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

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

              {/* Авторизация */}
                <Route path="/login" element={<Login />} />

              {/* Персонал */}
              <Route path="/kitchen" element={
                <ProtectedRoute allowedRoles={["COOK", "ADMIN"]}>
                  <Kitchen />
                </ProtectedRoute>
              } />

              <Route path="/waiter" element={
                <ProtectedRoute allowedRoles={["WAITER", "ADMIN"]}>
                  <Waiter />
                </ProtectedRoute>
              } />

              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={["ADMIN"]}>
                  <Admin />
                </ProtectedRoute>
              } />

              {/* Редиректы */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </OrderProvider>
        </CartProvider>
      </MenuProvider>
    </Router>
  );
}

export default App;