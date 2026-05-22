/**
 * cloudflareR2.js — Almacenamiento de grabaciones en Cloudflare R2
 *
 * Sube las grabaciones de audio de las llamadas a Cloudflare R2.
 * R2 es compatible con la API de Amazon S3, así que usamos el SDK de AWS.
 *
 * Las grabaciones expiran automáticamente a los 7 días gracias a las
 * lifecycle rules configuradas en el bucket de R2.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { RECORDINGS } from '../config/constants.js';
import logger from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

// ─── Cliente de R2 (compatible con S3) ───────────────────────────────────────

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

// ─── Subir grabación ──────────────────────────────────────────────────────────

/**
 * Descarga la grabación de Telnyx y la sube a Cloudflare R2.
 *
 * La ruta en R2 es: {businessId}/recordings/{año}/{mes}/{callId}.mp3
 * Esto facilita buscar y organizar grabaciones por negocio y fecha.
 *
 * @param {Object} options
 * @param {string} options.callId - ID único de la llamada
 * @param {string} options.businessId - ID del negocio
 * @param {string} options.sourceUrl - URL de Telnyx donde está la grabación
 * @returns {Promise<string>} - URL de la grabación en R2
 */
export async function uploadRecording({ callId, businessId, sourceUrl }) {
  logger.info('[R2] Descargando grabación de Telnyx', { callId, sourceUrl });

  return await withRetry(async () => {
    // Descargar audio de Telnyx
    const response = await fetch(sourceUrl, {
      headers: {
        'Authorization': `Bearer ${env.TELNYX_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Error descargando grabación: ${response.status}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Generar ruta del archivo en R2
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const key = `${businessId}/recordings/${year}/${month}/${callId}.mp3`;

    // Subir a R2
    await r2Client.send(new PutObjectCommand({
      Bucket: env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
      Body: audioBuffer,
      ContentType: 'audio/mpeg',
      // Metadata para identificación
      Metadata: {
        'call-id': callId,
        'business-id': businessId,
        'upload-date': now.toISOString(),
      },
    }));

    logger.info('[R2] Grabación subida exitosamente', {
      callId,
      key,
      bytes: audioBuffer.length,
    });

    // Retornar URL según configuración
    if (env.CLOUDFLARE_R2_PUBLIC_URL) {
      return `${env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
    }

    // Si no hay URL pública, generamos una URL firmada (válida 7 días)
    return await getSignedRecordingUrl(key);

  }, { name: 'Cloudflare R2 upload' });
}

// ─── URL firmada para reproducir desde el dashboard ──────────────────────────

/**
 * Genera una URL temporal y firmada para reproducir una grabación.
 * La URL expira en 7 días (igual que las grabaciones).
 *
 * @param {string} key - Ruta del archivo en R2
 * @returns {Promise<string>} - URL firmada
 */
export async function getSignedRecordingUrl(key) {
  const command = new GetObjectCommand({
    Bucket: env.CLOUDFLARE_R2_BUCKET_NAME,
    Key: key,
  });

  const url = await getSignedUrl(r2Client, command, {
    expiresIn: RECORDINGS.EXPIRY_DAYS * 24 * 60 * 60, // En segundos
  });

  return url;
}

/**
 * Sube un buffer de audio directamente (para grabaciones generadas en memoria).
 *
 * @param {Object} options
 * @param {string} options.callId
 * @param {string} options.businessId
 * @param {Buffer} options.audioBuffer
 * @param {string} options.format - 'mp3' | 'wav'
 */
export async function uploadAudioBuffer({ callId, businessId, audioBuffer, format = 'mp3' }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const key = `${businessId}/recordings/${year}/${month}/${callId}.${format}`;

  const contentType = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';

  return await withRetry(async () => {
    await r2Client.send(new PutObjectCommand({
      Bucket: env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
      Body: audioBuffer,
      ContentType: contentType,
      Metadata: {
        'call-id': callId,
        'business-id': businessId,
      },
    }));

    logger.info('[R2] Audio subido', { callId, key, bytes: audioBuffer.length });

    return env.CLOUDFLARE_R2_PUBLIC_URL
      ? `${env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`
      : await getSignedRecordingUrl(key);
  }, { name: 'R2 audio upload' });
}
