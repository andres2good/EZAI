/**
 * retry.js — Lógica de reintentos con backoff exponencial
 *
 * Cuando una API externa falla (Deepgram, Cartesia, Google Calendar, etc.),
 * no queremos que el sistema se caiga inmediatamente. Este módulo reintenta
 * automáticamente con pausas crecientes entre cada intento.
 *
 * Ejemplo de backoff:
 *   Intento 1 falla → espera 500ms
 *   Intento 2 falla → espera 1000ms
 *   Intento 3 falla → espera 2000ms → lanza el error
 */

import logger from './logger.js';
import { RETRY } from '../config/constants.js';

// ─── Función principal de reintento ──────────────────────────────────────────

/**
 * Ejecuta una función async con reintentos automáticos.
 *
 * @param {Function} fn - Función async a ejecutar
 * @param {Object} options - Opciones de configuración
 * @param {string} options.name - Nombre de la operación (para logs)
 * @param {number} options.maxAttempts - Máximo de intentos (default: RETRY.MAX_ATTEMPTS)
 * @param {number} options.initialDelayMs - Espera inicial en ms (default: RETRY.INITIAL_DELAY_MS)
 * @param {Function} options.shouldRetry - Función que determina si el error es retriable
 * @returns {Promise<any>} - Resultado de la función
 */
export async function withRetry(fn, options = {}) {
  const {
    name = 'operación',
    maxAttempts = RETRY.MAX_ATTEMPTS,
    initialDelayMs = RETRY.INITIAL_DELAY_MS,
    shouldRetry = isRetriableError,
  } = options;

  let lastError;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLast = attempt === maxAttempts;
      const retriable = shouldRetry(error);

      if (isLast || !retriable) {
        logger.error(`[Retry] ${name} falló definitivamente`, {
          attempt,
          maxAttempts,
          error: error.message,
          retriable,
        });
        throw error;
      }

      logger.warn(`[Retry] ${name} falló, reintentando`, {
        attempt,
        maxAttempts,
        nextRetryMs: delayMs,
        error: error.message,
      });

      await sleep(delayMs);

      // Backoff exponencial con límite máximo
      delayMs = Math.min(delayMs * RETRY.BACKOFF_FACTOR, RETRY.MAX_DELAY_MS);
    }
  }

  throw lastError;
}

// ─── Determina si un error es retriable ──────────────────────────────────────

function isRetriableError(error) {
  // Errores de red — siempre retriables
  if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') return true;
  if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') return true;

  // Errores HTTP — solo retriables si son del servidor (5xx) o rate limit (429)
  const status = error.status || error.statusCode || error.response?.status;
  if (status === 429) return true;  // Rate limit — esperar y reintentar
  if (status >= 500) return true;   // Error del servidor externo

  // Errores 4xx (400, 401, 403, 404) — no retriables, son errores de configuración
  return false;
}

// ─── Pausa async ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Wrapper con timeout ───────────────────────────────────────────────────────

/**
 * Ejecuta una función con timeout.
 * Si la función no completa en el tiempo dado, lanza un error.
 *
 * @param {Function} fn - Función async a ejecutar
 * @param {number} timeoutMs - Tiempo máximo en ms
 * @param {string} name - Nombre para el mensaje de error
 */
export async function withTimeout(fn, timeoutMs, name = 'operación') {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`[Timeout] ${name} superó los ${timeoutMs}ms`)),
      timeoutMs
    )
  );

  return Promise.race([fn(), timeoutPromise]);
}
