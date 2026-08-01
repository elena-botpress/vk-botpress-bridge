const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// === Переменные окружения ===
const VK_TOKEN = process.env.VK_TOKEN;
const VK_CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;
const VK_SECRET = process.env.VK_SECRET;

// === ВАШ АДРЕС ВЕБХУКА (ПРОВЕРЕННЫЙ) ===
const BOTPRESS_WEBHOOK_URL = 'https://webhook.botpress.cloud/2526d31b-9cca-46c0-80c8-58e01bb7d205';

function logEnv() {
  console.log('=== ENV CHECK ===');
  console.log('VK_TOKEN set:', !!VK_TOKEN);
  console.log('VK_CONFIRMATION_CODE:', VK_CONFIRMATION_CODE);
  console.log('BOTPRESS_WEBHOOK_URL:', BOTPRESS_WEBHOOK_URL);
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
  try {
    console.log(`🤖 Webhook: POST ${BOTPRESS_WEBHOOK_URL}`);
    console.log(`   Отправляем: "start"`);

    // ВАЖНО: Отправляем команду 'start' вместо текста
    const res = await fetch(BOTPRESS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bp-user-id': String(userId)
      },
      body: JSON.stringify({
        text: 'start'
      })
    });

    const raw = await res.text();
    console.log(`   Статус Webhook: ${res.status}`);
    console.log('   RAW Botpress response:', raw);

    if (!res.ok) return null;

    let reply = null;
    try {
      const data = JSON.parse(raw);
      console.log('📦 Ответ от Botpress (JSON):', JSON.stringify(data, null, 2));
      
      if (data.text) reply = data.text;
      else if (data.body && data.body.text) reply = data.body.text;
    } catch (e) {
      console.log('📦 Ответ от Botpress (Простой текст):', raw);
      reply = raw;
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

    // ЗАПУСКАЕМ БОТА ПО ЛЮБОМУ СООБЩЕНИЮ
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
