# STACK TECNOLÓGICO — EZAI TEST 0.1

Descripción de cada servicio: qué hace, por qué lo elegimos y cuánto cuesta.

---

## 1. TELNYX — Telefonía

**¿Qué hace?**  
Proporciona números de teléfono reales y maneja todas las llamadas entrantes y salientes. Cuando alguien llama al número del consultorio, Telnyx recibe la llamada y nos manda el audio por WebSocket. Nosotros procesamos ese audio y le mandamos el audio de respuesta de regreso.

**¿Por qué Telnyx y no Twilio?**  
- Precio: ~70% más barato que Twilio
- Latencia más baja para audio en tiempo real
- WebSocket nativo para streaming de audio (Twilio requiere MediaStreams que agrega latencia)
- Mejor soporte para números en México y Latinoamérica

**Funciones que usamos:**
- Números de teléfono (DID) — uno por cliente
- Call Control API — para controlar la llamada (responder, colgar, transferir)
- WebSocket Media Streaming — para enviar/recibir audio en tiempo real
- Webhooks — para recibir eventos de la llamada

**Costo estimado:**
| Concepto | Precio |
|----------|--------|
| Número de teléfono | ~$1 USD/mes por número |
| Llamadas entrantes | ~$0.004 USD/minuto |
| Llamadas salientes | ~$0.008 USD/minuto |

**Variables de entorno necesarias:**
- `TELNYX_API_KEY`
- `TELNYX_PUBLIC_KEY` (para verificar webhooks)
- `TELNYX_APP_ID` (ID de la aplicación de telefonía)

---

## 2. DEEPGRAM — Speech-to-Text

**¿Qué hace?**  
Convierte el audio del paciente a texto en tiempo real. Mientras el paciente habla, Deepgram va transcribiendo palabra por palabra con latencia de ~150-200ms usando WebSocket.

**¿Por qué Deepgram?**  
- Modelo Nova-3: el más preciso para español en tiempo real
- Latencia más baja del mercado (~150ms vs ~400ms de Whisper)
- Streaming real (no espera a que el usuario termine de hablar)
- Soporte nativo para español mexicano
- Detección automática de fin de enunciado (endpointing)

**Funciones que usamos:**
- Nova-3 model con idioma `es` (español)
- Streaming WebSocket en tiempo real
- Endpointing — detecta cuando el paciente terminó de hablar
- Diarización opcional (distinguir hablantes si hay más de uno)

**Costo estimado:**
| Concepto | Precio |
|----------|--------|
| Nova-3 en tiempo real | ~$0.0043 USD/minuto |
| 1,000 minutos/mes | ~$4.30 USD |
| 10,000 minutos/mes | ~$43 USD |

**Variables de entorno necesarias:**
- `DEEPGRAM_API_KEY`

---

## 3. CLAUDE — LLM (Cerebro del Agente)

**¿Qué hace?**  
Es la inteligencia del agente. Recibe el texto transcrito por Deepgram, lo entiende en contexto, razona sobre la intención del paciente y genera una respuesta apropiada. También toma decisiones: ¿agendar cita? ¿emergencia? ¿transferir a humano?

**¿Por qué Claude Sonnet 4.6?**  
- Mejor relación calidad/costo del mercado (vs GPT-4o)
- Excelente español natural, no robótico
- Ventana de contexto grande (mantiene la conversación completa)
- Streaming de respuesta para reducir latencia percibida
- Capacidad de tool use para llamar a APIs (Google Calendar)
- Prompt caching para reducir costo en system prompts largos

**Funciones que usamos:**
- Streaming de respuesta (tokens en tiempo real)
- Tool use / Function calling (para Google Calendar)
- System prompt con las instrucciones del agente
- Historial de conversación en cada turno

**Costo estimado (con prompt caching):**
| Concepto | Precio |
|----------|--------|
| Input tokens (sin cache) | $3 USD / 1M tokens |
| Input tokens (con cache) | $0.30 USD / 1M tokens |
| Output tokens | $15 USD / 1M tokens |
| Costo estimado por llamada de 5 min | ~$0.02-0.05 USD |

**Variables de entorno necesarias:**
- `ANTHROPIC_API_KEY`
- `CLAUDE_MODEL` (default: `claude-sonnet-4-6`)

---

## 4. CARTESIA — Text-to-Speech

**¿Qué hace?**  
Convierte el texto de respuesta de Claude en voz hablada natural. Lo hace en streaming: no espera a tener toda la respuesta, empieza a generar audio desde el primer chunk de texto.

**¿Por qué Cartesia?**  
- Latencia de ~40ms al primer chunk de audio (la más baja del mercado)
- Voz más natural y menos robótica que ElevenLabs o Google TTS
- Sonic-3 soporta español mexicano con acento natural
- Streaming real: reduce latencia percibida significativamente
- Precio competitivo

**Funciones que usamos:**
- Sonic-3 model
- Streaming de audio en tiempo real
- Voz en español mexicano (femenina, cálida)
- Control de velocidad y tono

**Costo estimado:**
| Concepto | Precio |
|----------|--------|
| Generación de audio | ~$0.0180 USD por 1,000 caracteres |
| Promedio por respuesta (~100 chars) | ~$0.0018 USD |
| 1,000 respuestas/mes | ~$1.80 USD |

