/**
 * voicePipeline.js — Pipeline central de voz
 *
 * Este es el corazón del sistema. Conecta todos los servicios en un
 * flujo continuo durante una llamada:
 *
 *   Audio (Telnyx) → Deepgram (STT) → Claude (LLM) → Cartesia (TTS) → Audio (Telnyx)
 *
 * También maneja:
 *   - Barge-in: el paciente interrumpe al agente mientras habla
 *   - Silencio: nadie habla por demasiado tiempo
 *   - Tool use: Claude decide agendar/cancelar/buscar citas
 *   - Cambio de idioma: de español a inglés y viceversa
 *   - Timeout: llamada demasiado larga
 */

import { createDeepgramSession } from '../stt/deepgram.js';
import { generateResponse } from '../llm/claude.js';
import { textToSpeech } from '../tts/cartesia.js';
import { playAudio, stopPlayback, hangupCall, transferCall } from '../telephony/telnyx.js';
import {
  createAppointment,
  findAppointmentByPatient,
  updateAppointment,
  cancelAppointment,
} from '../calendar/googleCalendar.js';
import { checkAvailability, getNextAvailableDay } from '../calendar/availability.js';
import { saveAppointment, updateCall, upsertPatient } from '../storage/supabase.js';
import { PIPELINE, CALLS, LANGUAGES, EMERGENCY_RESPONSES } from '../config/constants.js';
import { callLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// ─── Iniciar pipeline de voz ──────────────────────────────────────────────────

/**
 * Inicia el pipeline de voz para una llamada.
 * El callState contiene toda la información de la llamada activa.
 *
 * @param {Object} options
 * @param {Object} options.callState - Estado completo de la llamada desde callManager
 * @returns {Object} - Objeto con métodos para interactuar con el pipeline
 */
export function startVoicePipeline({ callState }) {
  const {
    callId,
    callControlId,
    businessId,
    businessConfig,
  } = callState;

  const log = callLogger(callId, businessId);

  // ─── Estado interno del pipeline ─────────────────────────────────────────

  const state = {
    isAgentSpeaking: false,     // El agente está reproduciendo audio ahora mismo
    isProcessing: false,        // Claude está generando una respuesta
    language: LANGUAGES.DEFAULT,
    silenceTimer: null,
    hangupTimer: null,
    stopped: false,
    currentAudioAbortController: null,
  };

  // ─── Iniciar sesión de Deepgram ───────────────────────────────────────────

  const deepgramSession = createDeepgramSession({
    callId,
    businessId,
    language: state.language,
    onTranscript: handleTranscript,
    onError: (error) => {
      log.error('[Pipeline] Error en Deepgram', { error: error.message });
      // Deepgram falló — intentar continuar sin reiniciar la llamada
    },
  });

  log.info('[Pipeline] Iniciado');

  // Iniciar timer de timeout de llamada (máximo 30 minutos)
  state.hangupTimer = setTimeout(async () => {
    log.warn('[Pipeline] Llamada demasiado larga — colgando');
    const farewell = state.language === 'en'
      ? 'The call has reached its maximum duration. Thank you for calling.'
      : 'La llamada ha alcanzado su duración máxima. Gracias por llamarnos.';
    await speakAndSend(farewell);
    await hangupCall({ callControlId, callId, businessId });
  }, CALLS.MAX_DURATION_MINUTES * 60 * 1000);

  resetSilenceTimer();

  // ─── Manejar transcripción del paciente ───────────────────────────────────

  async function handleTranscript(text) {
    if (state.stopped || state.isProcessing) return;

    log.info('[Pipeline] Paciente dijo', { text });

    // Guardar en transcripción completa
    callState.transcription.push({
      role: 'patient',
      text,
      timestamp: Date.now(),
      language: state.language,
    });

    // Si el agente estaba hablando, interrumpirlo (barge-in)
    if (state.isAgentSpeaking) {
      log.debug('[Pipeline] Barge-in detectado');
      await stopPlayback({ callControlId, callId, businessId });
      state.isAgentSpeaking = false;
    }

    resetSilenceTimer();

    // Detectar idioma por lo que dice el paciente
    detectLanguage(text);

    // Agregar mensaje del paciente al historial de Claude
    callState.messages.push({ role: 'user', content: text });

    // Generar respuesta
    state.isProcessing = true;
    try {
      await processAndRespond();
    } finally {
      state.isProcessing = false;
    }
  }

  // ─── Generar respuesta y hablarla ─────────────────────────────────────────

  async function processAndRespond() {
    const startTime = Date.now();

    try {
      let fullResponse = '';

      // Acumular texto para enviarlo a TTS en oraciones completas
      let textBuffer = '';
      const sentenceEnders = /[.!?¿¡]/;

      const response = await generateResponse({
        callId,
        businessId,
        messages: callState.messages,
        businessConfig,
        language: state.language,

        // Cada chunk de texto de Claude — enviamos a TTS cuando hay oración completa
        onTextChunk: async (chunk) => {
          fullResponse += chunk;
          textBuffer += chunk;

          // Enviar a TTS cuando hay una oración completa
          if (sentenceEnders.test(textBuffer) && textBuffer.length > 15) {
            const toSpeak = textBuffer.trim();
            textBuffer = '';
            await speakAndSend(toSpeak);
          }
        },

        // Claude quiere ejecutar una herramienta (agendar cita, etc.)
        onToolCall: async (toolName, toolInput) => {
          const toolResult = await executeTool(toolName, toolInput);

          // Agregar resultado al historial para que Claude continúe
          callState.messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolInput._toolUseId || uuidv4(),
              content: JSON.stringify(toolResult),
            }],
          });

          return toolResult;
        },
      });

      // Hablar lo que quedó en el buffer al final
      if (textBuffer.trim().length > 0) {
        await speakAndSend(textBuffer.trim());
      }

      // Guardar respuesta del agente en el historial
      callState.messages.push({ role: 'assistant', content: response || fullResponse });
      callState.transcription.push({
        role: 'agent',
        text: response || fullResponse,
        timestamp: Date.now(),
        latencyMs: Date.now() - startTime,
      });

      const latency = Date.now() - startTime;
      log.info('[Pipeline] Respuesta generada', { latencyMs: latency });

      if (latency > PIPELINE.MAX_LATENCY_MS) {
        log.warn('[Pipeline] Latencia alta', { latencyMs: latency, target: PIPELINE.MAX_LATENCY_MS });
      }

    } catch (error) {
      log.error('[Pipeline] Error generando respuesta', { error: error.message });

      // Respuesta de fallback si todo falla
      const fallback = state.language === 'en'
        ? 'I apologize, I had a technical issue. Could you please repeat that?'
        : 'Disculpe, tuve un problema técnico. ¿Podría repetir lo que dijo?';

      await speakAndSend(fallback);
    }
  }

  // ─── Convertir texto a audio y reproducirlo ───────────────────────────────

  async function speakAndSend(text) {
    if (state.stopped || !text || text.trim().length === 0) return;

    try {
      state.isAgentSpeaking = true;

      const audio = await textToSpeech({
        text: text.trim(),
        language: state.language,
        callId,
        businessId,
      });

      if (audio && !state.stopped) {
        await playAudio({ callControlId, audioBuffer: audio, callId, businessId });

        callState.transcription.push({
          role: 'agent_audio',
          text,
          timestamp: Date.now(),
        });
      }

    } catch (error) {
      log.error('[Pipeline] Error en TTS o reproducción', { error: error.message });
    } finally {
      state.isAgentSpeaking = false;
    }
  }

  // ─── Ejecutar herramientas de Claude ─────────────────────────────────────

  async function executeTool(toolName, toolInput) {
    log.info('[Pipeline] Ejecutando herramienta', { toolName, toolInput });

    try {
      switch (toolName) {

        case 'check_availability': {
          if (toolInput.date) {
            return await checkAvailability(toolInput.date);
          }
          return await getNextAvailableDay();
        }

        case 'create_appointment': {
          // Crear en Google Calendar
          const event = await createAppointment(toolInput);

          // Guardar paciente en Supabase
          const patientId = await upsertPatient({
            businessId,
            name: toolInput.patientName,
            phone: toolInput.phone,
            birthDate: toolInput.birthDate,
          }).catch(() => null);

          // Guardar cita en Supabase
          await saveAppointment({
            id: uuidv4(),
            businessId,
            callId,
            patientName: toolInput.patientName,
            phone: toolInput.phone,
            birthDate: toolInput.birthDate,
            reason: toolInput.reason,
            date: toolInput.date,
            time: toolInput.time,
            googleEventId: event.id,
          }).catch(err => log.error('[Pipeline] Error guardando cita en DB', { error: err.message }));

          // Marcar que se agendó cita en esta llamada
          callState.appointmentCreated = true;
          await updateCall({ id: callId, appointmentCreated: true }).catch(() => {});

          return {
            success: true,
            appointmentId: event.id,
            date: toolInput.date,
            time: toolInput.time,
            message: 'Cita creada exitosamente',
          };
        }

        case 'find_appointment': {
          const appointments = await findAppointmentByPatient(toolInput.patientName);
          return {
            found: appointments.length > 0,
            appointments,
          };
        }

        case 'update_appointment': {
          const updated = await updateAppointment({
            eventId: toolInput.appointmentId,
            newDate: toolInput.newDate,
            newTime: toolInput.newTime,
          });
          return { success: true, ...updated };
        }

        case 'cancel_appointment': {
          await cancelAppointment(toolInput.appointmentId);
          return { success: true, cancelled: true };
        }

        case 'transfer_call': {
          const transferPhone = businessConfig?.transferPhone || callState.toPhone;
          log.info('[Pipeline] Transfiriendo llamada', { reason: toolInput.reason, to: transferPhone });

          // Pequeña pausa para que el agente termine de hablar antes de transferir
          setTimeout(async () => {
            await transferCall({ callControlId, toPhone: transferPhone, callId, businessId });
          }, 2000);

          await updateCall({ id: callId, status: CALLS.STATUS.TRANSFERRED }).catch(() => {});

          return { success: true, transferring: true };
        }

        default:
          log.warn('[Pipeline] Herramienta desconocida', { toolName });
          return { error: `Herramienta desconocida: ${toolName}` };
      }

    } catch (error) {
      log.error('[Pipeline] Error ejecutando herramienta', {
        toolName,
        error: error.message,
      });
      return {
        error: `Error al ejecutar ${toolName}: ${error.message}`,
        success: false,
      };
    }
  }

  // ─── Detección de idioma ──────────────────────────────────────────────────

  function detectLanguage(text) {
    // Palabras comunes en inglés que indican cambio de idioma
    const englishIndicators = [
      'hello', 'hi', 'good', 'morning', 'afternoon', 'evening', 'i ', 'my ',
      'the ', 'appointment', 'doctor', 'please', 'thank', 'yes', 'no', 'help',
      'want', 'need', 'would', 'like', 'can', 'speak', 'english',
    ];

    const lower = text.toLowerCase();
    const englishWords = englishIndicators.filter(w => lower.includes(w)).length;

    if (englishWords >= 2 && state.language !== LANGUAGES.ENGLISH) {
      log.info('[Pipeline] Cambiando a inglés');
      state.language = LANGUAGES.ENGLISH;
      callState.language = LANGUAGES.ENGLISH;
      updateCall({ id: callId, language: LANGUAGES.ENGLISH }).catch(() => {});
    } else if (englishWords === 0 && state.language !== LANGUAGES.SPANISH) {
      // El paciente volvió al español
      const spanishIndicators = ['hola', 'buenas', 'quiero', 'necesito', 'gracias', 'cita', 'doctor', 'por favor'];
      const spanishWords = spanishIndicators.filter(w => lower.includes(w)).length;
      if (spanishWords >= 1) {
        log.info('[Pipeline] Cambiando a español');
        state.language = LANGUAGES.SPANISH;
        callState.language = LANGUAGES.SPANISH;
      }
    }
  }

  // ─── Timer de silencio ────────────────────────────────────────────────────

  function resetSilenceTimer() {
    if (state.silenceTimer) clearTimeout(state.silenceTimer);

    state.silenceTimer = setTimeout(async () => {
      if (state.stopped || state.isProcessing || state.isAgentSpeaking) return;

      log.info('[Pipeline] Silencio prolongado — verificando si sigue ahí');

      const checkIn = state.language === 'en'
        ? 'Are you still there? How can I help you?'
        : '¿Sigue ahí? ¿En qué le puedo ayudar?';

      await speakAndSend(checkIn);

      // Si después de preguntar sigue el silencio, colgar
      state.silenceTimer = setTimeout(async () => {
        if (state.stopped) return;
        log.info('[Pipeline] Sin respuesta — colgando');

        const farewell = state.language === 'en'
          ? 'I\'ll end the call. Please call us back if you need assistance. Goodbye.'
          : 'Voy a terminar la llamada. Si necesita ayuda, no dude en llamarnos. ¡Hasta luego!';

        await speakAndSend(farewell);
        await hangupCall({ callControlId, callId, businessId });
      }, PIPELINE.HANGUP_TIMEOUT_MS);

    }, PIPELINE.SILENCE_TIMEOUT_MS);
  }

  // ─── Interfaz pública del pipeline ───────────────────────────────────────

  return {
    // Recibir audio de Telnyx y enviarlo a Deepgram
    handleAudioChunk(audioChunk) {
      if (!state.stopped) {
        deepgramSession.sendAudio(audioChunk);
      }
    },

    // Detener el pipeline limpiamente
    stop() {
      log.info('[Pipeline] Deteniendo');
      state.stopped = true;
      clearTimeout(state.silenceTimer);
      clearTimeout(state.hangupTimer);
      deepgramSession.close();
    },

    // Estado actual (para diagnóstico)
    getState() {
      return {
        language: state.language,
        isAgentSpeaking: state.isAgentSpeaking,
        isProcessing: state.isProcessing,
        messageCount: callState.messages.length,
      };
    },
  };
}
