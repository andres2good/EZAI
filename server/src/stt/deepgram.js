/**
 * deepgram.js — Integración con Deepgram Nova-3 (Speech-to-Text)
 *
 * Convierte el audio del paciente a texto en tiempo real usando WebSocket.
 * El audio llega en chunks (pedazos) de Telnyx y se envía directamente
 * a Deepgram, que devuelve transcripciones parciales y finales.
 *
 * Flujo:
 *   Audio (Telnyx WebSocket) → este módulo → texto → claude.js
 */

import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { env } from '../config/env.js';
import { LANGUAGES } from '../config/constants.js';
import { cleanTranscription, hasRealContent } from '../utils/validators.js';
import { callLogger } from '../utils/logger.js';

// ─── Cliente de Deepgram ──────────────────────────────────────────────────────

const deepgramClient = createClient(env.DEEPGRAM_API_KEY);

// ─── Crear sesión de transcripción en tiempo real ─────────────────────────────

/**
 * Abre una conexión WebSocket con Deepgram para transcribir una llamada.
 *
 * @param {Object} options
 * @param {string} options.callId - ID único de la llamada
 * @param {string} options.businessId - ID del negocio
 * @param {string} options.language - Idioma detectado ('es' | 'en')
 * @param {Function} options.onTranscript - Callback cuando hay texto final
 * @param {Function} options.onError - Callback cuando hay un error
 * @returns {Object} - Objeto con métodos send() y close()
 */
export function createDeepgramSession({ callId, businessId, language = LANGUAGES.DEFAULT, onTranscript, onError }) {
  const log = callLogger(callId, businessId);

  log.info('[Deepgram] Abriendo sesión de transcripción', { language });

  // Configuración de la conexión en tiempo real
  const connection = deepgramClient.listen.live({
    model: env.DEEPGRAM_MODEL,          // nova-3
    language: language,                  // 'es' o 'en'
    encoding: 'mulaw',                   // Formato de audio de Telnyx
    sample_rate: 8000,                   // Frecuencia de muestreo de telefonía
    channels: 1,                         // Mono (una sola voz)
    punctuate: true,                     // Agregar puntuación automáticamente
    interim_results: true,               // Resultados parciales mientras habla
    endpointing: 300,                    // Detectar fin de enunciado tras 300ms de silencio
    utterance_end_ms: 1000,              // Confirmar fin de enunciado tras 1000ms
    smart_format: true,                  // Formatear números, fechas, etc.
    no_delay: true,                      // Priorizar velocidad sobre precisión
  });

  // ─── Eventos de la conexión ───────────────────────────────────────────────

  connection.on(LiveTranscriptionEvents.Open, () => {
    log.info('[Deepgram] Conexión abierta');
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript || '';
    const isFinal = data.is_final;
    const speechFinal = data.speech_final; // El paciente terminó de hablar

    // Solo procesamos cuando el paciente terminó de hablar y hay texto real
    if (speechFinal && hasRealContent(transcript)) {
      const cleanText = cleanTranscription(transcript);
      log.debug('[Deepgram] Transcripción final', { text: cleanText });
      onTranscript(cleanText);
    }
  });

  connection.on(LiveTranscriptionEvents.Error, (error) => {
    log.error('[Deepgram] Error en transcripción', { error: error.message });
    onError(error);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    log.info('[Deepgram] Conexión cerrada');
  });

  // ─── Interfaz pública ─────────────────────────────────────────────────────

  return {
    // Enviar chunk de audio a Deepgram
    sendAudio(audioChunk) {
      if (connection.getReadyState() === 1) { // 1 = OPEN
        connection.send(audioChunk);
      }
    },

    // Cerrar la sesión limpiamente al terminar la llamada
    close() {
      log.info('[Deepgram] Cerrando sesión');
      connection.finish();
    },

    // Verificar si la conexión está activa
    isConnected() {
      return connection.getReadyState() === 1;
    },
  };
}
