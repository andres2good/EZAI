# EZAI — Agentes de Voz con IA para Negocios

## ¿Qué es EZAI?

EZAI es un SaaS global que permite a cualquier negocio contratar agentes de voz con inteligencia artificial que contestan y realizan llamadas telefónicas reales las 24 horas del día, los 7 días de la semana, en cualquier idioma.

No es un IVR (menú de opciones). Es un agente que habla, entiende contexto, toma decisiones y ejecuta acciones reales — como agendar una cita en Google Calendar — en tiempo real durante la llamada.

---

## Primer Agente: TEST 0.1

**Tipo:** Recepcionista médica virtual  
**Especialidad:** Consultorio de medicina general  
**Idiomas:** Español mexicano (principal) + Inglés (detección automática)  
**Estado:** En desarrollo

### ¿Qué hace TEST 0.1?

- Contesta llamadas entrantes al consultorio 24/7
- Agenda citas nuevas consultando disponibilidad real en Google Calendar
- Confirma, reagenda y cancela citas existentes
- Responde preguntas frecuentes (precio, ubicación, horarios, seguros)
- Detecta emergencias médicas y activa protocolo inmediato (911)
- Transfiere a humano cuando la situación lo requiere
- Cambia de español a inglés automáticamente según el paciente

### ¿Qué NUNCA hace TEST 0.1?

- Dar diagnósticos médicos
- Recomendar medicamentos o dosis
- Minimizar síntomas de emergencia
- Compartir información de otros pacientes
- Confirmar a terceros si alguien es paciente del consultorio

---

## Modelo de Negocio

Cada negocio que contrata EZAI recibe:
- Un número telefónico real (vía Telnyx)
- Un agente configurado para su industria y necesidades específicas
- Un dashboard para ver llamadas, citas y reportes
- Grabaciones de llamadas almacenadas por 7 días
- Configuración completamente aislada de otros clientes (multi-tenant)

---

## Arquitectura en una línea

```
Llamada entrante → Telnyx → Deepgram (voz→texto) → Claude (razonamiento) → Cartesia (texto→voz) → Respuesta al paciente
```

Todo en menos de 800ms de latencia end-to-end.

---

## Stack Tecnológico

| Servicio | Función |
|----------|---------|
| Telnyx | Telefonía real (llamadas entrantes/salientes) |
| Deepgram Nova-3 | Speech-to-Text en tiempo real |
| Claude Sonnet 4.6 | Cerebro del agente (razonamiento y decisiones) |
| Cartesia Sonic-3 | Text-to-Speech con streaming a 40ms |
| Google Calendar API | Agendar citas reales |
| Supabase | Base de datos (llamadas, citas, configuración) |
| Cloudflare R2 | Grabaciones de audio (expiración automática 7 días) |
| Next.js | Dashboard del cliente |
| Hostinger | Servidor de producción |

---

## Estructura del Proyecto

```
ezai/
├── PROYECTO/          ← Documentación (estás aquí)
├── server/            ← Backend Node.js (pipeline de voz)
├── dashboard/         ← Frontend Next.js (panel del cliente)
└── database/          ← Schema SQL de Supabase
```

---

## Equipo

Proyecto desarrollado por EZAI.  
Versión actual: TEST 0.1  
Fecha de inicio: Mayo 2026