**Variables de entorno necesarias:**
- `CARTESIA_API_KEY`
- `CARTESIA_VOICE_ID` (ID de la voz seleccionada)

---

## 5. GOOGLE CALENDAR API — Agendado de Citas

**¿Qué hace?**  
Permite al agente consultar la disponibilidad real del médico y crear, modificar o cancelar citas directamente en su Google Calendar. El médico ve sus citas en su Google Calendar normal.

**¿Por qué Google Calendar?**  
- El médico ya lo usa (curva de aprendizaje cero)
- API gratuita dentro de los límites normales
- Confiable y ampliamente documentada
- Sincronización en tiempo real

**Funciones que usamos:**
- `calendar.events.list` — consultar disponibilidad
- `calendar.events.insert` — crear cita nueva
- `calendar.events.update` — reagendar cita
- `calendar.events.delete` — cancelar cita
- Service Account para autenticación sin OAuth interactivo

**Costo:**  
Gratuito para el volumen que manejamos (límite: 1,000,000 requests/día).

**Variables de entorno necesarias:**
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON completo en base64)
- `GOOGLE_CALENDAR_ID` (ID del calendario del médico)

---

## 6. SUPABASE — Base de Datos

**¿Qué hace?**  
Almacena toda la información del sistema: negocios registrados, configuración de agentes, registro de llamadas con transcripciones, citas agendadas, datos de pacientes y usuarios del dashboard.

**¿Por qué Supabase?**  
- PostgreSQL con API REST automática
- Autenticación incluida (para el dashboard)
- Gratuito hasta cierto volumen
- Dashboard web para ver datos sin código
- Row Level Security (RLS) para multi-tenant seguro
- Funciones en tiempo real (útil para el dashboard)

**Tablas que usamos:**
- `businesses` — negocios clientes
- `agents` — configuración de agentes
- `calls` — historial de llamadas
- `appointments` — citas agendadas
- `patients` — datos de pacientes
- `users` — usuarios del dashboard
- `audit_logs` — registro de acciones importantes

**Costo estimado:**
| Plan | Precio | Límites |
|------|--------|---------|
| Free | $0/mes | 500MB DB, 50,000 requests/mes |
| Pro | $25/mes | 8GB DB, requests ilimitados |

**Variables de entorno necesarias:**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## 7. CLOUDFLARE R2 — Almacenamiento de Grabaciones

**¿Qué hace?**  
Almacena las grabaciones de audio de cada llamada. Las grabaciones expiran automáticamente a los 7 días para ahorrar espacio y cumplir con privacidad.

**¿Por qué Cloudflare R2?**  
- Sin costo de egress (descargar los archivos es gratis)
- Compatible con S3 API (fácil integración)
- Más barato que AWS S3 para almacenamiento puro
- Object lifecycle rules para expiración automática de 7 días

**Funciones que usamos:**
- PUT de archivos de audio (al terminar cada llamada)
- Object lifecycle: expiración a 7 días automática
- Signed URLs para reproducción segura desde el dashboard

**Costo estimado:**
| Concepto | Precio |
|----------|--------|
| Almacenamiento | $0.015 USD/GB/mes |
| Operaciones | $4.50 USD / millón de operaciones |
| Egress | $0 (gratis) |
| 1,000 llamadas de 5 min (audio ~10MB c/u) | ~$0.15 USD/mes |

**Variables de entorno necesarias:**
- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET_NAME`
- `CLOUDFLARE_R2_PUBLIC_URL`

---

## 8. NEXT.JS — Dashboard del Cliente

**¿Qué hace?**  
Interfaz web donde el cliente (el consultorio médico) puede ver todas las llamadas, escuchar grabaciones, leer transcripciones y configurar su agente.

**¿Por qué Next.js?**  
- Framework React maduro y bien documentado
- Server-side rendering para mejor performance
- API routes integradas
- Fácil despliegue en Vercel o Hostinger

**Páginas del dashboard:**
- `/login` — autenticación
- `/` — métricas del día (llamadas, citas agendadas)
- `/calls` — historial de llamadas con grabaciones y transcripciones
- `/settings` — configuración del agente
- `/reports` — estadísticas por período

---

## 9. HOSTINGER — Servidor de Producción

**¿Qué hace?**  
Aloja el servidor Node.js en producción. Es el servidor físico donde corre el pipeline de voz.

**Especificaciones recomendadas:**
- VPS mínimo: 2 vCPU, 4GB RAM
- Sistema operativo: Ubuntu 22.04 LTS
- Node.js 20 LTS
- PM2 para gestión de procesos
- Nginx como reverse proxy

**Costo estimado:**
| Plan | Precio |
|------|--------|
| VPS básico | ~$10-15 USD/mes |

---

## Costo Total Estimado (por mes, escala pequeña)

| Servicio | Costo estimado |
|----------|---------------|
| Telnyx (1 número + 500 min) | ~$3 USD |
| Deepgram (500 min) | ~$2.15 USD |
| Claude API (500 llamadas) | ~$10-25 USD |
| Cartesia (500 llamadas) | ~$1 USD |
| Google Calendar | $0 |
| Supabase | $0 (Free tier) |
| Cloudflare R2 | ~$0.15 USD |
| Hostinger VPS | ~$12 USD |
| **TOTAL** | **~$28-43 USD/mes** |

*A mayor volumen, el costo por llamada baja significativamente.*
