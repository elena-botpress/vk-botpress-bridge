const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const VK_TOKEN = process.env.VK_TOKEN;
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY;

app.post('/webhook', async (req, res) => {
  const body = req.body;
  
  if (body.type === 'confirmation') {
    res.send(process.env.VK_CONFIRMATION_CODE || 'f2bc9be0');
    return;
  }
  
  if (body.type === 'message_new') {
    const message = body.object.message;
    const userId = message.from_id;
    const text = message.text;
    
    try {
      const response = await fetch(`https://api.botpress.cloud/v1/bots/${BOTPRESS_BOT_ID}/conversations/default/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BOTPRESS_API_KEY}`
        },
        body: JSON.stringify({ type: 'text', text: text })
      });
      
      const botResponse = await response.json();
      
      if (botResponse && botResponse.responses && botResponse.responses.length > 0) {
        const reply = botResponse.responses[0].text;
        await sendVKMessage(userId, reply);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }
  
  res.send('ok');
});

async function sendVKMessage(userId, text) {
  await fetch(`https://api.vk.com/method/messages.send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `access_token=${VK_TOKEN}&user_id=${userId}&message=${encodeURIComponent(text)}&v=5.199`
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
