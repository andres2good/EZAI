/**
 * validators.js — Validación de datos de entrada
 *
 * Valida datos que vienen de fuera del sistema: webhooks de Telnyx,
 * inputs del paciente procesados por Deepgram, y requests al API.
 * No validamos datos internos — confiamos en nuestro propio código.
 */

// ─── Teléfonos ────────────────────────────────────────────────────────────────

/**
 * Valida que un número de teléfono esté en formato E.164
 * Ejemplo válido: +521234567890
 */
export function isValidPhone(phone) {
  if (typeof phone !== 'string') return false;
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

/**
 * Normaliza un número de teléfono a formato E.164.
 * Elimina espacios, guiones y paréntesis.
 */
export function normalizePhone(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-().]/g, '');
  // Si empieza con 0 o sin +, asumimos México
  if (cleaned.startsWith('52') && !cleaned.startsWith('+')) {
    return '+' + cleaned;
  }
  if (!cleaned.startsWith('+')) {
    return '+52' + cleaned;
  }
  return cleaned;
}

// ─── Fechas y Horas ───────────────────────────────────────────────────────────

/**
 * Valida que una fecha esté en formato YYYY-MM-DD
 */
export function isValidDate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Valida que una hora esté en formato HH:MM (24h)
 */
export function isValidTime(timeStr) {
  if (typeof timeStr !== 'string') return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr);
}

/**
 * Verifica que una fecha no esté en el pasado
 */
export function isFutureDate(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

// ─── Texto / Transcripciones ──────────────────────────────────────────────────

/**
 * Limpia texto de transcripción — elimina ruido y normaliza espacios.
 * Deepgram a veces devuelve texto con espacios extras o caracteres extraños.
 */
export function cleanTranscription(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .trim()
    .replace(/\s+/g, ' ')       // Múltiples espacios → uno solo
    .replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ.,!?¿¡;:'"()-]/g, ''); // Elimina caracteres raros
}

/**
 * Verifica si un texto tiene contenido real (no solo ruido o silencio).
 * Deepgram puede transcribir "mm", "eh", "..." cuando hay silencio parcial.
 */
export function hasRealContent(text) {
  const cleaned = cleanTranscription(text);
  if (cleaned.length < 2) return false;

  // Palabras de relleno que no son acciones reales
  const fillers = ['mm', 'eh', 'ah', 'um', 'uh', 'hmm', '...'];
  return !fillers.includes(cleaned.toLowerCase());
}

// ─── Webhooks de Telnyx ───────────────────────────────────────────────────────

/**
 * Valida que el cuerpo de un webhook de Telnyx tenga la estructura esperada.
 * No valida la firma aquí — eso lo hace el middleware auth.js.
 */
export function isValidTelnyxWebhook(body) {
  return (
    body &&
    typeof body === 'object' &&
    body.data &&
    typeof body.data.event_type === 'string' &&
    body.data.payload
  );
}

// ─── Datos de Paciente ────────────────────────────────────────────────────────

/**
 * Valida los datos mínimos necesarios para agendar una cita.
 * Retorna { valid: true } o { valid: false, missing: ['campo1', 'campo2'] }
 */
export function validateAppointmentData(data) {
  const required = ['patientName', 'phone', 'date', 'time', 'reason'];
  const missing = required.filter(field => !data[field]);

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  if (!isValidPhone(data.phone)) {
    return { valid: false, missing: ['phone (formato inválido)'] };
  }

  if (!isValidDate(data.date)) {
    return { valid: false, missing: ['date (formato inválido, usar YYYY-MM-DD)'] };
  }

  if (!isValidTime(data.time)) {
    return { valid: false, missing: ['time (formato inválido, usar HH:MM)'] };
  }

  if (!isFutureDate(data.date)) {
    return { valid: false, missing: ['date (la fecha ya pasó)'] };
  }

  return { valid: true };
}
