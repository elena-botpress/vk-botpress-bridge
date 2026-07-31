const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// Читаем переменные окружения из Render
const VK_TOKEN = process.env.VK_TOKEN;
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;
const CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;

// API ключ Botpress Cloud (найден через DevTools)
const BOTPRESS_API_KEY = 'eyJhbGciOiJIUzI1NiIsR5cClikpXVCJ9.eyJpCI6InVrZzXJfMDFLWVZOUUZGQVhYVDdQU0ZWME0wMjvc1S00iLCjYpXQjOjE3ODU0ODc2NzB9.cfnunvolA82XNJunqUM2c-3l0XhNTFPuPYiY4pGGHxs';

// ПРАВИЛЬНЫЙ URL для Botpress Cloud Webchat (БЕЗ /v1/bots/)
const BOTPRESS_WEBCHAT_URL = `https://webchat.botpress.cloud/${BOTPRESS_BOT_ID}`;

// Функция для отправки сообщений обратно в ВКонтакте
async function sendVkMessage(userId, text) {
  if (!VK_TOKEN) {
    console.error('❌ ОШИБКА: Не найден VK_TOKEN в переменных окружения!');
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
    const response = await fetch(`${url}?${params.toString()}`);
    const data = await response.json();
    if (data.error) {
      console.error('❌ Ошибка API ВК при отправке:', data.error);
    } else {
      console.log('✅ Сообщение успешно отправлено пользователю', userId);
    }
  } catch (err) {
    console.error('❌ Ошибка сети при отправке в ВК:', err.message);
  }
}

// Функция для отправки сообщения в Botpress Cloud через Webchat API
async function sendToBotpress(userId, text) {
  console.log('🤖 Отправляем сообщение в Botpress через Webchat API...');
  console.log(`   Bot ID: ${BOTPRESS_BOT_ID}`);
  console.log(`   User ID: ${userId}`);
  
  // ПРАВИЛЬНЫЙ URL: https://webchat.botpress.cloud/{BOT_ID}/webchat/{USER_ID}/messages
  const messageUrl = `${BOTPRESS_WEBCHAT_URL}/webchat/${userId}/messages`;
  
  console.log(`   URL: ${messageUrl}`);
  
  try {
    const response = await fetch(messageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOTPRESS_API_KEY}`,
        'X-User-Key': BOTPRESS_API_KEY
      },
      body: JSON.stringify({
        type: 'text',
        text: text
      })
    });
    
    console.log(`   Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Botpress ответ:', JSON.stringify(data, null, 2));
      
      // Извлекаем текст ответа
      let replyText = 'Извините, я не понял ваш вопрос.';
      
      if (data.responses && data.responses.length > 0) {
        replyText = data.responses[0].text || 
                    data.responses[0].payload || 
                    'Сообщение получено.';
      } else if (data.output && data.output.text) {
        replyText = data.output.text;
      } else if (data.message) {
        replyText = data.message;
      }
      
      return replyText;
    } else {
      const errorText = await response.text();
      console.error(`❌ Ошибка Botpress (${response.status}):`, errorText);
      return null;
    }
  } catch (err) {
    console.error('❌ Ошибка сети при запросе к Botpress:', err.message);
    return null;
  }
}

// ОБРАБОТЧИК ВЕБХУКА (сюда ВК присылает события)
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('📨 Received webhook:', JSON.stringify(body, null, 2));

  // 1. Обработка подтверждения сервера
  if (body.type === 'confirmation') {
    console.log('🔐 Sending confirmation code:', CONFIRMATION_CODE);
    res.set('Content-Type', 'text/plain');
    res.status(200).send(CONFIRMATION_CODE);
    return;
  }

  // 2. Обработка входящих сообщений
  if (body.type === 'message_new') {
    const userId = body.object.message.from_id;
    const text = body.object.message.text || '';

    console.log(`\n📩 Новое сообщение от ${userId}: "${text}"`);
    console.log('='.repeat(50));

    try {
      // Отправляем сообщение в Botpress
      const replyText = await sendToBotpress(userId, text);
      
      // Если Botpress не ответил, используем fallback
      if (!replyText) {
        console.log('\n️ Botpress не ответил, используем тестовый ответ');
        const fallbackText = `Вы написали: "${text}" (Botpress временно недоступен)`;
        await sendVkMessage(userId, fallbackText);
      } else {
        console.log(`\n🤖 Ответ для пользователя: "${replyText}"`);
        await sendVkMessage(userId, replyText);
      }

    } catch (error) {
      console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error.message);
      console.error('Stack trace:', error.stack);
      await sendVkMessage(userId, 'Извините, произошла техническая ошибка.');
    }
  }

  // 3. Обязательный ответ серверу ВК "OK"
  res.send('ok');
});

// Проверка, что сервер доступен
app.get('/webhook', (req, res) => {
  res.send('VK-Botpress Bridge is running! Use POST /webhook for webhooks.');
});

app.get('/', (req, res) => {
  res.send('VK-Botpress Bridge Server is running! ');
});

// ЗАПУСК СЕРВЕРА
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 VK-Botpress Bridge Server Started!');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🤖 Bot ID: ${BOTPRESS_BOT_ID}`);
  console.log(`🔗 Webchat URL: ${BOTPRESS_WEBCHAT_URL}`);
  console.log(`🔗 Webhook URL: https://vk-botpress-bridge.onrender.com/webhook`);
  console.log('===========================================\n');
});
