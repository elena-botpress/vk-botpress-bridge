const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const crypto = require('crypto'); // ВАЖНО: Добавляем шифрование

const app = express();
app.use(bodyParser.json());

// === Переменные окружения ===
const VK_TOKEN = process.env.VK_TOKEN;
const VK_CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;
const VK_SECRET = process.env.VK_SECRET;
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY;
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;

// === НОВЫЙ URL ДЛЯ CHAT API ===
const BASE_URL = 'https://api.botpress.cloud/v1/chat';
const CONVERSATIONS_URL = `${BASE_URL}/conversations`;
const MESSAGES_URL = `${BASE_URL}/messages`;

function logEnv() {
  console.log('=== ENV CHECK ===');
  console.log('VK_TOKEN set:', !!VK_TOKEN);
  console.log('VK_CONFIRMATION_CODE:', VK_CONFIRMATION_CODE);
  console.log('BOTPRESS_API_KEY set:', !!BOTPRESS_API_KEY);
  console.log('BOTPRESS_BOT_ID:', BOTPRESS_BOT_ID);
  console.log('==================');
}

// Функция генерации ID длиной 32 символа (хеш)
function generateUserId(vkId) {
  return crypto.createHash('md5').update(String(vkId)).digest('hex');
}

async function sendToVk(userId, text) {
  if (!VK_TOKEN) return;

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
    if (data.error) console.error('❌ Ошибка ВК:', data.error);
    else console.log(`✅ Сообщение отправлено пользователю ${userId}`);
  } catch (err) {
    console.error('❌ Ошибка сети ВК:', err.message);
  }
}

async function sendToBotpress(userId, text) {
  if (!BOTPRESS_API_KEY) {
    console.error('❌ ОШИБКА: Нет ключа API!');
    return null;
  }

  try {
    // Генерируем длинный ID пользователя (хеш 32 символа)
    const bpUserId = generateUserId(userId);
    const bpConversationId = generateUserId(userId);

    console.log(`\n--- Начинаем общение с Botpress ---`);
    console.log(`ID для Botpress (хеш): ${bpUserId}`);

    // ШАГ 1: Создаем беседу (Conversation) с обязательным полем channel
    const convRes = await fetch(CONVERSATIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOTPRESS_API_KEY}`
      },
      body: JSON.stringify({
        userId: bpUserId,
        conversationId: bpConversationId,
        channel: 'web', // Это обязательное поле
        tags: {}
      })
    });

    const convRaw = await convRes.text();
    console.log(`Статус создания беседы: ${convRes.status}`);
    console.log(`Ответ от беседы: ${convRaw}`);

    // ШАГ 2: Отправляем сообщение в эту беседу
    const msgRes = await fetch(MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOTPRESS_API_KEY}`
      },
      body: JSON.stringify({
        userId: bpUserId,
        conversationId: bpConversationId,
        type: 'text',
        tags: {},
        payload: {
          text: text
        }
      })
    });

    const raw = await msgRes.text();
    console.log(`Статус отправки сообщения: ${msgRes.status}`);
    console.log('RAW Botpress response:', raw);

    if (!msgRes.ok) {
      console.error(`⚠️ Ошибка API:`, raw);
      return null;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error('❌ Ошибка парсинга:', raw);
      return null;
    }

    console.log('📦 Ответ от Botpress (JSON):', JSON.stringify(data, null, 2));

    // Ищем ответ
    let reply = null;
    if (data.body && data.body.text) {
      reply = data.body.text;
    } else if (data.text) {
      reply = data.text;
    }

    return reply;
  } catch (err) {
    console.error('❌ Ошибка соединения с Botpress:', err.message);
    return null;
  }
}

app.post('/webhook', async (req, res) => {
  const body = req.body;
  
  if (body.type === 'confirmation') {
    return res.status(200).type('text/plain').send(VK_CONFIRMATION_CODE);
  }

  if (body.type === 'message_new') {
    const message = body.object?.message || {};
    const userId = message.from_id;
    const text = message.text || '';

    console.log(`\n💬 Сообщение от ${userId}: "${text}"`);

    let replyText = await sendToBotpress(userId, text);

    if (!replyText) {
      console.log('⚠️ Botpress вернул пустоту. Включаю запасной план.');
      replyText = 'Здравствуйте! Я бот для обучения присяжных заседателей. Давайте проверим ваши знания!';
    }

    console.log(`🤖 Отправляю пользователю: "${replyText}"`);
    await sendToVk(userId, replyText);
  }

  res.status(200).send('ok');
});

app.get('/webhook', (req, res) => res.send('VK-Botpress bridge is running!'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 Сервер запущен!');
  console.log('===========================================\n');
  logEnv();
});
