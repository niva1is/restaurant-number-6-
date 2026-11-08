import type { Dish } from "../types";

export const menuData: Dish[] = [
  {
    id: "1",
    name: "Хачапури по-аджарски",
    description: "Традиционное грузинское блюдо с сыром и яйцом",
    price: 590,
    calories: 450,
    ingredients: ["Сыр сулугуни", "Яйцо", "Мука", "Масло"],
    category: "Хачапури",
    image:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRaxqEj4e0ZIiS8kD0HXWN8rr-amS3PJdZ5CEgqpZRCXQ&s=10",
    inStock: true,
  },
  {
    id: "2",
    name: "Хачапури с сыром",
    description: "Классический хачапури с сыром",
    price: 490,
    calories: 420,
    ingredients: ["Сыр", "Мука", "Масло"],
    category: "Хачапури",
    image:
      "https://images.gastronom.ru/2xh89UxzMnD3jsgKn8Abo3B9Zl-xRwn1lKQy64QYhaQ/pr:recipe-cover-image/g:ce/rs:auto:0:0:0/L2Ntcy9hbGwtaW1hZ2VzL2IzOGI3NjU1LTc1ZDAtNGJhMC1hMmE5LWFlMDRiY2NlNzAwNy5qcGc.webp",
    inStock: true,
  },
  {
    id: "3",
    name: "Хинкали",
    description: "Сочные хинкали с мясом",
    price: 390,
    calories: 380,
    ingredients: ["Говядина", "Свинина", "Лук", "Специи"],
    category: "Хинкали",
    image:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQUYJHzN-r8Z4-KPDe6aBEk7HWpvFBeLLAGsP9MvVOOHA&s=10",
    inStock: true,
  },
  {
    id: "4",
    name: "Шашлык из баранины",
    description: "Нежное мясо на углях",
    price: 890,
    calories: 520,
    ingredients: ["Баранина", "Лук", "Специи"],
    category: "Шашлыки",
    image:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSUZJuH4vC-jHRITl0QK2zHjmUUxQRsfE9R5RJOebUZ4g&s=10",
    inStock: true,
  },
  {
    id: "5",
    name: "Харчо",
    description: "Острый грузинский суп",
    price: 350,
    calories: 280,
    ingredients: ["Говядина", "Рис", "Ткемали", "Грецкие орехи"],
    category: "Супы",
    image:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT3eNhKkofk1BywG2KQyXkI8kzlcdozZxOSsN1EgadrSYJ_SSLqELs1zIU&s=10",
    inStock: true,
  },
  {
    id: "6",
    name: "Чурчхела",
    description: "Традиционная грузинская сладость",
    price: 250,
    calories: 320,
    ingredients: ["Виноградный сок", "Грецкие орехи", "Мука"],
    category: "Десерты",
    image: "https://s0.rbk.ru/v6_top_pics/media/img/2/43/347005686312432.webp",
    inStock: false, // Пример стоп-листа
  },
  {
    id: "7",
    name: "Вино Грузинское",
    description: "Красное Грузинское Вино",
    price: 450,
    calories: 125,
    ingredients: ["Виноград", "Вода"],
    category: "Напитки",
    image:
      "https://static.simplewine.ru/upload/iblock/431/4318fa47f5ba931debcc4a2a9bf07b71.png@981?fmt=webp",
    inStock: true,
  },
];

export const categories = [
  "Все",
  "Хачапури",
  "Хинкали",
  "Шашлыки",
  "Супы",
  "Десерты",
  "Напитки",
];
