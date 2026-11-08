/**
 * Демонстрационные данные: ресторан, сотрудники трёх ролей, столы с QR-токенами, меню.
 * Идемпотентен: повторный запуск не создаёт дублей и не меняет уже выданные токены столов.
 *
 *   npx prisma db seed
 */
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { PrismaClient, UserRole } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

const RESTAURANT = { name: 'QR Bistro', address: 'ул. Примерная, 1' };

const STAFF: Array<{ username: string; role: UserRole; password: string }> = [
  { username: 'admin', role: UserRole.ADMIN, password: process.env.SEED_ADMIN_PASSWORD || 'admin123' },
  { username: 'cook', role: UserRole.COOK, password: process.env.SEED_COOK_PASSWORD || 'cook123' },
  { username: 'waiter', role: UserRole.WAITER, password: process.env.SEED_WAITER_PASSWORD || 'waiter123' },
];

const TABLE_NUMBERS = ['1', '2', '3', '4', '5'];

type SeedDish = {
  name: string;
  description: string;
  price: number;
  calories: number;
  ingredients: string[];
  isAvailable?: boolean;
};

const MENU: Array<{ category: string; sortOrder: number; dishes: SeedDish[] }> = [
  {
    category: 'Пицца',
    sortOrder: 1,
    dishes: [
      { name: 'Маргарита', description: 'Томатный соус, моцарелла, базилик', price: 590, calories: 820, ingredients: ['Тесто', 'Томатный соус', 'Моцарелла', 'Базилик'] },
      { name: 'Пепперони', description: 'Острая салями пепперони и моцарелла', price: 690, calories: 950, ingredients: ['Тесто', 'Томатный соус', 'Моцарелла', 'Пепперони'] },
      { name: 'Четыре сыра', description: 'Моцарелла, пармезан, горгонзола, чеддер', price: 750, calories: 1010, ingredients: ['Тесто', 'Моцарелла', 'Пармезан', 'Горгонзола', 'Чеддер'] },
    ],
  },
  {
    category: 'Супы',
    sortOrder: 2,
    dishes: [
      { name: 'Борщ', description: 'Со сметаной и чесночными пампушками', price: 390, calories: 350, ingredients: ['Говядина', 'Свёкла', 'Капуста', 'Картофель', 'Морковь', 'Сметана'] },
      { name: 'Том ям', description: 'Острый суп с креветками на кокосовом молоке', price: 520, calories: 410, ingredients: ['Креветки', 'Кокосовое молоко', 'Шампиньоны', 'Лемонграсс', 'Чили'] },
    ],
  },
  {
    category: 'Салаты',
    sortOrder: 3,
    dishes: [
      { name: 'Цезарь с курицей', description: 'Романо, курица гриль, гренки, соус цезарь', price: 450, calories: 520, ingredients: ['Салат романо', 'Курица', 'Гренки', 'Пармезан', 'Соус цезарь'] },
      { name: 'Греческий', description: 'Овощи, фета, маслины', price: 380, calories: 290, ingredients: ['Томаты', 'Огурцы', 'Перец', 'Фета', 'Маслины', 'Оливковое масло'] },
    ],
  },
  {
    category: 'Десерты',
    sortOrder: 4,
    dishes: [
      { name: 'Чизкейк', description: 'Нью-Йорк, ягодный соус', price: 320, calories: 450, ingredients: ['Сливочный сыр', 'Печенье', 'Сливки', 'Ягоды'] },
      // Демонстрация стоп-листа (BE-02): блюдо видно в меню, но заказать его нельзя.
      { name: 'Тирамису', description: 'Маскарпоне, савоярди, эспрессо', price: 350, calories: 480, ingredients: ['Маскарпоне', 'Савоярди', 'Эспрессо', 'Какао'], isAvailable: false },
    ],
  },
  {
    category: 'Напитки',
    sortOrder: 5,
    dishes: [
      { name: 'Капучино', description: '300 мл', price: 220, calories: 120, ingredients: ['Эспрессо', 'Молоко'] },
      { name: 'Морс клюквенный', description: '400 мл', price: 180, calories: 160, ingredients: ['Клюква', 'Сахар', 'Вода'] },
    ],
  },
];

async function upsertIngredientIds(names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    const ingredient = await prisma.ingredient.upsert({ where: { name }, update: {}, create: { name } });
    ids.push(ingredient.id);
  }
  return ids;
}

async function main() {
  // 1. Ресторан
  const restaurant = await prisma.restaurant.upsert({
    where: { name: RESTAURANT.name },
    update: {},
    create: RESTAURANT,
  });

  // 2. Персонал (пароли — только bcrypt-хэш)
  for (const member of STAFF) {
    const passwordHash = await bcrypt.hash(member.password, 10);
    await prisma.user.upsert({
      where: { username: member.username },
      update: { role: member.role },
      create: { username: member.username, role: member.role, passwordHash },
    });
  }

  // 3. Столы: токен — случайный UUID v4, при повторном сиде не меняется
  for (const number of TABLE_NUMBERS) {
    await prisma.table.upsert({
      where: { restaurantId_number: { restaurantId: restaurant.id, number } },
      update: {},
      create: { restaurantId: restaurant.id, number, tableToken: randomUUID() },
    });
  }

  // 4. Меню: категории, блюда, ингредиенты (многие-ко-многим)
  for (const section of MENU) {
    const category = await prisma.category.upsert({
      where: { restaurantId_name: { restaurantId: restaurant.id, name: section.category } },
      update: { sortOrder: section.sortOrder },
      create: { restaurantId: restaurant.id, name: section.category, sortOrder: section.sortOrder },
    });

    for (const dish of section.dishes) {
      const existing = await prisma.dish.findFirst({ where: { categoryId: category.id, name: dish.name } });
      if (existing) continue;

      const ingredientIds = await upsertIngredientIds(dish.ingredients);
      await prisma.dish.create({
        data: {
          categoryId: category.id,
          name: dish.name,
          description: dish.description,
          price: dish.price,
          calories: dish.calories,
          isAvailable: dish.isAvailable ?? true,
          ingredients: { create: ingredientIds.map((ingredientId) => ({ ingredientId })) },
        },
      });
    }
  }

  // Итог для демонстрации
  const tables = await prisma.table.findMany({ where: { restaurantId: restaurant.id }, orderBy: { id: 'asc' } });
  const appUrl = (process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const dishCount = await prisma.dish.count();

  console.log(`\n✅ Сид выполнен: ресторан «${restaurant.name}», блюд: ${dishCount}`);
  console.log('\n👤 Учётные записи персонала:');
  for (const member of STAFF) console.log(`   ${member.role.padEnd(6)}  ${member.username} / ${member.password}`);
  console.log('\n🪑 Столы (ссылка из QR-кода и X-Table-Token):');
  for (const table of tables) console.log(`   Стол ${table.number}: ${appUrl}/table/${table.tableToken}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('❌ Ошибка сида:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
