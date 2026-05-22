/**
 * googleCalendar.js — Integración con Google Calendar API
 *
 * Permite al agente crear, buscar, modificar y cancelar citas reales
 * en el Google Calendar del médico. El médico ve todo en su app normal
 * de Google Calendar — no necesita aprender nada nuevo.
 *
 * Usa Service Account para autenticarse sin necesidad de que el médico
 * esté presente o autorice cada operación.
 */

import { google } from 'googleapis';
import { env, getGoogleServiceAccountKey } from '../config/env.js';
import { SCHEDULING } from '../config/constants.js';
import logger from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

// ─── Autenticación con Service Account ───────────────────────────────────────

function getAuthClient() {
  const serviceAccountKey = getGoogleServiceAccountKey();

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return auth;
}

function getCalendarClient() {
  return google.calendar({ version: 'v3', auth: getAuthClient() });
}

// ─── Crear una cita nueva ─────────────────────────────────────────────────────

/**
 * Crea una cita en Google Calendar.
 *
 * @param {Object} appointment
 * @param {string} appointment.patientName - Nombre completo del paciente
 * @param {string} appointment.phone - Teléfono del paciente
 * @param {string} appointment.reason - Motivo de consulta
 * @param {string} appointment.date - Fecha (YYYY-MM-DD)
 * @param {string} appointment.time - Hora (HH:MM)
 * @param {string} [appointment.birthDate] - Fecha de nacimiento del paciente
 * @returns {Promise<Object>} - Evento creado con su ID
 */
export async function createAppointment(appointment) {
  const { patientName, phone, reason, date, time, birthDate } = appointment;
  const calendar = getCalendarClient();

  // Calcular inicio y fin de la cita
  const startDateTime = `${date}T${time}:00`;
  const endTime = addMinutes(time, SCHEDULING.APPOINTMENT_DURATION_MINUTES);
  const endDateTime = `${date}T${endTime}:00`;

  const event = {
    summary: `Consulta — ${patientName}`,
    description: [
      `Motivo: ${reason}`,
      `Teléfono: ${phone}`,
      birthDate ? `Fecha de nacimiento: ${birthDate}` : '',
      `Agendado por: EZAI TEST 0.1`,
    ].filter(Boolean).join('\n'),
    start: {
      dateTime: startDateTime,
      timeZone: SCHEDULING.TIMEZONE,
    },
    end: {
      dateTime: endDateTime,
      timeZone: SCHEDULING.TIMEZONE,
    },
    // Color amarillo para distinguir citas agendadas por EZAI
    colorId: '5',
  };

  return await withRetry(async () => {
    const response = await calendar.events.insert({
      calendarId: env.GOOGLE_CALENDAR_ID,
      resource: event,
    });

    logger.info('[GoogleCalendar] Cita creada', {
      eventId: response.data.id,
      patient: patientName,
      datetime: startDateTime,
    });

    return {
      id: response.data.id,
      summary: response.data.summary,
      start: response.data.start.dateTime,
      end: response.data.end.dateTime,
      htmlLink: response.data.htmlLink,
    };
  }, { name: 'Google Calendar create' });
}

// ─── Consultar disponibilidad ─────────────────────────────────────────────────

/**
 * Obtiene los horarios disponibles para una fecha específica.
 * Devuelve lista de horas libres según las reglas de SCHEDULING.
 *
 * @param {string} date - Fecha en formato YYYY-MM-DD
 * @returns {Promise<string[]>} - Lista de horas disponibles ['09:00', '09:30', ...]
 */
