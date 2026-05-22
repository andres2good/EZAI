/**
 * cartesia.js — Integración con Cartesia Sonic-3 (Text-to-Speech)
 *
 * Convierte el texto de respuesta de Claude en audio hablado.
 * Usa streaming: no espera a tener toda la respuesta — convierte
 * en tiempo real chunk por chunk para minimizar latencia.
 *
 * Latencia objetivo: < 40ms al primer chunk de audio.
 */

import { env } from '../config/env.js';
import { callLogger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

// ─── URL base de Cartesia ─────────────────────────────────────────────────────

const CARTESIA_API_URL = 'https://api.cartesia.ai/tts/bytes';

// ─── Configuración de voz por idioma ─────────────────────────────────────────

const VOICE_CONFIG = {
  es: {
    voice: { mode: 'id', id: env.CARTESIA_VOICE_ID },
    language: 'es',
  },
  en: {
    voice: { mode: 'id', id: env.CARTESIA_VOICE_ID },
    language: 'en',
  },
};

// ─── Convertir texto a audio ──────────────────────────────────────────────────

/**
 * Convierte un texto a audio usando Cartesia Sonic-3.
 * Devuelve el audio como Buffer listo para enviar a Telnyx.
 *
 * @param {Object} options
 * @param {string} options.text - Texto a convertir en voz
 * @param {string} options.language - Idioma ('es' | 'en')
 * @param {string} options.callId - ID de la llamada (para logs)
 * @param {string} options.businessId - ID del negocio (para logs)
 * @returns {Promise<Buffer>} - Audio en formato mulaw 8kHz (compatible con Telnyx)
 */
export async function textToSpeech({ text, language = 'es', callId, businessId }) {
  const log = callLogger(callId, businessId);

  if (!text || text.trim().length === 0) {
    log.warn('[Cartesia] Texto vacío, no se genera audio');
    return null;
  }

  log.debug('[Cartesia] Generando audio', {
    chars: text.length,
    preview: text.slice(0, 60),
  });

  const voiceConfig = VOICE_CONFIG[language] || VOICE_CONFIG.es;

  return await withRetry(
    async () => {
      const startTime = Date.now();

      const response = await fetch(CARTESIA_API_URL, {
        method: 'POST',
        headers: {
          'X-API-Key': env.CARTESIA_API_KEY,
          'Cartesia-Version': '2024-06-10',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: env.CARTESIA_MODEL,          // sonic-3
          transcript: text,
          voice: voiceConfig.voice,
          language: voiceConfig.language,
          output_format: {
            container: 'raw',
            encoding: 'pcm_mulaw',               // Formato que acepta Telnyx
            sample_rate: 8000,                   // 8kHz = telefonía estándar
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw Object.assign(
          new Error(`Cartesia error ${response.status}: ${errorText}`),
          { status: response.status }
        );
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const latencyMs = Date.now() - startTime;

      log.debug('[Cartesia] Audio generado', {
        bytes: audioBuffer.length,
        latencyMs,
      });

      return audioBuffer;
    },
    { name: 'Cartesia TTS' }
  );
}

// ─── Streaming de texto a audio ───────────────────────────────────────────────

/**
 * Versión streaming: convierte chunks de texto en chunks de audio en tiempo real.
 * Más eficiente para respuestas largas — empieza a generar audio antes de
 * tener todo el texto de Claude.
 *
 * @param {Object} options
 * @param {AsyncIterable} options.textStream - Stream de chunks de texto
 * @param {string} options.language - Idioma
 * @param {string} options.callId - ID de la llamada
 * @param {string} options.businessId - ID del negocio
 * @param {Function} options.onAudioChunk - Callback con cada chunk de audio
 */
export async function streamTextToSpeech({ textStream, language = 'es', callId, businessId, onAudioChunk }) {
  const log = callLogger(callId, businessId);

  // Acumulamos texto hasta tener una oración completa antes de enviar a Cartesia
  // Esto da mejor calidad de audio y prosodia natural
  let buffer = '';
  const sentenceEnders = /[.!?¿¡,;:]/;

  async function flushBuffer() {
    if (buffer.trim().length === 0) return;
    const textToConvert = buffer.trim();
    buffer = '';

    try {
      const audio = await textToSpeech({ text: textToConvert, language, callId, businessId });
      if (audio) onAudioChunk(audio);
    } catch (error) {
      log.error('[Cartesia] Error en chunk de streaming', { error: error.message });
    }
  }

  for await (const chunk of textStream) {
    buffer += chunk;

    // Enviar a TTS cuando hay una oración completa (termina en puntuación)
    if (sentenceEnders.test(buffer) && buffer.length > 20) {
      await flushBuffer();
    }
  }

  // Enviar lo que quede al final
  await flushBuffer();
}
