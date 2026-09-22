const axios = require('axios');
require('dotenv').config({ path: 'c:/MH PROJECTS/reportss-main/backend/.env' });

const key = process.env.GEMINI_API_KEY || '';
console.log('Testing with key:', key.slice(0, 10) + '...' + key.slice(-6));

async function test() {
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'];
  for (const m of models) {
    try {
      console.log(`Trying ${m}...`);
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`,
        {
          contents: [{ role: 'user', parts: [{ text: 'Hello, what are you?' }] }]
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
      console.log(`SUCCESS with ${m}:`, res.data.candidates?.[0]?.content?.parts?.[0]?.text);
      return;
    } catch (e) {
      console.error(`Error with ${m}:`, e.response?.status, e.response?.data || e.message);
    }
  }
}

test();
