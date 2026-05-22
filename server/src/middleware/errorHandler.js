/**
 * errorHandler.js — Manejo global de errores
 *
 * Captura todos los errores no manejados del servidor Express.
 * Garantiza que:
 *   1. Ningún error bloquee o trunque el servidor
 *   2. Todos los errores se registren con contexto suficiente para debuggear
 *   3. El cliente siempre recibe una respuesta JSON consistente
 *   4. Los detalles internos nunca se exponen en producción
 */

import logger from '../utils/logger.js';
import { env } from '../config/env.js';

// ─── Middleware de manejo de errores (4 parámetros = Express lo reconoce) ─────

export function errorHandler(err, req, res, next) {
  // Determinar código HTTP del error
  const status = err.status || err.statusCode || 500;

  // Log completo del error para diagnóstico interno
  logger.error('[ErrorHandler] Error no manejado', {
    status,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined,
  });

  // Respuesta al cliente — nunca exponer detalles internos en producción
  const response = {
    error: {
      message: env.IS_PRODUCTION
        ? getPublicMessage(status)
        : err.message,
    },
  };

  // En desarrollo, incluir el stack trace para facilitar debugging
  if (!env.IS_PRODUCTION && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(status).json(response);
}

// ─── Middleware para rutas no encontradas ─────────────────────────────────────

export function notFound(req, res) {
  logger.warn('[ErrorHandler] Ruta no encontrada', {
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  res.status(404).json({
    error: { message: `Ruta no encontrada: ${req.method} ${req.path}` },
  });
}

// ─── Manejo de errores no capturados a nivel de proceso ───────────────────────

export function setupProcessErrorHandlers() {
  // Promesas rechazadas sin .catch()
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('[Process] Promise rechazada sin manejador', {
      reason: reason?.message || String(reason),
      stack: reason?.stack,
    });
    // No cerramos el proceso — registramos y seguimos
  });

  // Errores síncronos no capturados
  process.on('uncaughtException', (error) => {
    logger.error('[Process] Excepción no capturada', {
      message: error.message,
      stack: error.stack,
    });
    // Este sí es fatal — cerramos limpiamente
    process.exit(1);
  });

  // Señal de cierre limpio (Ctrl+C o systemd stop)
  process.on('SIGTERM', () => {
    logger.info('[Process] Señal SIGTERM recibida — cerrando servidor limpiamente');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('[Process] Señal SIGINT recibida — cerrando servidor');
    process.exit(0);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Mensajes genéricos seguros para el cliente en producción
function getPublicMessage(status) {
  const messages = {
    400: 'Solicitud inválida',
    401: 'No autorizado',
    403: 'Acceso denegado',
    404: 'No encontrado',
    429: 'Demasiadas solicitudes, intente más tarde',
    500: 'Error interno del servidor',
    502: 'Servicio externo no disponible',
    503: 'Servicio temporalmente no disponible',
  };
  return messages[status] || 'Error del servidor';
}

// Elimina campos sensibles antes de loggear el body
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const sensitive = ['password', 'token', 'key', 'secret', 'apiKey', 'api_key'];
  const sanitized = { ...body };
  for (const field of sensitive) {
    if (sanitized[field]) sanitized[field] = '[REDACTED]';
  }
  return sanitized;
}
