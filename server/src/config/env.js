/**
 * env.js — Carga y valida todas las variables de entorno
 *
 * Este archivo se importa PRIMERO en index.js antes que cualquier otra cosa.
 * Si falta alguna variable requerida, el servidor no arranca — es intencional.
 * Es mejor que el sistema falle al arrancar que fallar silenciosamente
 * durante una llamada real.
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carga el archivo .env desde la raíz de /server
config({ path: resolve(__dirname, '../../.env') });

// ─── Validador de variables requeridas ───────────────────────────────────────

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[ENV ERROR] Variable de entorno requerida no encontrada: ${name}\n` +
      `Revisa tu archivo .env y asegúrate de que "${name}" tenga un valor.`
    );
  }
  return value.trim();
}

function optionalEnv(name, defaultValue = '') {
  return (process.env[name] || defaultValue).trim();
}

// ─── Exportar todas las variables validadas ───────────────────────────────────

export const env = {

  // Servidor
  PORT: parseInt(optionalEnv('PORT', '3000'), 10),
  SERVER_URL: requireEnv('SERVER_URL'),
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
  IS_PRODUCTION: optionalEnv('NODE_ENV', 'development') === 'production',

  // Telnyx
  TELNYX_API_KEY: requireEnv('TELNYX_API_KEY'),
  TELNYX_PUBLIC_KEY: requireEnv('TELNYX_PUBLIC_KEY'),
  TELNYX_APP_ID: requireEnv('TELNYX_APP_ID'),

  // Deepgram
  DEEPGRAM_API_KEY: requireEnv('DEEPGRAM_API_KEY'),
  DEEPGRAM_MODEL: optionalEnv('DEEPGRAM_MODEL', 'nova-3'),
  DEEPGRAM_LANGUAGE: optionalEnv('DEEPGRAM_LANGUAGE', 'es'),

  // Claude / Anthropic
  ANTHROPIC_API_KEY: requireEnv('ANTHROPIC_API_KEY'),
  CLAUDE_MODEL: optionalEnv('CLAUDE_MODEL', 'claude-sonnet-4-6'),
  CLAUDE_TEMPERATURE: parseFloat(optionalEnv('CLAUDE_TEMPERATURE', '0.3')),
  CLAUDE_MAX_TOKENS: parseInt(optionalEnv('CLAUDE_MAX_TOKENS', '1024'), 10),

  // Cartesia
  CARTESIA_API_KEY: requireEnv('CARTESIA_API_KEY'),
  CARTESIA_VOICE_ID: requireEnv('CARTESIA_VOICE_ID'),
  CARTESIA_MODEL: optionalEnv('CARTESIA_MODEL', 'sonic-3'),

  // Google Calendar
  GOOGLE_SERVICE_ACCOUNT_EMAIL: requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
  GOOGLE_SERVICE_ACCOUNT_KEY_BASE64: requireEnv('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64'),
  GOOGLE_CALENDAR_ID: requireEnv('GOOGLE_CALENDAR_ID'),

  // Supabase
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_ANON_KEY: requireEnv('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),

  // Cloudflare R2
  CLOUDFLARE_R2_ACCOUNT_ID: requireEnv('CLOUDFLARE_R2_ACCOUNT_ID'),
  CLOUDFLARE_R2_ACCESS_KEY_ID: requireEnv('CLOUDFLARE_R2_ACCESS_KEY_ID'),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: requireEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
  CLOUDFLARE_R2_BUCKET_NAME: optionalEnv('CLOUDFLARE_R2_BUCKET_NAME', 'ezai-recordings'),
  CLOUDFLARE_R2_PUBLIC_URL: optionalEnv('CLOUDFLARE_R2_PUBLIC_URL', ''),

  // Agente
  DEFAULT_BUSINESS_ID: optionalEnv('DEFAULT_BUSINESS_ID', 'test-consultorio-01'),
  CONSULTORIO_PHONE_NUMBER: requireEnv('CONSULTORIO_PHONE_NUMBER'),
  TRANSFER_PHONE_NUMBER: requireEnv('TRANSFER_PHONE_NUMBER'),

  // Logs
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info'),
  LOG_DIR: optionalEnv('LOG_DIR', './logs'),
};

// ─── Función helper para decodificar el Service Account de Google ─────────────

export function getGoogleServiceAccountKey() {
  const base64 = env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  try {
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
  } catch {
    throw new Error(
      '[ENV ERROR] GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 no es un JSON válido en Base64. ' +
      'Conviértelo con: cat key.json | base64'
    );
  }
}
