const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Подключение к PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());

// 1. Получить все товары из базы данных PostgreSQL
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    // Приводим поля из бд (snake_case) к формату фронтенда (camelCase)
    const formatted = result.rows.map(p => ({
      id: p.id,
      gender: p.gender,
      cat: p.cat,
      subcat: p.subcat,
      title: p.title,
      brand: p.brand,
      price: p.price,
      size: p.size,
      cond: p.cond,
      img: p.img,
      isNew: p.is_new,
      isSold: p.is_sold
    }));
    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера при получении товаров' });
  }
});

// 2. Создать заказ и обновить статус товара в базе
app.post('/api/orders', async (req, res) => {
  const { name, phone, address, items } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Корзина пуста' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Проверяем наличие товаров
    for (const itemId of items) {
      const check = await client.query('SELECT is_sold, title FROM products WHERE id = $1', [itemId]);
      if (check.rows.length === 0 || check.rows[0].is_sold) {
        throw new Error(`Товар "${check.rows[0]?.title || itemId}" уже продан или не найден!`);
      }
    }

    // Помечаем товары как проданные
    for (const itemId of items) {
      await client.query('UPDATE products SET is_sold = true WHERE id = $1', [itemId]);
    }

    // Сохраняем заказ
    const orderId = Date.now().toString();
    await client.query(
      'INSERT INTO orders (id, customer_name, customer_phone, customer_addr, items) VALUES ($1, $2, $3, $4, $5)',
      [orderId, name, phone, address, JSON.stringify(items)]
    );

    await client.query('COMMIT');
    console.log('📦 Заказ успешно сохранен в PostgreSQL:', orderId);
    res.status(201).json({ success: true, orderId });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер KMARKET запущен на порту http://localhost:${PORT} с поддержкой PostgreSQL`);
});