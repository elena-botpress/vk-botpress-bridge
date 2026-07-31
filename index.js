const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// === Переменные окружения ===
const VK_TOKEN = process.env.VK_TOKEN;
const VK_CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;
const VK_SECRET = process.env.VK_SECRET;

const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY;

// === URL ДЛЯ BOTPRESS CLOUD ===
const BOTPRESS_CONVERSE_BASE = `https://chat.botpress.cloud/api/v1/bots/${BOTPRESS_BOT_ID}`;

// === Вспомогательная функция логирования ===
function logEnv() {
  console.log('=== ENV CHECK ===');
  console.log('VK_TOKEN set:', !!VK_TOKEN);
  console.log('VK_CONFIRMATION_CODE:', VK_CONFIRMATION_CODE);
  console.log('VK_SECRET set:', !!VK_SECRET);
  console.log('BOTPRESS_BOT_ID:', BOTPRESS_BOT_ID);
  console.log('BOTPRESS_API_KEY set:', !!BOTPRESS_API_KEY);
  console.log('==================');
}

// === Отправка сообщения пользователю ВК ===
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

// === Отправка сообщения в Botpress через Converse API ===
async function sendToBotpress(userId, text) {
  if (!BOTPRESS_BOT_ID || !BOTPRESS_API_KEY) {
    console.error('❌ ОШИБКА: Не заданы BOTPRESS_BOT_ID или BOTPRESS_API_KEY');
    return null;
  }

  try {
    const url = `${BOTPRESS_CONVERSE_BASE}/converse/${userId}`;
    console.log(`🤖 Converse API: POST ${url}`);
    console.log(`   Текст: "${text}"`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOTPRESS_API_KEY}`
      },
      body: JSON.stringify({
        type: 'text',
        text
      })
    });

    const raw = await res.text();
    console.log(`   Статус Botpress: ${res.status}`);
    console.log('   RAW Botpress response:', raw);

    if (!res.ok) {
      console.error('⚠️ Ошибка Botpress:', res.status, raw);
      return null;
    }

    let data;
    try {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        data = JSON.parse(trimmed);
      } else {
        console.warn('⚠️ Ответ Botpress не в JSON-формате, не могу распарсить.');
        return null;
      }
    } catch (e) {
      console.error('❌ Ошибка парсинга JSON Botpress:', e.message);
      return null;
    }

    console.log('📦 Parsed Botpress JSON (ВСЯ СТРУКТУРА):', JSON.stringify(data, null, 2));

    // ============================================================
    // НОВАЯ ЛОГИКА ПОИСКА ОТВЕТА (адаптированная под Workflows)
    // ============================================================
    let reply = null;

    // 1. Ищем в стандартном поле output.text (старый формат)
    if (data.output && data.output.text) {
      reply = data.output.text;
    } 
    // 2. Ищем в новом поле body.text (Workflows)
    else if (data.body && data.body.text) {
      reply = data.body.text;
    }
    // 3. Если ничего нет, смотрим массив body (иногда бывает массив)
    else if (Array.isArray(data.body) && data.body.length > 0) {
        const firstElement = data.body[0];
        if (firstElement.text) reply = firstElement.text;
    }

    if (!reply) {
      console.log('⚠️ Botpress вернул ответ, но я не могу найти поле "text" в его структуре.');
      console.log('❗ Чтобы исправить это, скопируйте строку выше "Parsed Botpress JSON" и пришлите её мне.');
      reply = 'Извините, я не смог сформировать ответ (ошибка парсинга).';
    }

    return reply;
  } catch (err) {
    console.error('❌ Ошибка сети Botpress:', err.message);
    return null;
  }
}

// === Обработка VK Callback API ===
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
      console.log('⚠️ Botpress не дал ответа');
      replyText = 'Извините, я временно не могу обработать ваш запрос.';
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

// Запуск сервера
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 Сервер запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log(`🤖 Bot ID: ${BOTPRESS_BOT_ID}`);
  console.log('===========================================\n');
  logEnv();
});
