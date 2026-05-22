/**
 * index.js — Punto de entrada del servidor EZAI
 *
 * Arranca el servidor Express con WebSocket support.
 * El orden de inicialización es importante:
 *   1. Variables de entorno (env.js) — primero siempre
 *   2. Logger — para poder registrar lo que pasa
 *   3. Conexiones a servicios externos (Supabase, etc.)
 *   4. Middleware de seguridad
 *   5. Rutas HTTP
 *   6. WebSocket server
 *   7. Manejadores de error globales
 */

// env.js DEBE importarse primero — valida y carga todas las variables
import { env } from './config/env.js';

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import logger from './utils/logger.js';
import { errorHandler, notFound, setupProcessErrorHandlers } from './middleware/errorHandler.js';
import { verifyTelnyxWebhook, captureRawBody } from './middleware/auth.js';
import { HTTP } from './config/constants.js';

// ─── Configuración de la app Express ─────────────────────────────────────────

const app = express();

// Seguridad: headers HTTP seguros (HSTS, XSS protection, etc.)
app.use(helmet());

// CORS: solo permite requests desde el dashboard
app.use(cors({
  origin: env.IS_PRODUCTION
    ? ['https://dashboard.ezai.com']     // En producción: solo el dominio real
    : ['http://localhost:3001', 'http://localhost:3000'], // En desarrollo: local
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting: máximo N requests por minuto por IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: HTTP.RATE_LIMIT_RPM,
  message: { error: { message: 'Demasiadas solicitudes, intente en un minuto' } },
  standardHeaders: true,
  legacyHeaders: false,
}));

// Parser de JSON para la mayoría de rutas
app.use(express.json());

// ─── Ruta de salud (health check) ────────────────────────────────────────────
// Usada por Hostinger/monitoreo para verificar que el servidor está vivo

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// ─── Webhook de Telnyx ────────────────────────────────────────────────────────
// Telnyx llama a este endpoint para cada evento de llamada
// (llamada entrante, colgada, etc.)

app.post(
  '/webhooks/telnyx',
  captureRawBody,           // Captura body crudo ANTES de parsear (para verificar firma)
  express.json(),           // Parsea el JSON
  verifyTelnyxWebhook,      // Verifica que viene de Telnyx
  async (req, res) => {
    const { event_type, payload } = req.body?.data || {};

    logger.info('[Webhook] Evento de Telnyx recibido', { event_type });

    // Responder inmediatamente a Telnyx (deben recibir 200 en < 5 segundos)
    res.status(200).json({ received: true });

    // Procesar el evento de forma asíncrona (no bloqueamos la respuesta)
    try {
      await handleTelnyxEvent(event_type, payload);
    } catch (error) {
      logger.error('[Webhook] Error al procesar evento de Telnyx', {
        event_type,
        error: error.message,
        stack: error.stack,
      });
    }
  }
);

// ─── Procesador de eventos de Telnyx ─────────────────────────────────────────

async function handleTelnyxEvent(eventType, payload) {
  // NOTA: La importación de callManager se hará aquí cuando esté implementado (Fase 3D)
  // Por ahora solo loggeamos los eventos para verificar que el webhook funciona

  switch (eventType) {
    case 'call.initiated':
      logger.info('[Call] Llamada entrante', {
        callControlId: payload?.call_control_id,
        from: payload?.from,
        to: payload?.to,
      });
      // TODO (Fase 3D): callManager.handleIncomingCall(payload)
      break;

    case 'call.answered':
      logger.info('[Call] Llamada contestada', {
        callControlId: payload?.call_control_id,
      });
      // TODO (Fase 3D): callManager.handleCallAnswered(payload)
      break;

    case 'call.hangup':
      logger.info('[Call] Llamada terminada', {
        callControlId: payload?.call_control_id,
        hangupCause: payload?.hangup_cause,
        durationSeconds: payload?.call_duration_secs,
      });
      // TODO (Fase 3D): callManager.handleCallHangup(payload)
      break;

    case 'call.recording.saved':
      logger.info('[Call] Grabación guardada', {
        callControlId: payload?.call_control_id,
        recordingUrl: payload?.recording_urls?.mp3,
      });
      // TODO (Fase 3D): callManager.handleRecordingSaved(payload)
      break;

    default:
      logger.debug('[Webhook] Evento de Telnyx no manejado', { eventType });
  }
}

// ─── Rutas del API (para el dashboard) ───────────────────────────────────────
// TODO (Fase 6): Agregar rutas para llamadas, citas y configuración del agente

// ─── Manejo de errores ────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ─── WebSocket Server ─────────────────────────────────────────────────────────
// Telnyx envía el audio de las llamadas por WebSocket

const httpServer = createServer(app);

const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws/call', // Telnyx se conectará a: wss://servidor.com/ws/call
});

wss.on('connection', (ws, req) => {
  logger.info('[WebSocket] Nueva conexión de Telnyx', {
    ip: req.socket.remoteAddress,
  });

  ws.on('message', (data) => {
    // TODO (Fase 4): voicePipeline.handleAudioChunk(data, ws)
    logger.debug('[WebSocket] Audio recibido', { bytes: data.length });
  });

  ws.on('close', (code, reason) => {
    logger.info('[WebSocket] Conexión cerrada', {
      code,
      reason: reason?.toString(),
    });
    // TODO (Fase 3D): callManager.handleWebSocketClose(ws)
  });

  ws.on('error', (error) => {
    logger.error('[WebSocket] Error en conexión', { error: error.message });
  });
});

// ─── Arrancar servidor ────────────────────────────────────────────────────────

setupProcessErrorHandlers();

httpServer.listen(env.PORT, () => {
  logger.info(`✓ Servidor EZAI corriendo`, {
    port: env.PORT,
    environment: env.NODE_ENV,
    webhookUrl: `${env.SERVER_URL}/webhooks/telnyx`,
    wsUrl: `${env.SERVER_URL.replace('https', 'wss')}/ws/call`,
  });
});

export default app;
