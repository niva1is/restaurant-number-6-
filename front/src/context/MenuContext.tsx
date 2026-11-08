import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import type { Dish } from "../types";

const API_URL = import.meta.env.VITE_API_URL;

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

interface MenuContextType {
  dishes: Dish[];
  categories: Category[];
  toggleStock: (dishId: string) => Promise<void>;
  loading: boolean;
}

const MenuContext = createContext<MenuContextType | undefined>(undefined);

export const MenuProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      const catRes = await fetch(`${API_URL}/menu/categories`);
      if (!catRes.ok) throw new Error("Ошибка загрузки категорий");
      const catData = await catRes.json();
      
      const parsedCategories: Category[] = catData.map((c: any) => ({
        id: String(c.id),
        name: c.name,
        sortOrder: c.sortOrder || 0,
      })).sort((a: Category, b: Category) => a.sortOrder - b.sortOrder);

      setCategories(parsedCategories);

      const menuRes = await fetch(`${API_URL}/menu`);
      if (!menuRes.ok) throw new Error("Ошибка загрузки меню");
      const menuData = await menuRes.json();

      const flatDishes: Dish[] = [];
      menuData.forEach((category: any) => {
        if (category.dishes && Array.isArray(category.dishes)) {
          category.dishes.forEach((dish: any) => {
            flatDishes.push({
              id: String(dish.id),
              category: dish.category,
              name: dish.name,
              description: dish.description || "",
              price: Number(dish.price),
              calories: dish.calories || 0,
              image: dish.imageUrl,
              inStock: dish.isAvailable, 
              ingredients: dish.ingredients || [],
            });
          });
        }
      });

      setDishes(flatDishes);
    } catch (err) {
      console.error("Ошибка при загрузке данных:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const toggleStock = useCallback(async (dishId: string) => {
    const dish = dishes.find((d) => d.id === dishId);
    if (!dish) return;

    try {
      const res = await fetch(`${API_URL}/menu/dishes/${dishId}/stop-list`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable: !dish.inStock }), 
      });

      if (!res.ok) throw new Error("Ошибка обновления стоп-листа");

      setDishes((prev) =>
        prev.map((d) => d.id === dishId ? { ...d, inStock: !d.inStock } : d)
      );
    } catch (err) {
      console.error(err);
    }
  }, [dishes]);

  return (
    <MenuContext.Provider value={{ dishes, categories, toggleStock, loading }}>
      {children}
    </MenuContext.Provider>
  );
};

export const useMenu = () => {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu must be used within MenuProvider");
  return ctx;
};