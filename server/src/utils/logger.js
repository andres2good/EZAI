/**
 * logger.js — Sistema de logs estructurados con Winston
 *
 * Registra todos los eventos importantes del sistema en formato JSON.
 * En desarrollo muestra colores en consola para facilitar la lectura.
 * En producción guarda todo en archivos con rotación automática.
 *
 * Uso:
 *   import logger from './utils/logger.js';
 *   logger.info('Llamada iniciada', { callId: '123', phone: '+521...' });
 *   logger.error('Falló Deepgram', { error: err.message, callId: '123' });
 */

import winston from 'winston';
import { env } from '../config/env.js';
import { mkdirSync } from 'fs';

// Crear directorio de logs si no existe
try {
  mkdirSync(env.LOG_DIR, { recursive: true });
} catch {
  // Si ya existe, no pasa nada
}

// ─── Formato para desarrollo (legible en consola) ─────────────────────────────

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? '\n  ' + JSON.stringify(meta, null, 2).replace(/\n/g, '\n  ')
      : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

// ─── Formato para producción (JSON estructurado) ──────────────────────────────

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// ─── Transportes (dónde se escriben los logs) ─────────────────────────────────

const transports = [];

// Siempre mostrar en consola
transports.push(
  new winston.transports.Console({
    format: env.IS_PRODUCTION ? prodFormat : devFormat,
  })
);

// En producción, también guardar en archivos
if (env.IS_PRODUCTION) {
  // Todos los logs de nivel info y superior
  transports.push(
    new winston.transports.File({
      filename: `${env.LOG_DIR}/app.log`,
      format: prodFormat,
      maxsize: 10 * 1024 * 1024, // 10MB por archivo
      maxFiles: 5,               // Máximo 5 archivos (rotación automática)
    })
  );

  // Solo errores en un archivo separado para fácil diagnóstico
  transports.push(
    new winston.transports.File({
      filename: `${env.LOG_DIR}/errors.log`,
      level: 'error',
      format: prodFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

// ─── Crear logger ─────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  transports,
});

// ─── Helper para logs de llamadas ─────────────────────────────────────────────
// Agrega siempre el callId y businessId al contexto de los logs

export function callLogger(callId, businessId) {
  return {
    info: (message, meta = {}) => logger.info(message, { callId, businessId, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { callId, businessId, ...meta }),
    error: (message, meta = {}) => logger.error(message, { callId, businessId, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { callId, businessId, ...meta }),
  };
}

export default logger;
