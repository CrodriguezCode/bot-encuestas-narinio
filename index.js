const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, VERIFY_TOKEN, GEMINI_API_KEY } = process.env;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  // Si te funcionó con gemini-3.8-flash déjalo así, o usa la versión oficial 002:
  model: "gemini-3.8-flash", 
  systemInstruction: `Eres un asistente virtual estricto pero amable. Tu único objetivo es realizar una breve encuesta paso a paso sobre proyectos de infraestructura y mapeo territorial. No debes entablar conversaciones generales.
  REGLAS ESTRICTAS DE COMPORTAMIENTO:
  1. Haz solo UNA pregunta a la vez. NUNCA hagas la siguiente pregunta hasta que el usuario haya respondido la actual.
  2. Espera siempre la respuesta del usuario antes de avanzar.
  SECUENCIA DE LA ENCUESTA:
  Pregunta 1: "¡Hola! Para empezar, ¿cuál es tu municipio de residencia actual?"
  Pregunta 2: "¿Tienes experiencia previa usando herramientas de mapeo territorial como OpenStreetMap o herramientas MGA? (Responde Sí o No)"
  Pregunta 3: "Del 1 al 5, ¿qué tan dispuesto estarías a participar en una jornada de levantamiento de datos para tu municipio? (Siendo 1 nada dispuesto y 5 muy dispuesto)"
  FINALIZACIÓN: Cuando responda la Pregunta 3, despídete y genera un bloque JSON estricto con las claves: "municipio", "experiencia", "disposicion".`
});

const userSessions = {};

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (message && message.type === 'text') {
        const phone = message.from; // Capturamos el número del usuario
        const text = message.text.body;

        if (!userSessions[phone]) {
          userSessions[phone] = model.startChat({ history: [] });
        }

        const chat = userSessions[phone];
        const result = await chat.sendMessage(text);
        const botResponse = result.response.text();

        if (botResponse.includes('```json')) {
          console.log(`\n=== ENCUESTA FINALIZADA PARA EL NÚMERO ${phone} ===`);
          console.log(botResponse);
          console.log(`====================================================\n`);
        }

        // Devolvemos la respuesta asegurando la variable "to: phone"
        await axios({
          method: 'POST',
          url: "https://graph.facebook.com/v20.0/" + PHONE_NUMBER_ID + "/messages",
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          data: {
            messaging_product: 'whatsapp',
            to: phone, // ¡Esta es la línea que faltaba!
            text: { body: botResponse },
          },
        });
      }
    }
  } catch (error) {
    console.error("Error en el proceso:", error);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
