/**
 * constants.js — Constantes globales del sistema
 *
 * Centraliza todos los valores fijos del sistema para que sea fácil
 * ajustarlos sin tener que buscarlos en múltiples archivos.
 */

// ─── Pipeline de Voz ─────────────────────────────────────────────────────────

export const PIPELINE = {
  // Latencia máxima aceptable end-to-end en milisegundos
  MAX_LATENCY_MS: 800,

  // Tiempo de silencio antes de preguntar "¿Sigue ahí?"
  SILENCE_TIMEOUT_MS: 8_000,

  // Tiempo adicional de silencio antes de colgar
  HANGUP_TIMEOUT_MS: 10_000,

  // Tamaño mínimo de texto para enviar a TTS (evita generar audio de 1 palabra)
  MIN_TTS_CHUNK_LENGTH: 20,
};

// ─── Agendado de Citas ────────────────────────────────────────────────────────

export const SCHEDULING = {
  // Duración default de una cita en minutos
  APPOINTMENT_DURATION_MINUTES: 30,

  // Máximo de citas por día
  MAX_APPOINTMENTS_PER_DAY: 12,

  // Anticipación mínima para agendar (en horas)
  MIN_ADVANCE_HOURS: 2,

  // Anticipación máxima para agendar (en días)
  MAX_ADVANCE_DAYS: 30,

  // Horarios de atención por día
  // Formato: { open: "HH:MM", close: "HH:MM" } o null si no hay atención
  HOURS: {
    MONDAY:    { open: '09:00', close: '18:00' },
    TUESDAY:   { open: '09:00', close: '18:00' },
    WEDNESDAY: { open: '09:00', close: '18:00' },
    THURSDAY:  { open: '09:00', close: '18:00' },
    FRIDAY:    { open: '09:00', close: '18:00' },
    SATURDAY:  { open: '09:00', close: '14:00' },
    SUNDAY:    null, // Cerrado
  },

  // Zona horaria del consultorio
  TIMEZONE: 'America/Mexico_City',
};

// ─── Reintentos de APIs ───────────────────────────────────────────────────────

export const RETRY = {
  // Número máximo de reintentos antes de rendirse
  MAX_ATTEMPTS: 3,

  // Espera inicial entre reintentos (ms)
  INITIAL_DELAY_MS: 500,

  // Factor de multiplicación por cada reintento (backoff exponencial)
  // Reintento 1: 500ms, Reintento 2: 1000ms, Reintento 3: 2000ms
  BACKOFF_FACTOR: 2,

  // Tiempo máximo de espera entre reintentos (ms)
  MAX_DELAY_MS: 5_000,
};

// ─── Grabaciones de Audio ─────────────────────────────────────────────────────

export const RECORDINGS = {
  // Días antes de que expiren las grabaciones en Cloudflare R2
  EXPIRY_DAYS: 7,

  // Formato de audio de las grabaciones
  AUDIO_FORMAT: 'wav',

  // Tiempo máximo de duración de una grabación en minutos
  MAX_DURATION_MINUTES: 60,
};

// ─── Llamadas ─────────────────────────────────────────────────────────────────

export const CALLS = {
  // Tiempo máximo de una llamada en minutos (para evitar llamadas infinitas)
  MAX_DURATION_MINUTES: 30,

  // Estados posibles de una llamada
  STATUS: {
    INITIATED: 'initiated',
    ANSWERED: 'answered',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    TRANSFERRED: 'transferred',
    EMERGENCY: 'emergency',
  },
};

// ─── Idiomas ──────────────────────────────────────────────────────────────────

export const LANGUAGES = {
  SPANISH: 'es',
  ENGLISH: 'en',
  DEFAULT: 'es',
};

// ─── Palabras clave de emergencia ─────────────────────────────────────────────
// Si el paciente dice alguna de estas palabras, se activa el protocolo de emergencia

export const EMERGENCY_KEYWORDS = [
  // Síntomas cardíacos
  'dolor en el pecho', 'dolor de pecho', 'presión en el pecho', 'infarto',
  'heart attack', 'chest pain', 'chest pressure',

  // Respiración
  'no puedo respirar', 'dificultad para respirar', 'me ahogo', 'me estoy ahogando',
  'can\'t breathe', 'difficulty breathing', 'choking',

  // Sangrado
  'sangrado intenso', 'sangrando mucho', 'mucha sangre', 'hemorragia',
  'heavy bleeding', 'bleeding badly', 'hemorrhage',

  // Consciencia
  'pérdida de consciencia', 'perdió el conocimiento', 'se desmayó', 'inconsciente',
  'unconscious', 'passed out', 'fainted',

  // Derrame cerebral
  'derrame cerebral', 'stroke', 'cara caída', 'no puedo hablar de repente',
  'face drooping', 'sudden numbness', 'sudden confusion',

  // Urgencias generales
  'emergencia', 'urgencia', 'es urgente', 'es una emergencia',
  'emergency', 'urgent',
];

// ─── Respuestas de Emergencia ─────────────────────────────────────────────────

export const EMERGENCY_RESPONSES = {
  es: 'Esto suena urgente. Por favor llame al 911 ahora mismo o diríjase a urgencias más cercanas de inmediato. No pierda tiempo.',
  en: 'This sounds urgent. Please call 911 immediately or go to the nearest emergency room right now. Do not wait.',
};

// ─── HTTP ─────────────────────────────────────────────────────────────────────

export const HTTP = {
  // Límite de requests por IP por minuto (rate limiting)
  RATE_LIMIT_RPM: 100,

  // Timeout para requests a APIs externas (ms)
  EXTERNAL_API_TIMEOUT_MS: 10_000,
};
