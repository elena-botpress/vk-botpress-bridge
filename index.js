const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const VK_TOKEN = process.env.VK_TOKEN;
const BOTPRESS_BOT_ID = process.env.BOTPRESS_BOT_ID;
const CONFIRMATION_CODE = process.env.VK_CONFIRMATION_CODE;

app.post('/webhook', (req, res) => {
  const body = req.body;
  
  console.log('Received:', JSON.stringify(body));
  
  if (body.type === 'confirmation') {
    console.log('Sending confirmation code:', CONFIRMATION_CODE);
    // ВАЖНО: явно указываем Content-Type и статус
    res.set('Content-Type', 'text/plain');
    res.status(200).send(CONFIRMATION_CODE);
    return;
  }
  
  res.send('ok');
});

app.get('/webhook', (req, res) => {
  res.send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
