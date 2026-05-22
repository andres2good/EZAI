# ARQUITECTURA TÉCNICA — EZAI TEST 0.1

## Flujo Completo de una Llamada

Este documento describe exactamente qué pasa, técnicamente, desde que un paciente marca el número hasta que cuelga.

---

## Diagrama de Flujo

```
PACIENTE
   │
   │ marca el número de teléfono del consultorio
   ▼
┌─────────────────────────────────────────────────────┐
│  TELNYX (Telefonía)                                 │
│  - Recibe la llamada entrante                       │
│  - Crea un Call Control ID único                    │
│  - Envía webhook POST a nuestro servidor            │
│  - Abre WebSocket bidireccional para audio          │
└─────────────────────────┬───────────────────────────┘
                          │ webhook: call.initiated
                          ▼
┌─────────────────────────────────────────────────────┐
│  CALL MANAGER (servidor Node.js)                    │
│  - Registra la llamada en Supabase                  │
│  - Inicia el pipeline de voz                        │
│  - Responde con saludo inicial                      │
└──────────┬──────────────────────────┬───────────────┘
           │ audio en tiempo real      │
           ▼                          │
┌──────────────────────┐              │
│  DEEPGRAM Nova-3     │              │
│  (Speech-to-Text)    │              │
│  - WebSocket abierto │              │
│  - Modelo: Nova-3    │              │
│  - Modo: streaming   │              │
│  - Transcribe audio  │              │
│    a texto en ~200ms │              │
└──────────┬───────────┘              │
           │ texto transcrito          │
           ▼                          │
┌──────────────────────────────────────────────────┐
│  CLAUDE Sonnet 4.6 (LLM — Cerebro del Agente)    │
│  - Recibe: texto del paciente + historial         │
│  - System prompt: medicalReceptionist.js          │
│  - Razona sobre la intención del paciente         │
│  - Decide: responder / agendar / emergencia       │
│  - Si agenda: llama a Google Calendar API         │
│  - Genera respuesta en texto con streaming        │
│  - Latencia: ~300-400ms                           │
└──────────┬───────────────────────────────────────┘
           │ texto de respuesta (streaming)
           ▼
┌──────────────────────────────────────────────────┐
│  CARTESIA Sonic-3 (Text-to-Speech)               │
│  - Recibe texto en chunks (streaming)             │
│  - Convierte a audio con voz natural              │
│  - Streaming a ~40ms de latencia                 │
│  - Voz: español mexicano femenino / cálido        │
└──────────┬───────────────────────────────────────┘
           │ audio generado
           ▼
┌──────────────────────────────────────────────────┐
│  TELNYX (de regreso)                             │
│  - Recibe el audio de Cartesia                   │
│  - Lo reproduce en tiempo real al paciente       │
└──────────────────────────────────────────────────┘

           [La conversación continúa en loop hasta que cuelga]

           │ al colgar
           ▼
┌──────────────────────────────────────────────────┐
│  POST-LLAMADA (asíncrono)                        │
│  - Claude genera resumen de la llamada           │
│  - Se guarda en Supabase:                        │
│    · duración total                              │
│    · transcripción completa                      │
│    · resumen generado por Claude                 │
│    · si se agendó cita (boolean)                 │
│    · idioma detectado                            │
│    · número del paciente                         │
│  - Grabación de audio sube a Cloudflare R2       │
│    (expiración automática en 7 días)             │
└──────────────────────────────────────────────────┘
```

---

## Latencia Target por Componente

| Componente | Latencia esperada | Máximo aceptable |
|------------|------------------|-----------------|
| Telnyx → servidor | ~50ms | 100ms |
| Deepgram STT | ~150-200ms | 300ms |
| Claude LLM (primer token) | ~300-400ms | 500ms |
| Cartesia TTS (primer chunk) | ~40ms | 100ms |
| **Total end-to-end** | **~500-650ms** | **800ms** |

---

## Manejo de Casos Especiales

### Barge-in (Interrupción)
Cuando el paciente habla mientras el agente está respondiendo:
1. Telnyx detecta audio entrante
2. Se cancela el TTS en curso inmediatamente
3. Deepgram procesa lo que dijo el paciente
4. El pipeline reinicia desde Claude con el nuevo input

### Silencio prolongado
Si el paciente no habla por más de 8 segundos:
1. El agente dice: *"¿Sigue ahí? ¿En qué le puedo ayudar?"*
2. Si no responde en otros 10 segundos: *"Voy a terminar la llamada. Si necesita ayuda, no dude en llamarnos."*
3. Se cuelga y se registra como "llamada sin respuesta"

### Error en cualquier servicio
Si cualquier API externa falla:
1. Se registra el error en logs con timestamp y contexto
2. El sistema intenta un reintento automático (máximo 3 veces)
3. Si sigue fallando, el agente dice: *"Estoy teniendo un problema técnico. Por favor llame de nuevo en unos minutos."*
4. La llamada se cierra limpiamente
5. El error se registra en Supabase para diagnóstico

### Emergencia médica
Si el paciente menciona síntomas de emergencia:
1. Claude detecta las palabras clave del protocolo
2. Interrumpe cualquier flujo en curso
3. Responde inmediatamente: *"Esto suena urgente. Por favor llame al 911 ahora mismo o diríjase a urgencias más cercanas de inmediato."*
4. No intenta agendar, no hace preguntas adicionales
5. Registra el evento como EMERGENCY en Supabase

---

## Arquitectura Multi-Tenant

Cada negocio cliente tiene:
- Su propio número de teléfono en Telnyx
- Su propia configuración de agente en Supabase (`agents` table)
- Su propio system prompt personalizado
- Sus propias grabaciones en Cloudflare R2 (prefijo por `business_id`)
- Sus propios usuarios en el dashboard

Un mismo servidor Node.js atiende a todos los clientes. El `business_id` se determina por el número de teléfono al que entró la llamada.

---

## WebSocket vs HTTP

| Comunicación | Protocolo | Por qué |
|-------------|-----------|---------|
| Telnyx → Servidor (eventos) | HTTP Webhook | Eventos discretos (inicio, fin de llamada) |
| Telnyx ↔ Servidor (audio) | WebSocket | Audio continuo bidireccional en tiempo real |
| Servidor → Deepgram | WebSocket | Audio streaming en tiempo real |
| Servidor → Cartesia | HTTP + Streaming | Chunks de audio en respuesta |
| Servidor → Claude | HTTP + Streaming | Tokens en respuesta |
| Servidor → Supabase | HTTP (REST) | Operaciones CRUD estándar |
| Servidor → Google Calendar | HTTP (REST) | Consultas y creación de eventos |
| Servidor → Cloudflare R2 | HTTP (S3 API) | Subida de archivos al terminar |
