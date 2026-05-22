# PLAN DE DESARROLLO — EZAI TEST 0.1

Cada fase debe ser aprobada antes de continuar a la siguiente.  
Las tareas marcadas con ✅ están completas. Las con ⬜ están pendientes.

---

## FASE 1 — Documentación del Proyecto
> Objetivo: Tener claridad total antes de escribir código.

- [x] README.md — descripción general del proyecto
- [x] PLAN.md — este archivo
- [x] PROGRESO.md — seguimiento de avance por fase
- [x] ARQUITECTURA.md — flujo técnico completo de una llamada
- [x] STACK.md — cada servicio con función y costo estimado

---

## FASE 2 — Base del Servidor
> Objetivo: Servidor Node.js corriendo con configuración lista.

- [ ] `server/package.json` — dependencias del proyecto
- [ ] `server/.env.example` — todas las variables de entorno documentadas
- [ ] `server/src/config/env.js` — carga y valida variables de entorno
- [ ] `server/src/config/constants.js` — constantes globales del sistema
- [ ] `server/src/utils/logger.js` — sistema de logs estructurados
- [ ] `server/src/utils/retry.js` — lógica de reintentos para llamadas a APIs
- [ ] `server/src/utils/validators.js` — validación de datos de entrada
- [ ] `server/src/middleware/auth.js` — autenticación de webhooks y requests
- [ ] `server/src/middleware/errorHandler.js` — manejo global de errores
- [ ] `server/src/index.js` — punto de entrada del servidor

---

## FASE 3 — Integraciones Individuales
> Objetivo: Cada servicio externo funcionando de forma independiente.

### 3A — Speech-to-Text
- [ ] `server/src/stt/deepgram.js` — conexión WebSocket con Deepgram Nova-3, streaming en tiempo real

### 3B — LLM (Cerebro del Agente)
- [ ] `server/src/llm/claude.js` — cliente Claude API con streaming
- [ ] `server/src/llm/prompts/systemPrompt.js` — constructor del system prompt dinámico
- [ ] `server/src/llm/prompts/medicalReceptionist.js` — configuración completa del agente
- [ ] `server/src/llm/prompts/guidelines/scheduling.js` — reglas de agendado
- [ ] `server/src/llm/prompts/guidelines/faq.js` — preguntas frecuentes
- [ ] `server/src/llm/prompts/guidelines/emergencies.js` — protocolo de emergencias
- [ ] `server/src/llm/prompts/guidelines/language.js` — reglas de detección de idioma
- [ ] `server/src/llm/prompts/guidelines/boundaries.js` — límites del agente

### 3C — Text-to-Speech
- [ ] `server/src/tts/cartesia.js` — síntesis de voz con Cartesia Sonic-3, streaming a 40ms

### 3D — Telefonía
- [ ] `server/src/telephony/telnyx.js` — webhook de Telnyx, manejo de llamadas entrantes/salientes
- [ ] `server/src/telephony/callManager.js` — gestión del estado de llamadas activas

### 3E — Calendario
- [ ] `server/src/calendar/googleCalendar.js` — integración con Google Calendar API
- [ ] `server/src/calendar/availability.js` — consulta de disponibilidad y creación de eventos

### 3F — Almacenamiento
- [ ] `server/src/storage/supabase.js` — cliente Supabase, operaciones CRUD
- [ ] `server/src/storage/cloudflareR2.js` — subida de grabaciones con expiración de 7 días

---

## FASE 4 — Pipeline Central de Voz
> Objetivo: Conectar todas las integraciones en un flujo unificado con latencia < 800ms.

- [ ] `server/src/pipeline/voicePipeline.js` — orquestador principal que une STT → LLM → TTS
- [ ] Pruebas de latencia end-to-end
- [ ] Manejo de interrupciones (barge-in — cuando el paciente interrumpe al agente)
- [ ] Manejo de silencio y timeouts

---

## FASE 5 — Base de Datos
> Objetivo: Schema completo en Supabase listo para producción.

- [ ] `database/schema.sql` — todas las tablas con índices y comentarios
  - [ ] Tabla `businesses` — negocios multi-tenant
  - [ ] Tabla `agents` — configuración de agentes por negocio
  - [ ] Tabla `calls` — registro de llamadas con transcripción y resumen
  - [ ] Tabla `appointments` — citas agendadas
  - [ ] Tabla `patients` — datos básicos de pacientes
  - [ ] Tabla `users` — usuarios del dashboard
  - [ ] Tabla `audit_logs` — log de acciones importantes

---

## FASE 6 — Dashboard (Next.js)
> Objetivo: Panel web donde el cliente puede ver sus llamadas y configurar el agente.

- [ ] Autenticación (login / registro)
- [ ] Vista principal — métricas del día
- [ ] Vista de llamadas — lista con grabación, transcripción y resumen
- [ ] Vista de configuración del agente
- [ ] Vista de reportes — estadísticas por período

---

## FASE 7 — Pruebas y Producción
> Objetivo: Sistema probado y desplegado en Hostinger.

- [ ] Pruebas de llamada real con número de Telnyx
- [ ] Pruebas de carga (múltiples llamadas simultáneas)
- [ ] Configuración del servidor en Hostinger
- [ ] Variables de entorno en producción
- [ ] Monitoreo de errores activo
- [ ] Documentación de despliegue

---

## Notas

- **No saltar fases.** Cada fase construye sobre la anterior.
- **Aprobar antes de continuar.** Al terminar cada fase, revisar y dar el visto bueno.
- **Errores primero.** Si algo falla, arreglarlo antes de avanzar.
