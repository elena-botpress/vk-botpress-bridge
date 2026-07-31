const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// === Переменные окружения (их вы задали в Render) ===
const VK_TOKEN = process.env.VK_TOKEN;
const VK_CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;
const VK_SECRET = process.env.VK_SECRET;

// =================================================================
// ВАШ АДРЕС ВЕБХУКА ИЗ BOTPRESS УЖЕ ВСТАВЛЕН СЮДА!
// Ничего менять не нужно, скрипт сразу готов к работе.
// =================================================================
const BOTPRESS_WEBHOOK_URL = 'https://webhook.botpress.cloud/2526d31b-9cca-46c0-80c8-58e01bb7d205';
// =================================================================

// === Вспомогательная функция логирования ===
function logEnv() {
  console.log('=== ENV CHECK ===');
  console.log('VK_TOKEN set:', !!VK_TOKEN);
  console.log('VK_CONFIRMATION_CODE:', VK_CONFIRMATION_CODE);
  console.log('VK_SECRET set:', !!VK_SECRET);
  console.log('BOTPRESS_WEBHOOK_URL:', BOTPRESS_WEBHOOK_URL);
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

// === Отправка сообщения в Botpress через ВЕБХУК ===
async function sendToBotpress(userId, text) {
  if (!BOTPRESS_WEBHOOK_URL) {
    console.error('❌ ОШИБКА: Не задан BOTPRESS_WEBHOOK_URL!');
    return null;
  }

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
    console.log('   RAW Botpress response:', raw);

    if (!res.ok) {
      console.error('⚠️ Ошибка Botpress (Webhook):', res.status, raw);
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

    console.log('📦 Parsed Botpress JSON:', JSON.stringify(data, null, 2));

    let reply = null;

    if (data.text) {
        reply = data.text;
    } else if (data.body && data.body.text) {
      reply = data.body.text;
    }

    if (!reply) {
      console.log('⚠️ Botpress вернул ответ, но я не могу найти поле "text".');
      reply = 'Извините, я не смог сформировать ответ (не найден текст).';
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
  console.log('===========================================\n');
  logEnv();
});
