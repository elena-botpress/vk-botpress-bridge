const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// === Переменные окружения (обязательно задать в Render) ===
const VK_TOKEN = process.env.VK_TOKEN;                      // токен сообщества ВК
const VK_CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE; // строка из поля "Строка, которую должен вернуть сервер" (4e76153d)
const VK_SECRET = process.env.VK_SECRET;                    // секретный ключ из поля "Секретный ключ" (aaQ13axAPQEcczQa)

const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;        // Bot ID из Botpress Cloud
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY;      // API key Botpress

// Базовый URL Converse API Botpress Cloud [20][28]
const BOTPRESS_CONVERSE_BASE = `https://api.botpress.cloud/api/v1/bots/${BOTPRESS_BOT_ID}`;

// === Вспомогательная функция логирования переменных окружения ===
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

    const data = await res.json();
    console.log(`   Статус Botpress: ${res.status}`);
    console.log('   Ответ Botpress:', JSON.stringify(data));

    if (!res.ok) {
      console.error('⚠️ Ошибка Botpress:', res.status, JSON.stringify(data));
      return null;
    }

    // Пробуем достать текст ответа из стандартных полей Botpress [27][28]
    let reply = null;

    if (Array.isArray(data.responses) && data.responses.length > 0) {
      const r = data.responses[0];
      reply = r.text || r.payload?.text || r.payload;
    } else if (data.output && data.output.text) {
      reply = data.output.text;
    }

    if (!reply) {
      reply = 'Извините, я не смог сформировать ответ.';
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

  // 1) Подтверждение адреса
  if (body.type === 'confirmation') {
    console.log('🔐 Запрос подтверждения от ВК');

    const receivedSecret = body.secret;
    console.log('   Полученный secret:', receivedSecret);
    console.log('   Ожидаемый VK_SECRET:', VK_SECRET);
    console.log('   Ожидаемый VK_CONFIRMATION_CODE:', VK_CONFIRMATION_CODE);

    // Если вы хотите проверять секретный ключ:
    if (VK_SECRET && receivedSecret && receivedSecret !== VK_SECRET) {
      console.error('❌ Секретный ключ не совпадает! Подтверждение отклонено.');
      // Важно: если вернуть не тот текст, ВК не подтвердит сервер.
      // Но для диагностики можно временно вернуть ошибку:
      res.status(403).type('text/plain').send('secret mismatch');
      return;
    }

    if (!VK_CONFIRMATION_CODE) {
      console.error('❌ VK_CONFIRMATION_CODE не задан в переменных окружения!');
      res.status(500).type('text/plain').send('confirmation code not set');
      return;
    }

    // ВК ожидает СТРОГО эту строку, без JSON и лишнего текста [11][13]
    res.status(200).type('text/plain').send(VK_CONFIRMATION_CODE);
    return;
  }

  // 2) Новое сообщение
  if (body.type === 'message_new') {
    const message = body.object?.message || {};
    const userId = message.from_id;
    const text = message.text || '';

    console.log(`\n💬 Сообщение от ${userId}: "${text}"`);

    try {
      let replyText = await sendToBotpress(userId, text);

      if (!replyText) {
        console.log('⚠️ Botpress не дал ответа, использую запасной вариант');
        replyText = `Вы написали: "${text}". (Botpress временно недоступен)`;
      }

      console.log(`🤖 Отправляю пользователю: "${replyText}"`);
      await sendToVk(userId, replyText);
    } catch (error) {
      console.error('❌ Критическая ошибка при обработке сообщения:', error.message);
      await sendToVk(userId, 'Произошла техническая ошибка.');
    }
  }

  // ВК ожидает 'ok' в теле ответа для любых событий
  res.status(200).send('ok');
});

// Простой GET для проверки, что сервис жив
app.get('/webhook', (req, res) => {
  res.send('VK-Botpress bridge is running!');
});

app.get('/', (req, res) => {
  logEnv();
  res.send('Server is alive! 🚀');
});

// Запуск сервера — Render сам задаёт порт через переменную окружения PORT [8][15]
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 Сервер запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log(`🤖 Bot ID: ${BOTPRESS_BOT_ID}`);
  console.log(`🔐 Ожидаемый код подтверждения: ${VK_CONFIRMATION_CODE}`);
  console.log('===========================================\n');
  logEnv();
});
