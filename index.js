const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// Читаем переменные окружения из Render
const VK_TOKEN = process.env.VK_TOKEN;
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;
const CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;

// Ваш секретный ключ (если хотите его проверять, раскомментируйте)
// const VK_SECRET_KEY = process.env.VK_SECRET_KEY; 

// Функция для отправки сообщений обратно в ВКонтакте
async function sendVkMessage(userId, text) {
  if (!VK_TOKEN) {
    console.error('ОШИБКА: Не найден VK_TOKEN в переменных окружения!');
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
      console.error('Ошибка API ВК при отправке:', data.error);
    } else {
      console.log('✅ Сообщение успешно отправлено пользователю', userId);
    }
  } catch (err) {
    console.error('Ошибка сети при отправке в ВК:', err.message);
  }
}

// ОБРАБОТЧИК ВЕБХУКА (сюда ВК присылает события)
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('Received:', JSON.stringify(body));

  // 1. Обработка подтверждения сервера
  if (body.type === 'confirmation') {
    console.log('Sending confirmation code:', CONFIRMATION_CODE);
    res.set('Content-Type', 'text/plain');
    res.status(200).send(CONFIRMATION_CODE);
    return;
  }

  // 2. Обработка входящих сообщений
  if (body.type === 'message_new') {
    // Извлекаем данные пользователя и текст
    const userId = body.object.message.from_id;
    const text = body.object.message.text || '';
    const peerId = body.object.message.peer_id; // ID чата/пользователя

    console.log(`📩 Новое сообщение от ${userId}: "${text}"`);

    // --- ЗАПРОС К BOTPRESS ---
    try {
      // ВАЖНО: Убедитесь, что адрес Botpress правильный!
      // Если Botpress запущен локально, это не сработает. Если на облаке - укажите URL.
      // Ниже пример заглушки. Замените URL на ваш реальный endpoint Botpress.
      
      // const botpressResponse = await fetch('https://ваш-ботпресс-сервер.com/api/v1/bots/...', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ text: text, userId: String(userId) })
      // });
      // const botpressData = await botpressResponse.json();
      // const replyText = botpressData.responses[0].text; // или как у вас структура

      // --- ВРЕМЕННЫЙ ТЕСТОВЫЙ ОТВЕТ, ЧТОБЫ ПРОВЕРИТЬ РАБОТУ ВК ---
      // Уберите этот блок, когда наладите связь с Botpress
      let replyText = `Вы написали: "${text}" (Тестовый ответ, Botpress не подключен)`;
      if (text.toLowerCase() === 'да' || text.toLowerCase() === 'привет') {
        replyText = 'Привет! Я работаю. Начинаем анкетирование!';
      }

      // Отправляем ответ пользователю через ВК
      await sendVkMessage(userId, replyText);

    } catch (error) {
      // СЮДА ВЫВОДИТСЯ ОШИБКА, КОТОРУЮ ВЫ УВИДИТЕ В ЛОГАХ RENDER
      console.error('❌ КРИТИЧЕСКАЯ ОШИБКА В ОБРАБОТЧИКЕ:', error.message);
      
      // Можно отправить пользователю сообщение об ошибке, чтобы он знал
      await sendVkMessage(userId, 'Извините, произошла техническая ошибка при обработке запроса.');
    }
  }

  // 3. Обязательный ответ серверу ВК "OK" (иначе ВК будет долбить повторными запросами)
  res.send('ok');
});

// Проверка, что сервер доступен по корневому адресу в браузере
app.get('/webhook', (req, res) => {
  res.send('OK');
});

// ЗАПУСК СЕРВЕРА
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
