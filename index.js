const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const VK_TOKEN = process.env.VK_TOKEN;
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;
const CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;

// ТОКЕН из DevTools
const BOTPRESS_API_KEY = 'eyJhbGciOiJIUzI1NiIsR5cClikpXVCJ9.eyJpCI6InVrZzXJfMDFLWVZOUUZGQVhYVDdQU0ZWME0wMjvc1S00iLCjYpXQjOjE3ODU0ODc2NzB9.cfnunvolA82XNJunqUM2c-3l0XhNTFPuPYiY4pGGHxs';

// ПРАВИЛЬНЫЙ URL (БЕЗ /v1/bots/, используем workspace ID из DevTools)
const WORKSPACE_ID = '3ff2ab80-c34f-4b5b-96b9-f71532b63f43'; // ИЗ DEVTOOLS!
const BOTPRESS_WEBCHAT_URL = `https://webchat.botpress.cloud/${WORKSPACE_ID}`;

async function sendVkMessage(userId, text) {
  if (!VK_TOKEN) {
    console.error('❌ ОШИБКА: Не найден VK_TOKEN!');
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
      console.error('❌ Ошибка API ВК:', data.error);
    } else {
      console.log('✅ Сообщение отправлено пользователю', userId);
    }
  } catch (err) {
    console.error('❌ Ошибка сети:', err.message);
  }
}

async function sendToBotpress(userId, text) {
  console.log('🤖 Отправляем в Botpress...');
  console.log(`   Workspace ID: ${WORKSPACE_ID}`);
  console.log(`   Bot ID: ${BOTPRESS_BOT_ID}`);
  console.log(`   User ID: ${userId}`);
  
  // Правильный URL из DevTools
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
      
      let replyText = 'Извините, я не понял ваш вопрос.';
      
      if (data.responses && data.responses.length > 0) {
        replyText = data.responses[0].text || data.responses[0].payload;
      } else if (data.output && data.output.text) {
        replyText = data.output.text;
      }
      
      return replyText;
    } else {
      const errorText = await response.text();
      console.error(`❌ Ошибка Botpress (${response.status}):`, errorText);
      return null;
    }
  } catch (err) {
    console.error('❌ Ошибка сети:', err.message);
    return null;
  }
}

app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('📨 Webhook:', JSON.stringify(body, null, 2));

  if (body.type === 'confirmation') {
    console.log('🔐 Confirmation code:', CONFIRMATION_CODE);
    res.set('Content-Type', 'text/plain');
    res.status(200).send(CONFIRMATION_CODE);
    return;
  }

  if (body.type === 'message_new') {
    const userId = body.object.message.from_id;
    const text = body.object.message.text || '';

    console.log(`\n📩 Сообщение от ${userId}: "${text}"`);

    try {
      const replyText = await sendToBotpress(userId, text);
      
      if (!replyText) {
        console.log('⚠️ Botpress не ответил, используем fallback');
        await sendVkMessage(userId, `Вы написали: "${text}" (Botpress недоступен)`);
      } else {
        console.log(`🤖 Ответ: "${replyText}"`);
        await sendVkMessage(userId, replyText);
      }

    } catch (error) {
      console.error('❌ ОШИБКА:', error.message);
      await sendVkMessage(userId, 'Произошла техническая ошибка.');
    }
  }

  res.send('ok');
});

app.get('/webhook', (req, res) => {
  res.send('VK-Botpress Bridge is running!');
});

app.get('/', (req, res) => {
  res.send('VK-Botpress Bridge Server is running! ');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log(' VK-Botpress Bridge Server Started!');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🤖 Bot ID: ${BOTPRESS_BOT_ID}`);
  console.log(`🏢 Workspace ID: ${WORKSPACE_ID}`);
  console.log(`🔗 Webchat URL: ${BOTPRESS_WEBCHAT_URL}`);
  console.log('===========================================\n');
});
