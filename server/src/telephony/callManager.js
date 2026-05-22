/**
 * callManager.js — Gestión del estado de llamadas activas
 *
 * Mantiene en memoria el estado de cada llamada que está ocurriendo
 * en este momento. Cuando entra una llamada, crea su estado. Cuando
 * termina, limpia todo.
 *
 * También coordina el inicio del pipeline de voz (voicePipeline.js)
 * cuando una llamada es respondida.
 */

import { v4 as uuidv4 } from 'uuid';
import { answerCall, startRecording, hangupCall } from './telnyx.js';
import { generateGreeting } from '../llm/claude.js';
import { textToSpeech } from '../tts/cartesia.js';
import { playAudio } from './telnyx.js';
import { saveCall, updateCall, getBusinessByPhone } from '../storage/supabase.js';
import { CALLS } from '../config/constants.js';
import logger, { callLogger } from '../utils/logger.js';

// ─── Estado de llamadas activas ───────────────────────────────────────────────
// Map: callControlId → estado de la llamada
// Se guarda en memoria — si el servidor se reinicia, las llamadas activas se pierden
// (en producción se podría usar Redis, pero para esta escala es suficiente)

const activeCalls = new Map();

// ─── Manejar llamada entrante ─────────────────────────────────────────────────

/**
 * Se ejecuta cuando Telnyx notifica una llamada entrante (call.initiated).
 * Responde la llamada y prepara el estado inicial.
 */
export async function handleIncomingCall(payload) {
  const { call_control_id, from, to, call_session_id } = payload;

  // Generar ID único interno para esta llamada
  const callId = uuidv4();

  // Determinar qué negocio es por el número al que llamaron
  const business = await getBusinessByPhone(to).catch(() => null);
  const businessId = business?.id || 'unknown';
  const businessConfig = business?.config || {};

  const log = callLogger(callId, businessId);
  log.info('[CallManager] Llamada entrante', { from, to, callControlId: call_control_id });

  // Responder la llamada
  await answerCall({ callControlId: call_control_id, callId, businessId });

  // Guardar estado inicial en memoria
  const callState = {
    callId,
    callControlId: call_control_id,
    businessId,
    businessConfig,
    fromPhone: from,
    toPhone: to,
    sessionId: call_session_id,
    status: CALLS.STATUS.ANSWERED,
    startTime: Date.now(),
    language: 'es',           // Por defecto español
    messages: [],             // Historial de conversación para Claude
    transcription: [],        // Transcripción completa de la llamada
    appointmentCreated: false,
    pipeline: null,           // Se asigna en handleCallAnswered
  };

  activeCalls.set(call_control_id, callState);

  // Registrar la llamada en Supabase
  await saveCall({
    id: callId,
    businessId,
    fromPhone: from,
    toPhone: to,
    status: CALLS.STATUS.ANSWERED,
    startTime: new Date().toISOString(),
  }).catch(err => log.error('[CallManager] Error guardando llamada en DB', { error: err.message }));
}

// ─── Llamada contestada ───────────────────────────────────────────────────────

/**
 * Se ejecuta cuando la llamada está completamente establecida (call.answered).
 * Aquí iniciamos el saludo y el pipeline de voz.
 */
