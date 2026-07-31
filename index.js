const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// 1. Загружаем переменные (как советовала Алиса, но через Render Environment)
const VK_TOKEN = process.env.VK_TOKEN;
const VK_CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;
const VK_SECRET_KEY = process.env.VK_SECRET_KEY || ''; // Необязательно, но полезно для проверки
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;

// Используем настоящий Bot ID (из URL студии), а не Workspace ID
const BOTPRESS_API_URL = `https://api.botpress.cloud/v1/bots/${BOTPRESS_BOT_ID}/converse`;

// Токен из DevTools (пока используем его, если настоящий API ключ не найден)
const BOTPRESS_API_KEY = 'eyJhbGciOiJIUzI1NiIsR5cClikpXVCJ9.eyJpCI6InVrZzXJfMDFLWVZOUUZGQVhYVDdQU0ZWME0wMjvc1S00iLCjYpXQjOjE3ODU0ODc2NzB9.cfnunvolA82XNJunqUM2c-3l0XhNTFPuPYiY4pGGHxs';

// Функция отправки в ВК
async function sendToVk(userId, text) {
  if (!VK_TOKEN) {
    console.error('❌ ОШИБКА: Не задан VK_TOKEN');
    return;
  }
  const url = `https://api.vk.com/method/messages.send`;
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

// Функция отправки в Botpress (по мотивам совета Алисы)
async function sendToBotpress(userId, text) {
  try {
    console.log(`🤖 Запрос к Botpress: ${BOTPRESS_API_URL}/${userId}`);
    
    const response = await fetch(`${BOTPRESS_API_URL}/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOTPRESS_API_KEY}`
      },
      body: JSON.stringify({
        type: 'text',
        text: text
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Ответ Botpress:', JSON.stringify(data));
      
      // Ищем текст в ответе (структура может отличаться, проверяем варианты)
      let reply = 'Извините, я не понял.';
      if (data.responses && data.responses.length > 0) {
        reply = data.responses[0].text || data.responses[0].payload || reply;
      } else if (data.output && data.output.text) {
        reply = data.output.text;
      }
      return reply;
    } else {
      const errText = await response.text();
      console.error(`⚠️ Ошибка Botpress (${response.status}):`, errText);
      return null; // Возвращаем null, чтобы сработал запасной вариант
    }
  } catch (err) {
    console.error('❌ Ошибка сети Botpress:', err.message);
    return null;
  }
}

// ГЛАВНЫЙ ОБРАБОТЧИК ВЕБХУКА
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('📨 Получен вебхук:', JSON.stringify(body));

  // 1. ПРОВЕРКА СЕКРЕТНОГО КЛЮЧА (совет Алисы)
  if (VK_SECRET_KEY && body.secret !== VK_SECRET_KEY) {
    console.error('⚠️ Неверный секретный ключ от ВК!');
    return res.status(403).send('Invalid secret');
  }

  // 2. ПОДТВЕРЖДЕНИЕ СЕРВЕРА (максимально чистый ответ, как требует ВК)
  if (body.type === 'confirmation') {
  console.log('🔐 ВК запрашивает подтверждение');
  console.log('   Код подтверждения:', VK_CONFIRMATION_CODE);
  console.log('   Отправляю ответ...');
  
  // Отправляем максимально простой ответ
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(VK_CONFIRMATION_CODE)
  });
  res.end(VK_CONFIRMATION_CODE);
  
  console.log('   ✅ Ответ отправлен');
  return;
}
  }

  // 3. ВХОДЯЩЕЕ СООБЩЕНИЕ
  if (body.type === 'message_new') {
    const userId = body.object.message.from_id;
    const text = body.object.message.text || '';
    console.log(`\n💬 Сообщение от ${userId}: "${text}"`);

    try {
      // Пытаемся получить ответ от Botpress
      let replyText = await sendToBotpress(userId, text);

      // Если Botpress не ответил (ошибка 404, 401 и т.д.), используем запасной вариант
      if (!replyText) {
        console.log('⚠️ Botpress не ответил, использую запасной вариант');
        replyText = `Вы написали: "${text}". (Botpress временно недоступен, но мост работает!)`;
      }

      console.log(`🤖 Отправляю пользователю: "${replyText}"`);
      await sendToVk(userId, replyText);

    } catch (error) {
      console.error('❌ Критическая ошибка:', error.message);
      await sendToVk(userId, 'Произошла техническая ошибка.');
    }
  }

  // 4. Всегда отвечаем ВК "ok", чтобы он не повторял запрос
  res.send('ok');
});

// Проверка работоспособности сервера через браузер
app.get('/webhook', (req, res) => {
  res.send('VK-Botpress Bridge is running! Use POST.');
});

app.get('/', (req, res) => {
  res.send('Server is alive! 🚀');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 Сервер запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log(`🤖 Bot ID: ${BOTPRESS_BOT_ID}`);
  console.log(`🔐 Ожидаемый код подтверждения: ${VK_CONFIRMATION_CODE}`);
  console.log('===========================================\n');
});
