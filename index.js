const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// === Переменные окружения ===
const VK_TOKEN = process.env.VK_TOKEN;
const VK_CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;
const VK_SECRET = process.env.VK_SECRET;

// === АДРЕС ВЕБХУКА ИЗ ВАШЕГО СКРИНШОТА ===
const BOTPRESS_WEBHOOK_URL = 'https://webhook.botpress.cloud/2526d31b-9cca-46c0-80c8-58e01bb7d205';

function logEnv() {
  console.log('=== ENV CHECK ===');
  console.log('VK_TOKEN set:', !!VK_TOKEN);
  console.log('VK_CONFIRMATION_CODE:', VK_CONFIRMATION_CODE);
  console.log('VK_SECRET set:', !!VK_SECRET);
  console.log('BOTPRESS_WEBHOOK_URL:', BOTPRESS_WEBHOOK_URL);
  console.log('==================');
}

// === Отправка сообщения в ВК ===
async function sendToVk(userId, text) {
  if (!VK_TOKEN) {
    console.error('❌ ОШИБКА: Не задан VK_TOKEN');
    return;
  }

  const url = 'https://api.vk.com/method/messages.send';
  const params = new URLSearchParams({
    user_id: userId,
    message: text,
    access_token: VK_TOKEN,
    v: '5.199',
    random_id: Math.floor(Math.random() * 1000000)
  });

  try {
    const res = await fetch(`${url}?${params.toString()}`);
    const data = await res.json();
    if (data.error) {
      console.error('❌ Ошибка ВК:', data.error);
    } else {
      console.log(`✅ Сообщение отправлено пользователю ${userId}`);
    }
  } catch (err) {
    console.error('❌ Ошибка сети ВК:', err.message);
  }
}

// === Отправка в Botpress через Webhook ===
async function sendToBotpress(userId, text) {
  try {
    console.log(`\n🤖 Отправка в Botpress Webhook...`);
    console.log(`   URL: ${BOTPRESS_WEBHOOK_URL}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Текст: "${text}"`);

    const res = await fetch(BOTPRESS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bp-user-id': String(userId) // Ключевой заголовок для сохранения сессии
      },
      body: JSON.stringify({
        text: text
      })
    });

    const raw = await res.text();
    console.log(`   Статус Webhook: ${res.status}`);
    
    if (!res.ok) {
      console.error('⚠️ Ошибка Webhook:', raw);
      return null;
    }

    console.log('   RAW ответ Botpress:', raw);

    let reply = null;

    // Пытаемся распарсить JSON
    try {
      const data = JSON.parse(raw);
      console.log('📦 Распарсенный JSON:', JSON.stringify(data, null, 2));
      
      // Ищем текст во всех возможных форматах ответа Botpress
      if (data.text) {
        reply = data.text;
      } else if (data.body && data.body.text) {
        reply = data.body.text;
      } else if (data.payload && data.payload.text) {
        reply = data.payload.text;
      } else if (Array.isArray(data.body) && data.body[0] && data.body[0].text) {
        reply = data.body[0].text;
      }
    } catch (e) {
      // Если это не JSON, значит Botpress вернул чистый текст
      console.log('📦 Botpress вернул чистый текст');
      reply = raw;
    }

    return reply;
  } catch (err) {
    console.error('❌ Ошибка соединения с Botpress:', err.message);
    return null;
  }
}

// === Обработчик ВК ===
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('📨 Получен Webhook от ВК:', JSON.stringify(body));

  // 1. Подтверждение сервера
  if (body.type === 'confirmation') {
    console.log('🔐 Запрос подтверждения. Отправляю код:', VK_CONFIRMATION_CODE);
    res.status(200).type('text/plain').send(VK_CONFIRMATION_CODE);
    return;
  }

  // 2. Новое входящее сообщение
  if (body.type === 'message_new') {
    const message = body.object?.message || {};
    const userId = message.from_id;
    const text = message.text || '';

    console.log(`\n💬 Сообщение от ${userId}: "${text}"`);

    let replyText = await sendToBotpress(userId, text);

    if (!replyText) {
      console.log('⚠️ Botpress не дал ответа, использую запасной вариант.');
      replyText = 'Здравствуйте! Я бот для обучения присяжных заседателей. Добро пожаловать!';
    }

    console.log(`🤖 Отправляю пользователю: "${replyText}"`);
    await sendToVk(userId, replyText);
  }

  // Всегда отвечаем ВК "ok"
  res.status(200).send('ok');
});

// Проверка здоровья сервера
app.get('/webhook', (req, res) => {
  res.send('VK-Botpress bridge is running!');
});

app.get('/', (req, res) => {
  logEnv();
  res.send('Server is alive! 🚀');
});

// Запуск
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 Сервер запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log('===========================================\n');
});
