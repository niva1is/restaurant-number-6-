import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import type { Dish } from "../types";
import { menuData as initialMenu } from "../data/menuData";

interface MenuContextType {
  dishes: Dish[];
  toggleStock: (dishId: string) => void;
}

const MenuContext = createContext<MenuContextType | undefined>(undefined);

const STORAGE_KEY = "restaurant-menu-v1";

function loadMenu(): Dish[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialMenu;
    const stored: Dish[] = JSON.parse(raw);
    // Если в меню добавились новые блюда — подтягиваем их
    if (stored.length !== initialMenu.length) {
      return initialMenu.map((d) => {
        const found = stored.find((s) => s.id === d.id);
        return found ? { ...d, inStock: found.inStock } : d;
      });
    }
    return stored;
  } catch {
    return initialMenu;
  }
}

function saveMenu(dishes: Dish[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dishes));
  // Для других вкладок
  window.dispatchEvent(new Event("restaurant-menu-update"));
}

export const MenuProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [dishes, setDishes] = useState<Dish[]>(() => loadMenu());

  // Синхронизация между вкладками
  useEffect(() => {
    const sync = () => setDishes(loadMenu());
    window.addEventListener("storage", sync);
    window.addEventListener("restaurant-menu-update", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("restaurant-menu-update", sync);
    };
  }, []);

  const toggleStock = useCallback((dishId: string) => {
    setDishes((prev) => {
      const next = prev.map((d) =>
        d.id === dishId ? { ...d, inStock: !d.inStock } : d,
      );
      // Сохраняем после вычисления нового массива
      setTimeout(() => saveMenu(next), 0);
      return next;
    });
  }, []);

  return (
    <MenuContext.Provider value={{ dishes, toggleStock }}>
      {children}
    </MenuContext.Provider>
  );
};

export const useMenu = () => {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu must be used within MenuProvider");
  return ctx;
};
