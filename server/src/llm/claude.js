/**
 * claude.js — Integración con Claude API (cerebro del agente)
 *
 * Claude recibe el texto del paciente y genera la respuesta del agente.
 * Usa streaming para que la respuesta llegue en tiempo real a Cartesia
 * sin esperar a que Claude termine de generar toda la respuesta.
 *
 * También maneja tool use: cuando Claude decide agendar una cita,
 * llama a las herramientas de Google Calendar automáticamente.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { buildSystemPrompt } from './prompts/systemPrompt.js';
import { callLogger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { EMERGENCY_KEYWORDS, EMERGENCY_RESPONSES } from '../config/constants.js';

// ─── Cliente de Anthropic ─────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// ─── Definición de herramientas (tool use) ────────────────────────────────────
// Estas son las acciones que Claude puede ejecutar durante la llamada

const TOOLS = [
  {
    name: 'check_availability',
    description: 'Consulta los horarios disponibles en el calendario del médico para una fecha específica.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
      },
      required: ['date'],
    },
  },
  {
    name: 'create_appointment',
    description: 'Crea una cita nueva en el calendario del médico.',
    input_schema: {
      type: 'object',
      properties: {
        patientName:   { type: 'string', description: 'Nombre completo del paciente' },
        birthDate:     { type: 'string', description: 'Fecha de nacimiento (YYYY-MM-DD)' },
        phone:         { type: 'string', description: 'Teléfono de contacto en formato E.164' },
        reason:        { type: 'string', description: 'Motivo de la consulta' },
        date:          { type: 'string', description: 'Fecha de la cita (YYYY-MM-DD)' },
        time:          { type: 'string', description: 'Hora de la cita (HH:MM, formato 24h)' },
      },
      required: ['patientName', 'phone', 'reason', 'date', 'time'],
    },
  },
  {
    name: 'find_appointment',
    description: 'Busca una cita existente por nombre del paciente y teléfono.',
    input_schema: {
      type: 'object',
      properties: {
        patientName: { type: 'string', description: 'Nombre del paciente' },
        phone:       { type: 'string', description: 'Teléfono de contacto' },
      },
      required: ['patientName', 'phone'],
    },
  },
  {
    name: 'update_appointment',
    description: 'Reagenda una cita existente a una nueva fecha y hora.',
    input_schema: {
      type: 'object',
      properties: {
        appointmentId: { type: 'string', description: 'ID de la cita a modificar' },
        newDate:       { type: 'string', description: 'Nueva fecha (YYYY-MM-DD)' },
        newTime:       { type: 'string', description: 'Nueva hora (HH:MM)' },
      },
      required: ['appointmentId', 'newDate', 'newTime'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancela una cita existente.',
    input_schema: {
      type: 'object',
      properties: {
        appointmentId: { type: 'string', description: 'ID de la cita a cancelar' },
      },
      required: ['appointmentId'],
    },
  },
  {
    name: 'transfer_call',
    description: 'Transfiere la llamada a un humano del consultorio.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Motivo de la transferencia' },
      },
      required: ['reason'],
    },
  },
];

// ─── Función principal: generar respuesta del agente ─────────────────────────

/**
 * Genera la respuesta del agente dado el historial de la conversación.
 *
 * @param {Object} options
 * @param {string} options.callId - ID de la llamada
 * @param {string} options.businessId - ID del negocio
 * @param {Array}  options.messages - Historial de mensajes [{role, content}]
 * @param {Object} options.businessConfig - Configuración del negocio
 * @param {string} options.language - Idioma actual ('es' | 'en')
 * @param {Function} options.onTextChunk - Callback con cada fragmento de texto
 * @param {Function} options.onToolCall - Callback cuando Claude llama una herramienta
 * @returns {Promise<string>} - Respuesta completa generada
 */
