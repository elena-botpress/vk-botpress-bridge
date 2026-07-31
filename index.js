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

// Базовые URL для Botpress Cloud API
const BOTPRESS_API_BASE = `https://api.botpress.cloud/v1/bots/${BOTPRESS_BOT_ID}`;
const BOTPRESS_WEBCHAT_BASE = `https://webchat.botpress.cloud/v1/bots/${BOTPRESS_BOT_ID}`;

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

// Функция для отправки сообщения в Botpress Cloud (с созданием conversation)
async function sendToBotpress(userId, text) {
  const conversationId = `user-${userId}`;
  
  console.log('🤖 Пробуем отправить сообщение в Botpress...');
  console.log(`   Bot ID: ${BOTPRESS_BOT_ID}`);
  console.log(`   User ID: ${userId}`);
  console.log(`   Conversation ID: ${conversationId}`);
  
  // ШАГ 1: Создаём или получаем conversation
  console.log(' Шаг 1: Создаём conversation...');
  let conversationCreated = false;
  
  try {
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
    
    if (createConvResponse.ok || createConvResponse.status === 409) {
      // 200 = создан, 409 = уже существует
      conversationCreated = true;
      console.log('   ✅ Conversation готов');
    } else {
      const errorText = await createConvResponse.text();
      console.log(`   ⚠️ Не удалось создать conversation: ${errorText}`);
    }
  } catch (err) {
    console.log(`   ⚠️ Ошибка при создании conversation: ${err.message}`);
  }
  
  // ШАГ 2: Отправляем сообщение в conversation
  console.log('💬 Шаг 2: Отправляем сообщение...');
  
  try {
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
      const responseData = await messageResponse.json();
      console.log('   ✅ Сообщение отправлено, ответ:', JSON.stringify(responseData, null, 2));
      
      // Извлекаем текст ответа
      let replyText = 'Извините, я не понял ваш вопрос.';
      
      if (responseData.responses && responseData.responses.length > 0) {
        replyText = responseData.responses[0].text || 
                    responseData.responses[0].payload || 
                    'Сообщение получено.';
      } else if (responseData.output && responseData.output.text) {
        replyText = responseData.output.text;
      }
      
      return replyText;
    } else {
      const errorText = await messageResponse.text();
      console.log(`    Ошибка при отправке сообщения: ${errorText}`);
      return null;
    }
  } catch (err) {
    console.log(`   ❌ Ошибка сети: ${err.message}`);
    return null;
  }
}

// Альтернативный метод через Webchat API
async function sendToBotpressWebchat(userId, text) {
  console.log('🌐 Пробуем Webchat API...');
  
  try {
    const response = await fetch(`${BOTPRESS_WEBCHAT_BASE}/webchat/${userId}/messages`, {
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
    
    console.log(`   Webchat response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ Webchat ответ:', JSON.stringify(data, null, 2));
      
      let replyText = 'Извините, я не понял ваш вопрос.';
      
      if (data.responses && data.responses.length > 0) {
        replyText = data.responses[0].text || data.responses[0].payload;
      }
      
      return replyText;
    } else {
      const errorText = await response.text();
      console.log(`   ❌ Webchat ошибка: ${errorText}`);
      return null;
    }
  } catch (err) {
    console.log(`   ❌ Webchat ошибка сети: ${err.message}`);
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
      // Пробуем основной метод (через conversations API)
      let replyText = await sendToBotpress(userId, text);
      
      // Если не сработало, пробуем webchat API
      if (!replyText) {
        console.log('\n⚠️ Основной метод не сработал, пробуем Webchat API...');
        replyText = await sendToBotpressWebchat(userId, text);
      }
      
      // Если оба метода не сработали, отправляем тестовый ответ
      if (!replyText) {
        console.log('\n⚠️ Оба метода не сработали, используем тестовый ответ');
        replyText = `Вы написали: "${text}" (Botpress временно недоступен)`;
      }

      console.log(`\n🤖 Финальный ответ для пользователя: "${replyText}"`);
      
      // Отправляем ответ пользователю через ВК
      await sendVkMessage(userId, replyText);

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
  console.log(`🔗 Webhook URL: https://vk-botpress-bridge.onrender.com/webhook`);
  console.log('===========================================\n');
});
