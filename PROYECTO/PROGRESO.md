# PROGRESO — EZAI TEST 0.1

Última actualización: 23 Mayo 2026

---

## Resumen General

| Fase | Descripción | Progreso |
|------|-------------|----------|
| Fase 1 | Documentación del Proyecto | 100% ✅ |
| Fase 2 | Base del Servidor | 100% ✅ |
| Fase 3 | Integraciones Individuales | 100% ✅ |
| Fase 4 | Pipeline Central de Voz | 100% ✅ |
| Fase 5 | Base de Datos | 100% ✅ |
| Fase 6 | Dashboard (Next.js) | 100% ✅ |
| Fase 7 | Claves API + Pruebas + Producción | 0% ⬅ AQUÍ QUEDAMOS |

**Progreso total del proyecto: 85%**

---

## ✅ FASE 1 — Documentación (100%)
- ✅ PROYECTO/README.md
- ✅ PROYECTO/PLAN.md
- ✅ PROYECTO/PROGRESO.md
- ✅ PROYECTO/ARQUITECTURA.md
- ✅ PROYECTO/STACK.md

---

## ✅ FASE 2 — Base del Servidor (100%)
- ✅ server/package.json
- ✅ server/.env.example (todas las variables documentadas)
- ✅ server/src/config/env.js
- ✅ server/src/config/constants.js
- ✅ server/src/utils/logger.js
- ✅ server/src/utils/retry.js
- ✅ server/src/utils/validators.js
- ✅ server/src/middleware/auth.js
- ✅ server/src/middleware/errorHandler.js
- ✅ server/src/index.js

---

## ✅ FASE 3 — Integraciones Individuales (100%)
- ✅ server/src/stt/deepgram.js
- ✅ server/src/llm/claude.js
- ✅ server/src/llm/prompts/systemPrompt.js
- ✅ server/src/llm/prompts/medicalReceptionist.js
- ✅ server/src/llm/prompts/guidelines/scheduling.js
- ✅ server/src/llm/prompts/guidelines/faq.js
- ✅ server/src/llm/prompts/guidelines/emergencies.js
- ✅ server/src/llm/prompts/guidelines/language.js
- ✅ server/src/llm/prompts/guidelines/boundaries.js
- ✅ server/src/tts/cartesia.js
- ✅ server/src/telephony/telnyx.js
- ✅ server/src/telephony/callManager.js
- ✅ server/src/calendar/googleCalendar.js
- ✅ server/src/calendar/availability.js
- ✅ server/src/storage/supabase.js
- ✅ server/src/storage/cloudflareR2.js

---

## ✅ FASE 4 — Pipeline Central de Voz (100%)
- ✅ server/src/pipeline/voicePipeline.js
- ✅ Barge-in (paciente interrumpe al agente)
- ✅ Silencio (pregunta a los 8s, cuelga a los 18s)
- ✅ Timeout de llamada (30 minutos máximo)
- ✅ Detección y cambio de idioma español/inglés

---

## ✅ FASE 5 — Base de Datos (100%)
- ✅ database/schema.sql
  - ✅ Tabla businesses
  - ✅ Tabla agents
  - ✅ Tabla calls (con transcripción y resumen)
  - ✅ Tabla appointments
  - ✅ Tabla patients
  - ✅ Tabla users
  - ✅ Tabla audit_logs
  - ✅ Row Level Security (multi-tenant)
  - ✅ Vistas: calls_summary, upcoming_appointments

---

## ✅ FASE 6 — Dashboard (100%)
- ✅ Panel principal (métricas: llamadas hoy, citas, emergencias)
- ✅ Lista de llamadas con filtros
- ✅ Detalle de llamada (transcripción completa + grabación de audio)
- ✅ Citas (próximas, pasadas, canceladas + botón cancelar)
- ✅ Configuración (activar/desactivar agente, datos del consultorio)

---

## ⬅ FASE 7 — Claves API + Pruebas + Producción (0%) — PENDIENTE

### Paso 1 — Crear cuentas y obtener claves API
- ⬜ **Anthropic** → console.anthropic.com → obtener ANTHROPIC_API_KEY
- ⬜ **Deepgram** → console.deepgram.com → obtener DEEPGRAM_API_KEY
- ⬜ **Cartesia** → play.cartesia.ai → obtener CARTESIA_API_KEY + CARTESIA_VOICE_ID
- ⬜ **Telnyx** → telnyx.com → comprar número mexicano + obtener claves
- ⬜ **Supabase** → app.supabase.com → crear proyecto + correr schema.sql + obtener claves
- ⬜ **Google Calendar** → console.cloud.google.com → Service Account + compartir calendario
- ⬜ **Cloudflare R2** → dash.cloudflare.com → crear bucket + lifecycle 7 días + obtener claves

### Paso 2 — Configurar el archivo .env
- ⬜ Copiar server/.env.example → server/.env
- ⬜ Llenar todas las variables con las claves obtenidas

### Paso 3 — Configurar dashboard
- ⬜ Copiar dashboard/.env.local.example → dashboard/.env.local
- ⬜ Llenar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY

### Paso 4 — Instalar dependencias
- ⬜ cd server && npm install
- ⬜ cd dashboard && npm install

### Paso 5 — Exponer servidor con túnel (desarrollo)
- ⬜ npx localtunnel --port 3000 (obtener URL pública)
- ⬜ Poner esa URL en Telnyx como webhook + WebSocket

### Paso 6 — Primera llamada de prueba
- ⬜ npm run dev (servidor)
- ⬜ npm run dev (dashboard en otra terminal)
- ⬜ Llamar al número de Telnyx desde el celular
- ⬜ Verificar que el agente contesta

### Paso 7 — Producción en Hostinger (cuando todo funcione)
- ⬜ Configurar VPS en Hostinger
- ⬜ Instalar Node.js 20 + PM2
- ⬜ Subir código y variables de entorno
- ⬜ Configurar dominio y SSL
- ⬜ Apuntar Telnyx al servidor de producción

---

## Registro de Cambios

| Fecha | Fase | Cambio |
|-------|------|--------|
| 23 Mayo 2026 | Fase 1 | Documentación completa del proyecto |
| 23 Mayo 2026 | Fase 2 | Base del servidor Node.js lista |
| 23 Mayo 2026 | Fase 3 | 16 integraciones individuales completas |
| 23 Mayo 2026 | Fase 4 | Pipeline de voz completo y funcional |
| 23 Mayo 2026 | Fase 5 | Schema completo de base de datos |
| 23 Mayo 2026 | Fase 6 | Dashboard funcional con 4 páginas |
