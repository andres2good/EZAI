/**
 * telnyx.js — Cliente de la API de Telnyx
 *
 * Maneja todas las interacciones con Telnyx:
 * - Responder llamadas entrantes
 * - Reproducir audio al paciente
 * - Transferir llamadas
 * - Colgar
 *
 * Telnyx funciona con "Call Control" — en lugar de controlar el audio
 * directamente, le mandamos comandos a la API y Telnyx los ejecuta.
 */

import { env } from '../config/env.js';
import { callLogger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

// ─── URL base de Telnyx Call Control ─────────────────────────────────────────

const TELNYX_API_BASE = 'https://api.telnyx.com/v2/calls';

// ─── Helper para llamadas a la API de Telnyx ──────────────────────────────────

async function telnyxRequest(callControlId, action, payload = {}) {
  const url = `${TELNYX_API_BASE}/${callControlId}/actions/${action}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw Object.assign(
      new Error(`Telnyx ${action} falló (${response.status}): ${error}`),
      { status: response.status }
    );
  }

  return response.json();
}

// ─── Acciones de Call Control ─────────────────────────────────────────────────

/**
 * Responde una llamada entrante.
 * Debe llamarse inmediatamente al recibir el evento call.initiated.
 */
export async function answerCall({ callControlId, callId, businessId }) {
  const log = callLogger(callId, businessId);
  log.info('[Telnyx] Respondiendo llamada');

  return await withRetry(
    () => telnyxRequest(callControlId, 'answer', {}),
    { name: 'Telnyx answer' }
  );
}

/**
 * Reproduce audio hacia el paciente.
 * El audio debe estar en formato mulaw 8kHz (el mismo que genera Cartesia).
 *
 * @param {Buffer} audioBuffer - Audio en formato mulaw
 * @param {string} callControlId - ID de control de la llamada
 */
export async function playAudio({ callControlId, audioBuffer, callId, businessId }) {
  const log = callLogger(callId, businessId);

  // Convertir Buffer a base64 para enviarlo a Telnyx
  const audioBase64 = audioBuffer.toString('base64');

  log.debug('[Telnyx] Reproduciendo audio', { bytes: audioBuffer.length });

  return await withRetry(
    () => telnyxRequest(callControlId, 'playback_start', {
      audio_url: `data:audio/basic;base64,${audioBase64}`,
      overlay: false,       // No mezclar con audio existente — reemplazar
      loop: false,
    }),
    { name: 'Telnyx playback' }
  );
}

/**
 * Inicia la grabación de la llamada.
 * Se activa al inicio de la llamada, después del saludo.
 */
export async function startRecording({ callControlId, callId, businessId }) {
  const log = callLogger(callId, businessId);
  log.info('[Telnyx] Iniciando grabación');

  return await withRetry(
    () => telnyxRequest(callControlId, 'record_start', {
      format: 'mp3',
      channels: 'dual',       // Canales separados: agente izquierda, paciente derecha
      play_beep: false,        // Sin beep al iniciar grabación
    }),
    { name: 'Telnyx record_start' }
  );
}

/**
 * Detiene la grabación.
 * Al detenerse, Telnyx envía un webhook call.recording.saved con la URL.
 */
export async function stopRecording({ callControlId, callId, businessId }) {
  const log = callLogger(callId, businessId);
  log.info('[Telnyx] Deteniendo grabación');

  return await withRetry(
    () => telnyxRequest(callControlId, 'record_stop', {}),
    { name: 'Telnyx record_stop' }
  );
}

/**
 * Transfiere la llamada a otro número de teléfono.
 * Se usa cuando el paciente necesita hablar con un humano.
 */
export async function transferCall({ callControlId, toPhone, callId, businessId }) {
  const log = callLogger(callId, businessId);
  log.info('[Telnyx] Transfiriendo llamada', { toPhone });

  return await withRetry(
    () => telnyxRequest(callControlId, 'transfer', {
      to: toPhone,
      from: env.CONSULTORIO_PHONE_NUMBER,
    }),
    { name: 'Telnyx transfer' }
  );
}

/**
 * Cuelga la llamada.
 */
export async function hangupCall({ callControlId, callId, businessId }) {
  const log = callLogger(callId, businessId);
  log.info('[Telnyx] Colgando llamada');

  return await withRetry(
    () => telnyxRequest(callControlId, 'hangup', {}),
    { name: 'Telnyx hangup' }
  );
}

/**
 * Detiene cualquier audio que se esté reproduciendo.
 * Se usa cuando el paciente interrumpe al agente (barge-in).
 */
export async function stopPlayback({ callControlId, callId, businessId }) {
  const log = callLogger(callId, businessId);
  log.debug('[Telnyx] Deteniendo reproducción (barge-in)');

  return telnyxRequest(callControlId, 'playback_stop', {}).catch(err => {
    // Si no hay audio reproduciéndose, Telnyx devuelve error — lo ignoramos
    log.debug('[Telnyx] No había audio reproduciéndose', { error: err.message });
  });
}
