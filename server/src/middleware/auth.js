/**
 * auth.js — Autenticación y verificación de webhooks
 *
 * Verifica que los webhooks que llegan al servidor realmente vienen de Telnyx
 * y no de un atacante. Telnyx firma cada webhook con su clave privada — nosotros
 * verificamos esa firma antes de procesar cualquier evento de llamada.
 *
 * También protege los endpoints internos del dashboard con API key.
 */

import crypto from 'crypto';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

// ─── Verificación de webhooks de Telnyx ──────────────────────────────────────

/**
 * Middleware de Express que verifica la firma de webhooks de Telnyx.
 * Si la firma no es válida, rechaza el request con 401.
 *
 * Telnyx envía dos headers:
 *   - telnyx-signature-ed25519: firma del payload en base64
 *   - telnyx-timestamp: timestamp Unix del momento del envío
 *
 * La verificación evita:
 *   1. Que atacantes envíen webhooks falsos para manipular llamadas
 *   2. Ataques de replay (webhooks viejos re-enviados)
 */
export function verifyTelnyxWebhook(req, res, next) {
  const signature = req.headers['telnyx-signature-ed25519'];
  const timestamp = req.headers['telnyx-timestamp'];

  if (!signature || !timestamp) {
    logger.warn('[Auth] Webhook de Telnyx sin headers de firma', {
      ip: req.ip,
      path: req.path,
    });
    return res.status(401).json({ error: 'Firma de webhook requerida' });
  }

  // Verificar que el webhook no sea demasiado viejo (máximo 5 minutos)
  const webhookAgeSeconds = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (webhookAgeSeconds > 300) {
    logger.warn('[Auth] Webhook de Telnyx demasiado viejo (posible replay attack)', {
      ageSeconds: webhookAgeSeconds,
      ip: req.ip,
    });
    return res.status(401).json({ error: 'Webhook expirado' });
  }

  // Construir el payload firmado: timestamp|body
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const signedPayload = `${timestamp}|${rawBody}`;

  // Verificar firma con la clave pública de Telnyx
  try {
    const publicKeyBuffer = Buffer.from(env.TELNYX_PUBLIC_KEY, 'base64');
    const signatureBuffer = Buffer.from(signature, 'base64');
    const payloadBuffer = Buffer.from(signedPayload);

    const isValid = crypto.verify(
      null, // Ed25519 no necesita algoritmo hash explícito
      payloadBuffer,
      { key: publicKeyBuffer, format: 'der', type: 'spki' },
      signatureBuffer
    );

    if (!isValid) {
      logger.warn('[Auth] Firma de webhook de Telnyx inválida', { ip: req.ip });
      return res.status(401).json({ error: 'Firma inválida' });
    }
  } catch (error) {
    logger.error('[Auth] Error al verificar firma de Telnyx', { error: error.message });
    return res.status(401).json({ error: 'Error de verificación' });
  }

  next();
}

// ─── Autenticación por API Key (para el dashboard) ───────────────────────────

/**
 * Middleware que verifica una API key en el header Authorization.
 * Usado para proteger los endpoints que el dashboard Next.js llama.
 *
 * Header esperado: Authorization: Bearer <API_KEY>
 */
export function requireApiKey(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'API key requerida' });
  }

  const providedKey = authHeader.slice(7); // Quitar "Bearer "

  // Comparación segura contra timing attacks
  const expectedKey = env.DASHBOARD_API_KEY || '';
  const isValid = safeCompare(providedKey, expectedKey);

  if (!isValid) {
    logger.warn('[Auth] API key inválida', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'API key inválida' });
  }

  next();
}

// ─── Comparación segura de strings ───────────────────────────────────────────

// Evita timing attacks — siempre tarda el mismo tiempo sin importar cuántos
// caracteres coincidan, así un atacante no puede adivinar la key bit a bit.
function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ─── Middleware para capturar raw body ────────────────────────────────────────
// Telnyx necesita el body sin parsear para verificar la firma.
// Debe usarse ANTES de express.json() en la ruta de webhooks.

export function captureRawBody(req, res, next) {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
}
