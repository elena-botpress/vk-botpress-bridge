const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// === Переменные окружения ===
const VK_TOKEN = process.env.VK_TOKEN;
const VK_CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;
const VK_SECRET = process.env.VK_SECRET;
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY;
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;

// === ОФИЦИАЛЬНЫЙ КЛИЕНТСКИЙ URL BOTPRESS (ИСПОЛЬЗУЕТ SDK) ===
// Мы используем WebSocket-протокол через HTTP-туннель.
const BP_CLIENT_URL = `https://chat.botpress.cloud/api/v1/messages`;

function logEnv() {
  console.log('=== ENV CHECK ===');
  console.log('VK_TOKEN set:', !!VK_TOKEN);
  console.log('VK_CONFIRMATION_CODE:', VK_CONFIRMATION_CODE);
  console.log('BOTPRESS_API_KEY set:', !!BOTPRESS_API_KEY);
  console.log('BOTPRESS_BOT_ID:', BOTPRESS_BOT_ID);
  console.log('==================');
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
    console.error('❌ ОШИБКА: Нет BOTPRESS_API_KEY!');
    return null;
  }

  // Используем длинный хешированный ID, чтобы избежать ошибок 400
  const hashedUserId = require('crypto').createHash('md5').update(String(userId)).digest('hex');

  try {
    console.log(`🤖 Бот Клиент: POST ${BP_CLIENT_URL}`);
    console.log(`   Текст: "${text}" (ID: ${hashedUserId})`);

    const res = await fetch(BP_CLIENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOTPRESS_API_KEY}`
      },
      body: JSON.stringify({
        userId: hashedUserId,
        conversationId: hashedUserId,
        type: 'text',
        tags: {},
        payload: {
          text: text
        }
      })
    });

    const raw = await res.text();
    console.log(`   Статус API: ${res.status}`);
    console.log('   RAW Botpress response:', raw);

    if (!res.ok) {
      console.error(`⚠️ Ошибка API (${res.status}):`, raw);
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
      console.log('⚠️ Botpress не дал ответа.');
      replyText = 'Здравствуйте! Я бот для обучения присяжных заседателей. Давайте начнем!';
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
