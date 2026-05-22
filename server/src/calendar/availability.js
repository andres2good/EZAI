/**
 * availability.js — Lógica de disponibilidad para el agente
 *
 * Traduce entre lo que el paciente dice ("el martes que viene") y
 * lo que Google Calendar necesita (fechas en YYYY-MM-DD).
 * También formatea las respuestas de disponibilidad para que Claude
 * pueda comunicarlas de forma natural al paciente.
 */

import { getAvailableSlots } from './googleCalendar.js';
import { SCHEDULING } from '../config/constants.js';
import logger from '../utils/logger.js';

// ─── Obtener disponibilidad para el agente ────────────────────────────────────

/**
 * Obtiene los horarios disponibles para una fecha y los formatea
 * en texto natural para que Claude los comunique al paciente.
 *
 * @param {string} date - Fecha en formato YYYY-MM-DD
 * @returns {Promise<Object>} - { available: boolean, slots: string[], message: string }
 */
export async function checkAvailability(date) {
  try {
    const slots = await getAvailableSlots(date);
    const dayName = getDayNameSpanish(date);
    const formattedDate = formatDateSpanish(date);

    if (slots.length === 0) {
      const dayConfig = getDayConfig(date);

      if (!dayConfig) {
        return {
          available: false,
          slots: [],
          message: `Lo siento, ${dayName} ${formattedDate} no tenemos citas disponibles ya que el consultorio no atiende ese día.`,
        };
      }

      return {
        available: false,
        slots: [],
        message: `Lo siento, ${dayName} ${formattedDate} ya no tenemos horarios disponibles. ¿Le gustaría ver disponibilidad para otro día?`,
      };
    }

    // Formatear horarios en texto natural
    const formattedSlots = slots.slice(0, 6).map(formatTimeSpanish);
    const slotsText = formattedSlots.join(', ');

    return {
      available: true,
      slots,
      message: `Para ${dayName} ${formattedDate} tenemos disponibilidad a las: ${slotsText}. ¿Cuál horario le viene mejor?`,
    };

  } catch (error) {
    logger.error('[Availability] Error consultando disponibilidad', {
      date,
      error: error.message,
    });

    return {
      available: false,
      slots: [],
      message: 'Tuve un problema al consultar el calendario. ¿Me puede indicar otra fecha de su preferencia?',
    };
  }
}

/**
 * Obtiene el próximo día disponible a partir de hoy.
 * Útil cuando el paciente no tiene preferencia de fecha.
 *
 * @returns {Promise<Object>} - { date, slots, message }
 */
export async function getNextAvailableDay() {
  const today = new Date();

  for (let i = 1; i <= SCHEDULING.MAX_ADVANCE_DAYS; i++) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + i);
    const dateStr = candidate.toISOString().slice(0, 10);

    const dayConfig = getDayConfig(dateStr);
    if (!dayConfig) continue; // Día cerrado, saltar

    const slots = await getAvailableSlots(dateStr).catch(() => []);
    if (slots.length > 0) {
      const dayName = getDayNameSpanish(dateStr);
      const formattedDate = formatDateSpanish(dateStr);
      const formattedSlots = slots.slice(0, 4).map(formatTimeSpanish).join(', ');

      return {
        date: dateStr,
        slots,
        message: `El próximo día disponible es ${dayName} ${formattedDate}. Tengo horarios a las: ${formattedSlots}. ¿Alguno le funciona?`,
      };
    }
  }

  return {
    date: null,
    slots: [],
    message: 'Por el momento no tenemos disponibilidad en los próximos 30 días. Le recomiendo llamar más adelante.',
  };
}

// ─── Helpers de formato ───────────────────────────────────────────────────────

function getDayNameSpanish(dateStr) {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return days[new Date(dateStr + 'T12:00:00').getDay()];
}

function formatDateSpanish(dateStr) {
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const date = new Date(dateStr + 'T12:00:00');
  return `${date.getDate()} de ${months[date.getMonth()]}`;
}

function formatTimeSpanish(time) {
  const [h, m] = time.split(':').map(Number);
  const period = h < 12 ? 'de la mañana' : h < 19 ? 'de la tarde' : 'de la noche';
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const minuteStr = m === 0 ? '' : ` y ${m}`;
  return `${hour12}${minuteStr} ${period}`;
}

function getDayConfig(dateStr) {
  const dayKeys = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const dayKey = dayKeys[new Date(dateStr + 'T12:00:00').getDay()];
  return SCHEDULING.HOURS[dayKey];
}
