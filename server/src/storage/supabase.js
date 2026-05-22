/**
 * supabase.js — Integración con Supabase (base de datos)
 *
 * Todas las operaciones de base de datos pasan por este archivo.
 * Usa el service_role key para tener acceso completo — este cliente
 * NUNCA se expone al frontend.
 *
 * Tablas que maneja:
 * - businesses: negocios clientes de EZAI
 * - calls: registro de llamadas
 * - appointments: citas agendadas
 * - patients: datos de pacientes
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

// ─── Cliente de Supabase ──────────────────────────────────────────────────────
// Usamos service_role para tener acceso completo desde el servidor

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── NEGOCIOS ─────────────────────────────────────────────────────────────────

/**
 * Obtiene el negocio asociado a un número de teléfono.
 * Se usa para determinar qué configuración cargar cuando entra una llamada.
 *
 * @param {string} phoneNumber - Número en formato E.164
 * @returns {Promise<Object|null>} - Negocio con su configuración o null
 */
export async function getBusinessByPhone(phoneNumber) {
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, config, agent_id')
    .eq('phone_number', phoneNumber)
    .eq('active', true)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') { // PGRST116 = no rows found, es normal
      logger.error('[Supabase] Error buscando negocio por teléfono', { phoneNumber, error: error.message });
    }
    return null;
  }

  return data;
}

// ─── LLAMADAS ─────────────────────────────────────────────────────────────────

/**
 * Registra una llamada nueva al inicio.
 */
export async function saveCall({ id, businessId, fromPhone, toPhone, status, startTime }) {
  const { error } = await supabase
    .from('calls')
    .insert({
      id,
      business_id: businessId,
      from_phone: fromPhone,
      to_phone: toPhone,
      status,
      started_at: startTime,
    });

  if (error) {
    logger.error('[Supabase] Error guardando llamada', { callId: id, error: error.message });
    throw error;
  }
}

/**
 * Actualiza los datos de una llamada al terminar.
 */
export async function updateCall({ id, status, duration, transcription, appointmentCreated, language, endTime, recordingUrl, messagesCount }) {
  const updates = {};

  if (status !== undefined)             updates.status = status;
  if (duration !== undefined)           updates.duration_seconds = duration;
  if (transcription !== undefined)      updates.transcription = transcription;
  if (appointmentCreated !== undefined) updates.appointment_created = appointmentCreated;
  if (language !== undefined)           updates.language_detected = language;
  if (endTime !== undefined)            updates.ended_at = endTime;
  if (recordingUrl !== undefined)       updates.recording_url = recordingUrl;
  if (messagesCount !== undefined)      updates.messages_count = messagesCount;

  const { error } = await supabase
    .from('calls')
    .update(updates)
    .eq('id', id);

  if (error) {
    logger.error('[Supabase] Error actualizando llamada', { callId: id, error: error.message });
    throw error;
  }
}

// ─── CITAS ────────────────────────────────────────────────────────────────────

/**
 * Guarda una cita nueva en la base de datos.
 * Se llama después de crear el evento en Google Calendar.
 */
export async function saveAppointment({
  id,
  businessId,
  callId,
  patientName,
  phone,
  birthDate,
  reason,
  date,
  time,
  googleEventId,
}) {
  const { error } = await supabase
    .from('appointments')
    .insert({
      id,
      business_id: businessId,
      call_id: callId,
      patient_name: patientName,
      phone,
      birth_date: birthDate,
      reason,
      appointment_date: date,
      appointment_time: time,
      google_event_id: googleEventId,
      status: 'scheduled',
    });

  if (error) {
    logger.error('[Supabase] Error guardando cita', { error: error.message });
    throw error;
  }
}

/**
 * Actualiza el estado de una cita (reagendada, cancelada, etc.)
 */
export async function updateAppointmentStatus({ googleEventId, status, newDate, newTime }) {
  const updates = { status };
  if (newDate) updates.appointment_date = newDate;
  if (newTime) updates.appointment_time = newTime;

  const { error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('google_event_id', googleEventId);

  if (error) {
    logger.error('[Supabase] Error actualizando cita', { error: error.message });
    throw error;
  }
}

// ─── PACIENTES ────────────────────────────────────────────────────────────────

/**
 * Crea o actualiza un paciente en la base de datos.
 * Usa upsert para no duplicar si ya existe el teléfono.
 */
export async function upsertPatient({ businessId, name, phone, birthDate }) {
  const { data, error } = await supabase
    .from('patients')
    .upsert({
      business_id: businessId,
      name,
      phone,
      birth_date: birthDate,
      last_contact: new Date().toISOString(),
    }, {
      onConflict: 'business_id, phone',
      ignoreDuplicates: false,
    })
    .select('id')
    .single();

  if (error) {
    logger.error('[Supabase] Error creando/actualizando paciente', { error: error.message });
    return null;
  }

  return data?.id;
}

// ─── HISTORIAL DE LLAMADAS (para el dashboard) ────────────────────────────────

/**
 * Obtiene el historial de llamadas de un negocio para el dashboard.
 *
 * @param {string} businessId
 * @param {Object} options - { limit, offset, dateFrom, dateTo }
 */
export async function getCallHistory(businessId, { limit = 20, offset = 0, dateFrom, dateTo } = {}) {
  let query = supabase
    .from('calls')
    .select('*', { count: 'exact' })
    .eq('business_id', businessId)
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (dateFrom) query = query.gte('started_at', dateFrom);
  if (dateTo)   query = query.lte('started_at', dateTo);

  const { data, error, count } = await query;

  if (error) {
    logger.error('[Supabase] Error obteniendo historial', { businessId, error: error.message });
    throw error;
  }

  return { calls: data, total: count };
}
