const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

// Variables de entorno (Las configuraremos en Render)
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, VERIFY_TOKEN, GEMINI_API_KEY } = process.env;

// Configuración de Gemini 1.5 Flash
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-002",
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

// Memoria temporal para recordar en qué pregunta va cada número de teléfono
const userSessions = {};

// 1. Endpoint para verificar el Webhook de Meta
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

// 2. Endpoint para recibir mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Siempre responder 200 OK rápido a Meta

  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (message && message.type === 'text') {
        const phone = message.from;
        const text = message.text.body;

        // Crear una nueva sesión de chat para números nuevos
        if (!userSessions[phone]) {
          userSessions[phone] = model.startChat({ history: [] });
        }

        // Enviar el mensaje del usuario a Gemini
        const chat = userSessions[phone];
        const result = await chat.sendMessage(text);
        const botResponse = result.response.text();

        // Verificar si la encuesta terminó (Gemini envió el JSON)
        if (botResponse.includes('```json')) {
          console.log(`\n=== ENCUESTA FINALIZADA PARA EL NÚMERO ${phone} ===`);
          console.log(botResponse);
          console.log(`====================================================\n`);
          // Aquí añadiremos la conexión a Google Sheets más adelante
        }

        // Devolver la respuesta de Gemini al usuario por WhatsApp
        await axios({
          method: 'POST',
          url: `[https://graph.facebook.com/v20.0/$](https://graph.facebook.com/v20.0/$){PHONE_NUMBER_ID}/messages`,
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          data: {
            messaging_product: 'whatsapp',
            to: phone,
            text: { body: botResponse },
          },
        });
      }
    }
  } catch (error) {
    console.error("Error en el proceso:", error);
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
