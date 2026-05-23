/**
 * index.js — Punto de entrada del servidor EZAI
 *
 * Arranca el servidor Express con WebSocket support.
 * El orden de inicialización es importante:
 *   1. Variables de entorno (env.js) — primero siempre
 *   2. Logger — para poder registrar lo que pasa
 *   3. Middleware de seguridad
 *   4. Rutas HTTP (webhooks de Telnyx, API del dashboard)
 *   5. WebSocket server (audio en tiempo real)
 *   6. Manejadores de error globales
 */

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
import {
  handleIncomingCall,
  handleCallAnswered,
  handleCallHangup,
  handleRecordingSaved,
  handleWebSocketClose,
  getCallState,
  getActiveCallsCount,
} from './telephony/callManager.js';
import { HTTP } from './config/constants.js';

// ─── Configuración de la app Express ─────────────────────────────────────────

const app = express();

app.use(helmet());

app.use(cors({
  origin: env.IS_PRODUCTION
    ? ['https://dashboard.ezai.com']
    : ['http://localhost:3001', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: HTTP.RATE_LIMIT_RPM,
  message: { error: { message: 'Demasiadas solicitudes, intente en un minuto' } },
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    activeCalls: getActiveCallsCount(),
  });
});

// ─── Webhook de Telnyx ────────────────────────────────────────────────────────

app.post(
  '/webhooks/telnyx',
  captureRawBody,
  express.json(),
  verifyTelnyxWebhook,
  async (req, res) => {
    const { event_type, payload } = req.body?.data || {};

    logger.info('[Webhook] Evento de Telnyx', { event_type });

    // Responder inmediatamente — Telnyx requiere respuesta en < 5 segundos
    res.status(200).json({ received: true });

    // Procesar de forma asíncrona
    handleTelnyxEvent(event_type, payload).catch(error => {
      logger.error('[Webhook] Error procesando evento', {
        event_type,
        error: error.message,
        stack: error.stack,
      });
    });
  }
);

// ─── Procesador de eventos de Telnyx ─────────────────────────────────────────

async function handleTelnyxEvent(eventType, payload) {
  switch (eventType) {
    case 'call.initiated':
      await handleIncomingCall(payload);
      break;

    case 'call.answered':
      await handleCallAnswered(payload);
      break;

    case 'call.hangup':
      await handleCallHangup(payload);
      break;

    case 'call.recording.saved':
      await handleRecordingSaved(payload);
      break;

    case 'call.playback.ended':
      // El audio terminó de reproducirse — no se necesita acción aquí
      // El pipeline maneja el estado de reproducción internamente
      break;

    default:
      logger.debug('[Webhook] Evento no manejado', { eventType });
  }
}

// ─── Errores y 404 ────────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ─── WebSocket Server — Audio en tiempo real ──────────────────────────────────

const httpServer = createServer(app);

const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws/call',
});

wss.on('connection', (ws, req) => {
  // Telnyx envía el call_control_id como query param para identificar la llamada
  const url = new URL(req.url, `http://${req.headers.host}`);
  const callControlId = url.searchParams.get('call_control_id');

  logger.info('[WebSocket] Nueva conexión', {
    callControlId,
    ip: req.socket.remoteAddress,
  });

  // Asociar este WebSocket al estado de la llamada
  const callState = callControlId ? getCallState(callControlId) : null;
  if (callState) {
    callState.ws = ws;
  }

  ws.on('message', (data) => {
    // Reenviar el audio al pipeline de voz para procesarlo
    if (callState?.pipeline) {
      callState.pipeline.handleAudioChunk(data);
    } else {
      logger.debug('[WebSocket] Audio recibido pero sin pipeline activo', {
        callControlId,
        bytes: data.length,
      });
    }
  });

  ws.on('close', (code, reason) => {
    logger.info('[WebSocket] Conexión cerrada', {
      callControlId,
      code,
      reason: reason?.toString(),
    });
    handleWebSocketClose(ws);
  });

  ws.on('error', (error) => {
    logger.error('[WebSocket] Error', { callControlId, error: error.message });
  });
});

// ─── Arrancar servidor ────────────────────────────────────────────────────────

setupProcessErrorHandlers();

httpServer.listen(env.PORT, () => {
  logger.info('✓ Servidor EZAI corriendo', {
    port: env.PORT,
    environment: env.NODE_ENV,
    webhookUrl: `${env.SERVER_URL}/webhooks/telnyx`,
    wsUrl: `${env.SERVER_URL.replace('https', 'wss')}/ws/call`,
    healthUrl: `${env.SERVER_URL}/health`,
  });
});

export default app;
