const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// === Переменные окружения ===
const VK_TOKEN = process.env.VK_TOKEN;
const VK_CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;
const VK_SECRET = process.env.VK_SECRET;

// =================================================================
// АДРЕС ВЕБХУКА ИЗ BOTPRESS
// =================================================================
const BOTPRESS_WEBHOOK_URL = 'https://webhook.botpress.cloud/2526d31b-9cca-46c0-80c8-58e01bb7d205';

function logEnv() {
  console.log('=== ENV CHECK ===');
  console.log('VK_TOKEN set:', !!VK_TOKEN);
  console.log('VK_CONFIRMATION_CODE:', VK_CONFIRMATION_CODE);
  console.log('VK_SECRET set:', !!VK_SECRET);
  console.log('BOTPRESS_WEBHOOK_URL:', BOTPRESS_WEBHOOK_URL);
  console.log('==================');
}

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
    console.log(`➡️ VK API: ${url}?${params.toString()}`);
    const res = await fetch(`${url}?${params.toString()}`);
    const data = await res.json();

    console.log('⬅️ VK response:', JSON.stringify(data));

    if (data.error) {
      console.error('❌ Ошибка ВК:', data.error);
    } else {
      console.log(`✅ Сообщение отправлено пользователю ${userId}`);
    }
  } catch (err) {
    console.error('❌ Ошибка сети ВК:', err.message);
  }
}

async function sendToBotpress(userId, text) {
  try {
    console.log(`🤖 Webhook: POST ${BOTPRESS_WEBHOOK_URL}`);
    console.log(`   Текст: "${text}"`);

    const res = await fetch(BOTPRESS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bp-user-id': String(userId) 
      },
      body: JSON.stringify({
        text: text
      })
    });

    const raw = await res.text();
    console.log(`   Статус Botpress: ${res.status}`);
    
    if (!raw || raw.trim() === '') {
        console.log('⚠️ Botpress вернул пустой ответ.');
        return null;
    }

    console.log('   RAW Botpress response:', raw);

    let data;
    try {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        data = JSON.parse(trimmed);
      } else {
        console.warn('⚠️ Ответ Botpress не в JSON-формате. Возвращаю как есть.');
        return raw;
      }
    } catch (e) {
      console.error('❌ Ошибка парсинга JSON Botpress:', e.message);
      return null;
    }

    console.log('📦 Parsed Botpress JSON:', JSON.stringify(data, null, 2));

    let reply = null;

    // 1. Ищем в простом поле text
    if (data.text) {
        reply = data.text;
    } 
    // 2. Ищем в поле body.text (базовый уровень)
    else if (data.body && data.body.text) {
      reply = data.body.text;
    }
    // 3. Ищем в стандартном массиве ответов (если это вопрос-анкета)
    else if (data.body && Array.isArray(data.body)) {
        // Пробегаемся по массиву, собираем всё, что похоже на текст
        const textParts = data.body.map(item => {
            if (item.text) return item.text;
            if (item.payload && item.payload.text) return item.payload.text;
            return null;
        }).filter(item => item !== null);

        if (textParts.length > 0) {
            reply = textParts.join('\n'); // Склеиваем вопросы через перенос строки
        }
    }

    if (!reply) {
      console.log('⚠️ Botpress вернул JSON, но не нашел поле "text".');
      return null;
    }

    return reply;
  } catch (err) {
    console.error('❌ Ошибка сети Botpress:', err.message);
    return null;
  }
}

app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('📨 Webhook:', JSON.stringify(body));

  if (body.type === 'confirmation') {
    console.log('🔐 Запрос подтверждения от ВК');
    
    if (VK_SECRET && body.secret && body.secret !== VK_SECRET) {
      console.error('❌ Секретный ключ не совпадает!');
      res.status(403).type('text/plain').send('secret mismatch');
      return;
    }

    if (!VK_CONFIRMATION_CODE) {
      console.error('❌ VK_CONFIRMATION_CODE не задан в переменных окружения!');
      res.status(500).type('text/plain').send('confirmation code not set');
      return;
    }

    res.status(200).type('text/plain').send(VK_CONFIRMATION_CODE);
    return;
  }

  if (body.type === 'message_new') {
    const message = body.object?.message || {};
    const userId = message.from_id;
    const text = message.text || '';

    console.log(`\n💬 Сообщение от ${userId}: "${text}"`);

    let replyText = await sendToBotpress(userId, text);

    if (!replyText) {
      console.log('⚠️ Botpress не дал ответа.');
      replyText = 'Здравствуйте! Я бот для обучения присяжных заседателей. Пожалуйста, подождите, я настраиваюсь.';
    }

    console.log(`🤖 Отправляю пользователю: "${replyText}"`);
    await sendToVk(userId, replyText);
  }

  res.status(200).send('ok');
});

app.get('/webhook', (req, res) => {
  res.send('VK-Botpress bridge is running!');
});

app.get('/', (req, res) => {
  logEnv();
  res.send('Server is alive! 🚀');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 Сервер запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log('===========================================\n');
  logEnv();
});