export async function generateResponse({
  callId,
  businessId,
  messages,
  businessConfig,
  language = 'es',
  onTextChunk,
  onToolCall,
}) {
  const log = callLogger(callId, businessId);

  // Verificar si el último mensaje del paciente contiene palabras de emergencia
  // Hacemos esto ANTES de llamar a Claude para responder más rápido
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  if (isEmergency(lastUserMessage)) {
    const emergencyResponse = EMERGENCY_RESPONSES[language] || EMERGENCY_RESPONSES.es;
    log.warn('[Claude] Emergencia detectada', { message: lastUserMessage.slice(0, 100) });
    onTextChunk?.(emergencyResponse);
    return emergencyResponse;
  }

  log.debug('[Claude] Generando respuesta', { messageCount: messages.length });

  const systemPrompt = buildSystemPrompt(businessConfig);

  return await withRetry(
    async () => {
      let fullResponse = '';
      let currentToolCall = null;

      // Streaming con tool use
      const stream = anthropic.messages.stream({
        model: env.CLAUDE_MODEL,
        max_tokens: env.CLAUDE_MAX_TOKENS,
        temperature: env.CLAUDE_TEMPERATURE,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            // Prompt caching: el system prompt rara vez cambia, así que lo cacheamos
            // Esto reduce el costo en ~90% para los tokens de entrada del system prompt
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages,
        tools: TOOLS,
      });

      // Procesar el stream token por token
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const chunk = event.delta.text;
            fullResponse += chunk;
            onTextChunk?.(chunk);
          }

          // Claude está construyendo los argumentos de una herramienta
          if (event.delta.type === 'input_json_delta' && currentToolCall) {
            currentToolCall.inputBuffer += event.delta.partial_json;
          }
        }

        // Claude empieza a llamar una herramienta
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          currentToolCall = {
            id: event.content_block.id,
            name: event.content_block.name,
            inputBuffer: '',
          };
        }

        // Claude terminó de construir los argumentos de la herramienta
        if (event.type === 'content_block_stop' && currentToolCall) {
          try {
            const toolInput = JSON.parse(currentToolCall.inputBuffer || '{}');
            log.info('[Claude] Herramienta invocada', {
              tool: currentToolCall.name,
              input: toolInput,
            });

            // Ejecutar la herramienta y devolver el resultado a Claude
            if (onToolCall) {
              const toolResult = await onToolCall(currentToolCall.name, toolInput);
              // El resultado se agrega al historial para que Claude continúe
              // (esto lo maneja el voicePipeline)
            }
          } catch (parseError) {
            log.error('[Claude] Error al parsear argumentos de herramienta', {
              error: parseError.message,
              buffer: currentToolCall.inputBuffer,
            });
          }
          currentToolCall = null;
        }
      }

      log.debug('[Claude] Respuesta generada', {
        length: fullResponse.length,
        preview: fullResponse.slice(0, 80),
      });

      return fullResponse;
    },
    { name: 'Claude API', maxAttempts: 2 }
  );
}

// ─── Detección de emergencias ─────────────────────────────────────────────────

function isEmergency(text) {
  const lower = text.toLowerCase();
  return EMERGENCY_KEYWORDS.some(keyword => lower.includes(keyword.toLowerCase()));
}

// ─── Mensaje de saludo inicial ────────────────────────────────────────────────

/**
 * Genera el saludo inicial cuando alguien llama.
 * No requiere historial de conversación.
 */
export async function generateGreeting({ businessConfig, language = 'es', onTextChunk }) {
  const doctorName = businessConfig?.doctorName || 'García';
  const timeOfDay = getTimeOfDay();

  const greeting = language === 'en'
    ? `Doctor ${doctorName}'s office, good ${timeOfDay}. How can I help you today?`
    : `Consultorio del Doctor ${doctorName}, buenas ${timeOfDay}. ¿En qué le puedo ayudar?`;

  onTextChunk?.(greeting);
  return greeting;
}

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'mañana';
  if (hour < 19) return 'tardes';
  return 'noches';
}
