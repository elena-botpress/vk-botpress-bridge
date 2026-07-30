const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// Логирование всех входящих запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Body:', JSON.stringify(req.body));
  next();
});

const VK_TOKEN = process.env.VK_TOKEN;
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;

app.post('/webhook', async (req, res) => {
  console.log('=== WEBHOOK RECEIVED ===');
  const body = req.body;
  
  if (body.type === 'confirmation') {
    const confirmationCode = process.env.VK_CONFIRMATION_CODE;
    console.log('Confirmation request! Returning:', confirmationCode);
    res.set('Content-Type', 'text/plain');
    res.status(200).send(confirmationCode);
    return;
  }
  
  if (body.type === 'message_new') {
    console.log('New message received');
    const message = body.object.message;
    const userId = message.from_id || message.user_id;
    const text = message.text;
    
    try {
      const response = await fetch(`https://api.botpress.cloud/v1/bots/${BOTPRESS_BOT_ID}/conversations/default/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', text: text, userId: userId.toString() })
      });
      
      const botResponse = await response.json();
      console.log('Botpress response:', botResponse);
      
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

app.get('/webhook', (req, res) => {
  console.log('GET request to /webhook - server is alive!');
  res.send('Server is running! Use POST for webhook.');
});

async function sendVKMessage(userId, text) {
  console.log(`Sending message to user ${userId}: ${text}`);
  await fetch(`https://api.vk.com/method/messages.send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `access_token=${VK_TOKEN}&user_id=${userId}&message=${encodeURIComponent(text)}&random_id=${Date.now()}&v=5.199`
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Bot ID: ${BOTPRESS_BOT_ID}`);
});
