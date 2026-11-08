# Модель данных (ER)

Источник истины — [`prisma/schema.prisma`](../prisma/schema.prisma). Таблицы создаёт миграция
[`prisma/migrations/20261007120000_init`](../prisma/migrations/20261007120000_init/migration.sql).

```mermaid
erDiagram
    restaurants ||--o{ tables : "has"
    restaurants ||--o{ categories : "has"
    categories ||--o{ dishes : "contains"
    dishes ||--o{ dish_ingredients : ""
    ingredients ||--o{ dish_ingredients : ""
    tables ||--o{ orders : "places"
    orders ||--|{ order_items : "contains"
    dishes |o--o{ order_items : "snapshot of"
    orders ||--|{ order_status_events : "audit"
    users |o--o{ order_status_events : "initiator"
    tables ||--o{ waiter_calls : "calls"
    users |o--o{ waiter_calls : "resolved by"

    restaurants {
        int id PK
        text name UK
        text address
        timestamp created_at
    }
    tables {
        int id PK
        int restaurant_id FK
        text number "UK(restaurant_id, number)"
        uuid table_token UK "UUID v4 из QR"
        timestamp created_at
    }
    categories {
        int id PK
        int restaurant_id FK
        text name "UK(restaurant_id, name)"
        int sort_order
    }
    dishes {
        int id PK
        int category_id FK
        text name
        text description
        decimal price "DECIMAL(10,2), CHECK >= 0"
        int calories
        text image_url
        bool is_available "false = стоп-лист"
        timestamp created_at
        timestamp updated_at
    }
    ingredients {
        int id PK
        text name UK
    }
    dish_ingredients {
        int dish_id PK, FK
        int ingredient_id PK, FK
    }
    users {
        int id PK
        text username UK
        text password_hash "bcrypt"
        UserRole role "ADMIN | COOK | WAITER"
        timestamp created_at
    }
    orders {
        int id PK
        int table_id FK
        OrderStatus status "ACCEPTED…PAID | CANCELLED"
        decimal total_amount "сумма по снимку цен"
        text comment
        timestamp created_at
        timestamp updated_at
    }
    order_items {
        int id PK
        int order_id FK
        int dish_id FK "NULL, если блюдо удалено"
        text dish_name "снимок названия"
        int quantity "CHECK > 0"
        decimal ordered_price "снимок цены"
    }
    order_status_events {
        int id PK
        int order_id FK
        OrderStatus from_status "NULL при создании"
        OrderStatus to_status
        EventActor actor "GUEST | ADMIN | COOK | WAITER"
        int user_id FK
        text reason
        timestamp timestamp
    }
    waiter_calls {
        uuid id PK "= event_id в RabbitMQ"
        int table_id FK
        WaiterCallStatus status "PENDING | RESOLVED"
        int active_table_id UK "= table_id пока PENDING"
        timestamp created_at
        timestamp published_at "publisher confirm"
        timestamp resolved_at
        int resolved_by_id FK
    }
```

## Таблицы

| Таблица | Назначение | Ключевые ограничения |
|---|---|---|
| `restaurants` | Ресторан. В демо один, модель допускает несколько | `name` уникально |
| `tables` | Стол в зале и его QR-токен | `table_token` UUID уникален; `(restaurant_id, number)` уникальны |
| `categories` | Категории меню | `(restaurant_id, name)` уникальны; удаление только пустой категории |
| `dishes` | Блюда: цена, описание, калорийность, стоп-лист | `price >= 0`; `category_id` ON DELETE RESTRICT |
| `ingredients`, `dish_ingredients` | Ингредиенты, связь многие-ко-многим | составной PK `(dish_id, ingredient_id)` |
| `users` | Персонал | `username` уникален; пароль только в виде bcrypt-хэша |
| `orders` | Заказ стола | индексы `(status, created_at)` для витрины кухни, `(table_id, created_at)` |
| `order_items` | Позиции со снимком названия и цены (BE-06) | `quantity > 0`; `dish_id` ON DELETE SET NULL |
| `order_status_events` | Аудит переходов: откуда, куда, кто, когда (BE-11) | индекс `(order_id, timestamp)` |
| `waiter_calls` | Вызов официанта, источник истины для брокера | `UNIQUE(active_table_id)` + `CHECK`: не более одного PENDING на стол |

## Связи

- Ресторан 1 — N столов, ресторан 1 — N категорий, категория 1 — N блюд.
- Блюдо N — M ингредиентов (через `dish_ingredients`).
- Стол 1 — N заказов, заказ 1 — N позиций, заказ 1 — N событий аудита.
- Позиция заказа N — 0..1 блюдо: ссылка обнуляется при удалении блюда, снимок остаётся.
- Стол 1 — N вызовов официанта; вызов закрывает 0..1 сотрудник.