export async function getAvailableSlots(date) {
  const calendar = getCalendarClient();

  const dayName = getDayName(date);
  const hours = SCHEDULING.HOURS[dayName];

  // Si es día cerrado, no hay disponibilidad
  if (!hours) {
    return [];
  }

  // Obtener todos los eventos del día
  const startOfDay = `${date}T${hours.open}:00`;
  const endOfDay = `${date}T${hours.close}:00`;

  const response = await withRetry(async () => {
    return calendar.events.list({
      calendarId: env.GOOGLE_CALENDAR_ID,
      timeMin: `${startOfDay}-06:00`,   // Offset de Ciudad de México
      timeMax: `${endOfDay}-06:00`,
      singleEvents: true,
      orderBy: 'startTime',
    });
  }, { name: 'Google Calendar list' });

  const existingEvents = response.data.items || [];

  // Generar todos los slots posibles del día (cada 30 minutos)
  const allSlots = generateTimeSlots(hours.open, hours.close, SCHEDULING.APPOINTMENT_DURATION_MINUTES);

  // Verificar que no haya más de MAX citas en el día
  if (existingEvents.length >= SCHEDULING.MAX_APPOINTMENTS_PER_DAY) {
    return [];
  }

  // Filtrar slots que ya están ocupados
  const availableSlots = allSlots.filter(slot => {
    return !existingEvents.some(event => {
      const eventStart = new Date(event.start.dateTime).toTimeString().slice(0, 5);
      return eventStart === slot;
    });
  });

  // Filtrar slots que ya pasaron (mínimo 2 horas de anticipación)
  const minTime = new Date(Date.now() + SCHEDULING.MIN_ADVANCE_HOURS * 60 * 60 * 1000);
  const today = new Date().toISOString().slice(0, 10);

  if (date === today) {
    return availableSlots.filter(slot => {
      const slotDate = new Date(`${date}T${slot}:00`);
      return slotDate >= minTime;
    });
  }

  return availableSlots;
}

// ─── Buscar cita por paciente ─────────────────────────────────────────────────

/**
 * Busca citas próximas de un paciente por nombre.
 *
 * @param {string} patientName - Nombre del paciente
 * @returns {Promise<Array>} - Lista de citas encontradas
 */
export async function findAppointmentByPatient(patientName) {
  const calendar = getCalendarClient();

  const now = new Date().toISOString();
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const response = await withRetry(async () => {
    return calendar.events.list({
      calendarId: env.GOOGLE_CALENDAR_ID,
      timeMin: now,
      timeMax: future,
      q: patientName,           // Búsqueda por texto en el título del evento
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 5,
    });
  }, { name: 'Google Calendar search' });

  return (response.data.items || []).map(event => ({
    id: event.id,
    summary: event.summary,
    start: event.start.dateTime,
    end: event.end.dateTime,
    description: event.description,
  }));
}

// ─── Reagendar cita ───────────────────────────────────────────────────────────

export async function updateAppointment({ eventId, newDate, newTime }) {
  const calendar = getCalendarClient();

  const startDateTime = `${newDate}T${newTime}:00`;
  const endTime = addMinutes(newTime, SCHEDULING.APPOINTMENT_DURATION_MINUTES);
  const endDateTime = `${newDate}T${endTime}:00`;

  return await withRetry(async () => {
    const response = await calendar.events.patch({
      calendarId: env.GOOGLE_CALENDAR_ID,
      eventId,
      resource: {
        start: { dateTime: startDateTime, timeZone: SCHEDULING.TIMEZONE },
        end: { dateTime: endDateTime, timeZone: SCHEDULING.TIMEZONE },
      },
    });

    logger.info('[GoogleCalendar] Cita reagendada', { eventId, newDate, newTime });
    return { id: response.data.id, start: response.data.start.dateTime };
  }, { name: 'Google Calendar update' });
}

// ─── Cancelar cita ────────────────────────────────────────────────────────────

export async function cancelAppointment(eventId) {
  const calendar = getCalendarClient();

  return await withRetry(async () => {
    await calendar.events.delete({
      calendarId: env.GOOGLE_CALENDAR_ID,
      eventId,
    });

    logger.info('[GoogleCalendar] Cita cancelada', { eventId });
    return { cancelled: true, eventId };
  }, { name: 'Google Calendar delete' });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDayName(dateStr) {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[new Date(dateStr + 'T12:00:00').getDay()];
}

function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60).toString().padStart(2, '0');
  const newM = (total % 60).toString().padStart(2, '0');
  return `${newH}:${newM}`;
}

function generateTimeSlots(open, close, durationMinutes) {
  const slots = [];
  let current = open;

  while (current < close) {
    slots.push(current);
    current = addMinutes(current, durationMinutes);
  }

  return slots;
}
