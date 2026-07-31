const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

// === Переменные окружения ===
const VK_TOKEN = process.env.VK_TOKEN;
const VK_CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;
const VK_SECRET = process.env.VK_SECRET;
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY;

// === Базовые URL для API Botpress ===
const BOTPRESS_BASE_URL = 'https://api.botpress.cloud/v1';
const BOTPRESS_CONVERSATIONS_URL = `${BOTPRESS_BASE_URL}/chat/conversations`;
const BOTPRESS_MESSAGES_URL = `${BOTPRESS_BASE_URL}/chat/messages`;

function logEnv() {
  console.log('=== ENV CHECK ===');
  console.log('VK_TOKEN set:', !!VK_TOKEN);
  console.log('VK_CONFIRMATION_CODE:', VK_CONFIRMATION_CODE);
  console.log('VK_SECRET set:', !!VK_SECRET);
  console.log('BOTPRESS_API_KEY set:', !!BOTPRESS_API_KEY);
  console.log('==================');
}

function generateBotpressId(vkId) {
  return crypto.createHash('md5').update(String(vkId)).digest('hex');
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

async function sendToBotpress(userId, text) {
  if (!BOTPRESS_API_KEY) {
    console.error('❌ ОШИБКА: Не задан BOTPRESS_API_KEY');
    return null;
  }

  try {
    const bpUserId = generateBotpressId(userId);
    const bpConversationId = generateBotpressId(userId);

    console.log(`\n--- Попытка отправить в Botpress ---`);
    console.log(`ID пользователя (BP): ${bpUserId}`);
    console.log(`ID беседы (BP): ${bpConversationId}`);

    // ШАГ 1: Создаем беседу (Conversation), если её нет
    const convRes = await fetch(BOTPRESS_CONVERSATIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOTPRESS_API_KEY}`
      },
      body: JSON.stringify({
        userId: bpUserId,
        conversationId: bpConversationId
      })
    });

    const convRaw = await convRes.text();
    console.log(`Статус создания беседы: ${convRes.status}`);
    console.log(`Ответ создания беседы: ${convRaw}`);

    // Если беседа не создалась и не вернула 200/201, выходим
    if (!convRes.ok && convRes.status !== 200 && convRes.status !== 201) {
       console.error('❌ Не удалось создать/найти беседу. Останавливаемся.');
       return null; 
    }

    // ШАГ 2: Отправляем сообщение в эту беседу
    console.log(`   Отправка текста: "${text}"`);

    const msgRes = await fetch(BOTPRESS_MESSAGES_URL, {
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
    console.log(`   Статус отправки сообщения: ${msgRes.status}`);
    console.log('   RAW Botpress response:', raw);

    if (!msgRes.ok) {
      console.error('⚠️ Ошибка отправки сообщения:', raw);
      return null;
    }

    // ШАГ 3: Проверяем ответ от Botpress
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error('❌ Ошибка парсинга JSON:', raw);
      return null;
    }

    console.log('📦 Ответ от Botpress (полный):', JSON.stringify(data, null, 2));

    // Пытаемся найти ответ
    let reply = null;
    if (data.body && data.body.text) {
      reply = data.body.text;
    } else if (Array.isArray(data.body) && data.body.length > 0) {
      reply = data.body[0].text;
    }

    return reply;
  } catch (err) {
    console.error('❌ Ошибка соединения с Botpress:', err.message);
    return null;
  }
}

app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('📨 Webhook:', JSON.stringify(body));

  if (body.type === 'confirmation') {
    console.log('🔐 Подтверждение сервера ВК');
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
      replyText = 'Здравствуйте! Я бот для обучения присяжных заседателей. Добро пожаловать!';
    }

    console.log(`🤖 Отправляю пользователю: "${replyText}"`);
    await sendToVk(userId, replyText);
  }

  res.status(200).send('ok');
});

app.get('/webhook', (req, res) => {
  res.send('VK-Botpress bridge is running!');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 Сервер запущен!');
  console.log('===========================================\n');
  logEnv();
});
