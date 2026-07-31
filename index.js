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

// URL для Botpress Cloud API (ИСПРАВЛЕНО - убран /conversations из конца)
const BOTPRESS_BASE_URL = `https://api.botpress.cloud/v1/bots/${BOTPRESS_BOT_ID}`;

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
      console.error(' Ошибка API ВК при отправке:', data.error);
    } else {
      console.log('✅ Сообщение успешно отправлено пользователю', userId);
    }
  } catch (err) {
    console.error('❌ Ошибка сети при отправке в ВК:', err.message);
  }
}

// ОБРАБОТЧИК ВЕБХУКА (сюда ВК присылает события)
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log(' Received webhook:', JSON.stringify(body, null, 2));

  // 1. Обработка подтверждения сервера
  if (body.type === 'confirmation') {
    console.log(' Sending confirmation code:', CONFIRMATION_CODE);
    res.set('Content-Type', 'text/plain');
    res.status(200).send(CONFIRMATION_CODE);
    return;
  }

  // 2. Обработка входящих сообщений
  if (body.type === 'message_new') {
    // Извлекаем данные пользователя и текст
    const userId = body.object.message.from_id;
    const text = body.object.message.text || '';
    const peerId = body.object.message.peer_id;

    console.log(`📩 Новое сообщение от ${userId}: "${text}"`);

    // --- ЗАПРОС К BOTPRESS CLOUD ---
    try {
      // ИСПРАВЛЕНО: правильный URL для Botpress Cloud API
      // Используем endpoint /converse/{userId} для отправки сообщения
      const converseUrl = `${BOTPRESS_BASE_URL}/converse/${userId}`;
      
      console.log('🤖 Отправляем запрос в Botpress:', converseUrl);
      
      const botpressResponse = await fetch(converseUrl, {
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

      console.log(' Botpress response status:', botpressResponse.status);

      if (botpressResponse.ok) {
        const botpressData = await botpressResponse.json();
        console.log('✅ Botpress response data:', JSON.stringify(botpressData, null, 2));
        
        // Извлекаем ответ от Botpress
        let replyText = 'Извините, я не понял ваш вопрос.';
        
        // Проверяем разные возможные структуры ответа
        if (botpressData.responses && botpressData.responses.length > 0) {
          replyText = botpressData.responses[0].text || 
                      botpressData.responses[0].payload || 
                      botpressData.responses[0].message ||
                      'Сообщение получено.';
        } else if (botpressData.output && botpressData.output.text) {
          replyText = botpressData.output.text;
        } else if (botpressData.message) {
          replyText = botpressData.message;
        }

        console.log('🤖 Ответ от Botpress:', replyText);
        
        // Отправляем ответ пользователю через ВК
        await sendVkMessage(userId, replyText);
      } else {
        // Если Botpress вернул ошибку
        let errorText = '';
        try {
          errorText = await botpressResponse.text();
        } catch (e) {
          errorText = 'Не удалось прочитать текст ошибки';
        }
        
        console.error(`❌ Ошибка от Botpress (${botpressResponse.status}):`, errorText);
        
        // Отправляем пользователю понятное сообщение
        let userErrorMessage = `Извините, произошла ошибка связи с ботом (код: ${botpressResponse.status}).`;
        
        if (botpressResponse.status === 404) {
          userErrorMessage = 'Бот временно недоступен. Попробуйте позже.';
        } else if (botpressResponse.status === 401 || botpressResponse.status === 403) {
          userErrorMessage = 'Ошибка авторизации. Обратитесь к администратору.';
        }
        
        await sendVkMessage(userId, userErrorMessage);
      }

    } catch (error) {
      // СЮДА ВЫВОДИТСЯ ОШИБКА, КОТОРУЮ ВЫ УВИДИТЕ В ЛОГАХ RENDER
      console.error('❌ КРИТИЧЕСКАЯ ОШИБКА В ОБРАБОТЧИКЕ:', error.message);
      console.error('Stack trace:', error.stack);
      
      // Отправляем пользователю сообщение об ошибке
      await sendVkMessage(userId, 'Извините, произошла техническая ошибка при обработке запроса.');
    }
  }

  // 3. Обязательный ответ серверу ВК "OK"
  res.send('ok');
});

// Проверка, что сервер доступен по корневому адресу в браузере
app.get('/webhook', (req, res) => {
  res.send('VK-Botpress Bridge is running! Use POST /webhook for webhooks.');
});

// Корневой маршрут
app.get('/', (req, res) => {
  res.send('VK-Botpress Bridge Server is running! 🚀');
});

// ЗАПУСК СЕРВЕРА
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('===========================================');
  console.log('🚀 VK-Botpress Bridge Server Started!');
  console.log(` Port: ${PORT}`);
  console.log(`🤖 Bot ID: ${BOTPRESS_BOT_ID}`);
  console.log(` Webhook URL: https://vk-botpress-bridge.onrender.com/webhook`);
  console.log('===========================================');
});