export async function handleCallAnswered(payload) {
  const { call_control_id } = payload;
  const callState = activeCalls.get(call_control_id);
  if (!callState) return;

  const { callId, businessId, businessConfig, language } = callState;
  const log = callLogger(callId, businessId);

  log.info('[CallManager] Llamada establecida — iniciando pipeline');
  callState.status = CALLS.STATUS.IN_PROGRESS;

  try {
    // Iniciar grabación
    await startRecording({ callControlId: call_control_id, callId, businessId });

    // Generar y reproducir saludo inicial
    const greeting = await generateGreeting({ businessConfig, language });
    const greetingAudio = await textToSpeech({ text: greeting, language, callId, businessId });

    if (greetingAudio) {
      await playAudio({ callControlId: call_control_id, audioBuffer: greetingAudio, callId, businessId });
    }

    // Agregar saludo al historial de conversación
    callState.messages.push({ role: 'assistant', content: greeting });
    callState.transcription.push({ role: 'assistant', text: greeting, timestamp: Date.now() });

    // Iniciar el pipeline de voz (STT → LLM → TTS en loop)
    // Se importa aquí para evitar dependencia circular
    const { startVoicePipeline } = await import('../pipeline/voicePipeline.js');
    callState.pipeline = startVoicePipeline({ callState });

  } catch (error) {
    log.error('[CallManager] Error al iniciar pipeline', { error: error.message });
    await hangupCall({ callControlId: call_control_id, callId, businessId });
  }
}

// ─── Llamada terminada ────────────────────────────────────────────────────────

/**
 * Se ejecuta cuando la llamada cuelga (call.hangup).
 * Limpia el estado y guarda el registro completo en Supabase.
 */
export async function handleCallHangup(payload) {
  const { call_control_id, call_duration_secs } = payload;
  const callState = activeCalls.get(call_control_id);
  if (!callState) return;

  const { callId, businessId, messages, transcription, appointmentCreated, startTime, language } = callState;
  const log = callLogger(callId, businessId);

  log.info('[CallManager] Llamada terminada', { durationSeconds: call_duration_secs });

  // Detener el pipeline de voz
  callState.pipeline?.stop?.();

  // Limpiar de memoria
  activeCalls.delete(call_control_id);

  // Guardar registro completo en Supabase (asíncrono, no bloquea)
  updateCall({
    id: callId,
    status: CALLS.STATUS.COMPLETED,
    duration: call_duration_secs,
    transcription: JSON.stringify(transcription),
    messagesCount: messages.length,
    appointmentCreated,
    language,
    endTime: new Date().toISOString(),
  }).catch(err =>
    log.error('[CallManager] Error actualizando llamada en DB', { error: err.message })
  );
}

// ─── Grabación guardada ───────────────────────────────────────────────────────

/**
 * Se ejecuta cuando Telnyx terminó de guardar la grabación (call.recording.saved).
 * Descargamos la grabación y la subimos a Cloudflare R2.
 */
export async function handleRecordingSaved(payload) {
  const { call_control_id, recording_urls } = payload;
  const recordingUrl = recording_urls?.mp3;
  if (!recordingUrl) return;

  const callState = activeCalls.get(call_control_id);
  const callId = callState?.callId || call_control_id;
  const businessId = callState?.businessId || 'unknown';

  const log = callLogger(callId, businessId);
  log.info('[CallManager] Grabación lista para subir a R2', { url: recordingUrl });

  try {
    const { uploadRecording } = await import('../storage/cloudflareR2.js');
    const r2Url = await uploadRecording({ callId, businessId, sourceUrl: recordingUrl });

    await updateCall({ id: callId, recordingUrl: r2Url }).catch(() => {});
    log.info('[CallManager] Grabación subida a R2', { r2Url });
  } catch (error) {
    log.error('[CallManager] Error subiendo grabación a R2', { error: error.message });
  }
}

// ─── Manejo de WebSocket cerrado ──────────────────────────────────────────────

export function handleWebSocketClose(ws) {
  // Buscar la llamada asociada a este WebSocket
  for (const [callControlId, callState] of activeCalls.entries()) {
    if (callState.ws === ws) {
      const log = callLogger(callState.callId, callState.businessId);
      log.info('[CallManager] WebSocket cerrado — limpiando estado');
      callState.pipeline?.stop?.();
      activeCalls.delete(callControlId);
      break;
    }
  }
}

// ─── Helpers públicos ─────────────────────────────────────────────────────────

export function getCallState(callControlId) {
  return activeCalls.get(callControlId);
}

export function getActiveCallsCount() {
  return activeCalls.size;
}
