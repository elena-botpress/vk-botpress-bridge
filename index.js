const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const VK_TOKEN = process.env.VK_TOKEN;
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;

// URL для отправки сообщений в Botpress Cloud
const BOTPRESS_API_URL = `https://api.botpress.cloud/v1/bots/${BOTPRESS_BOT_ID}`;

app.post('/webhook', async (req, res) => {
  const body = req.body;
  
  // Подтверждение сервера для VK
  if (body.type === 'confirmation') {
    const confirmationCode = process.env.VK_CONFIRMATION_CODE;
    res.send(confirmationCode);
    return;
  }
  
  // Обработка новых сообщений
  if (body.type === 'message_new') {
    const message = body.object.message;
    const userId = message.from_id || message.user_id;
    const text = message.text;
    
    try {
      // Отправляем сообщение в Botpress
      const response = await fetch(`${BOTPRESS_API_URL}/conversations/default/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'text',
          text: text,
          userId: userId.toString()
        })
      });
      
      const botResponse = await response.json();
      
      // Получаем ответ от бота
      if (botResponse && botResponse.responses && botResponse.responses.length > 0) {
        const reply = botResponse.responses[0].text || botResponse.responses[0].payload;
        await sendVKMessage(userId, reply);
      }
    } catch (error) {
      console.error('Error communicating with Botpress:', error);
    }
  }
  
  res.send('ok');
});

// Функция отправки сообщения в VK
async function sendVKMessage(userId, text) {
  try {
    await fetch(`https://api.vk.com/method/messages.send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `access_token=${VK_TOKEN}&user_id=${userId}&message=${encodeURIComponent(text)}&random_id=${Date.now()}&v=5.199`
    });
  } catch (error) {
    console.error('Error sending VK message:', error);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Bot ID: ${BOTPRESS_BOT_ID}`);
});
