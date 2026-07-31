const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const VK_TOKEN = process.env.VK_TOKEN;
const VK_CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;

// НОВЫЙ API ключ из Botpress
const BOTPRESS_API_KEY = 'bp_bak_TPvTrqN3Fru6tN6UYY2N6RsOKLExq3gir7Oi';

const BOTPRESS_API_BASE = `https://api.botpress.cloud/v1/bots/${BOTPRESS_BOT_ID}`;

async function sendToVk(userId, text) {
  if (!VK_TOKEN) {
    console.error('❌ ОШИБКА: Не задан VK_TOKEN');
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
  try {
    const conversationId = `user-${userId}`;
    
    console.log(`🤖 Шаг 1: Создаём conversation ${conversationId}`);
    
    // Шаг 1: Создаём conversation
    const createConvResponse = await fetch(`${BOTPRESS_API_BASE}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOTPRESS_API_KEY}`
      },
      body: JSON.stringify({
        id: conversationId
      })
    });

    console.log(`   Create conversation status: ${createConvResponse.status}`);
    
    if (!createConvResponse.ok && createConvResponse.status !== 409) {
      const errText = await createConvResponse.text();
      console.error(`   ⚠️ Ошибка создания conversation: ${errText}`);
    }

    // Шаг 2: Отправляем сообщение в conversation
    console.log(`💬 Шаг 2: Отправляем сообщение в conversation`);
    
    const messageResponse = await fetch(`${BOTPRESS_API_BASE}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOTPRESS_API_KEY}`
      },
      body: JSON.stringify({
        type: 'text',
        text: text
      })
    });

    console.log(`   Send message status: ${messageResponse.status}`);

    if (messageResponse.ok) {
      const data = await messageResponse.json();
      console.log('✅ Ответ Botpress:', JSON.stringify(data));
      
      let reply = 'Извините, я не понял.';
      if (data.responses && data.responses.length > 0) {
        reply = data.responses[0].text || data.responses[0].payload;
      } else if (data.output && data.output.text) {
        reply = data.output.text;
      }
      return reply;
    } else {
      const errText = await messageResponse.text();
      console.error(`⚠️ Ошибка отправки сообщения (${messageResponse.status}):`, errText);
      return null;
    }
  } catch (err) {
    console.error('❌ Ошибка сети Botpress:', err.message);
    return null;
  }
}

app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('📨 Webhook:', JSON.stringify(body));

  if (body.type === 'confirmation') {
    console.log('🔐 Confirmation code:', VK_CONFIRMATION_CODE);
    res.status(200).type('text/plain').send(VK_CONFIRMATION_CODE);
    return;
  }

  if (body.type === 'message_new') {
    const userId = body.object.message.from_id;
    const text = body.object.message.text || '';
    console.log(`\n💬 Сообщение от ${userId}: "${text}"`);

    try {
      let replyText = await sendToBotpress(userId, text);

      if (!replyText) {
        console.log('⚠️ Botpress не ответил, использую запасной вариант');
        replyText = `Вы написали: "${text}". (Botpress временно недоступен)`;
      }

      console.log(`🤖 Отправляю пользователю: "${replyText}"`);
      await sendToVk(userId, replyText);

    } catch (error) {
      console.error('❌ Критическая ошибка:', error.message);
      await sendToVk(userId, 'Произошла техническая ошибка.');
    }
  }

  res.send('ok');
});

app.get('/webhook', (req, res) => {
  res.send('VK-Botpress Bridge is running!');
});

app.get('/', (req, res) => {
  res.send('Server is alive! 🚀');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 Сервер запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log(`🤖 Bot ID: ${BOTPRESS_BOT_ID}`);
  console.log(`🔐 Ожидаемый код подтверждения: ${VK_CONFIRMATION_CODE}`);
  console.log('===========================================\n');
});
