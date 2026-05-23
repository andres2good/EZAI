-- ═══════════════════════════════════════════════════════════════════════════
-- EZAI — Schema de Base de Datos
-- Supabase (PostgreSQL)
--
-- INSTRUCCIONES:
-- 1. Abre tu proyecto en https://app.supabase.com
-- 2. Ve a SQL Editor (ícono de base de datos en el menú izquierdo)
-- 3. Pega TODO este archivo y haz clic en "Run"
-- 4. Listo — todas las tablas quedarán creadas
--
-- Este schema es multi-tenant: cada negocio (business) tiene sus propios
-- datos completamente aislados de los demás usando Row Level Security (RLS).
-- ═══════════════════════════════════════════════════════════════════════════

-- Habilitar extensión para generar UUIDs automáticamente
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA: businesses
-- Un "business" es cada negocio cliente de EZAI.
-- Por ejemplo: "Consultorio Dr. García" es un business.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS businesses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Nombre del negocio (ej: "Consultorio Dr. García")
  name            TEXT NOT NULL,

  -- Número de teléfono asignado en Telnyx (formato E.164: +521XXXXXXXXXX)
  -- El sistema identifica el negocio por este número cuando entra una llamada
  phone_number    TEXT NOT NULL UNIQUE,

  -- Email del dueño del negocio (para el dashboard)
  email           TEXT NOT NULL UNIQUE,

  -- Configuración específica del negocio en formato JSON
  -- Incluye: nombre del doctor, dirección, precio de consulta, etc.
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Si el negocio está activo. Los inactivos no reciben llamadas.
  active          BOOLEAN NOT NULL DEFAULT true,

  -- Plan contratado (para facturación futura)
  plan            TEXT NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'enterprise')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comentario en la tabla
COMMENT ON TABLE businesses IS 'Negocios clientes de EZAI. Cada negocio tiene su propio agente y número de teléfono.';
COMMENT ON COLUMN businesses.config IS 'JSON con: doctorName, address, consultationPrice, transferPhone, timezone, etc.';

-- Índice para buscar por número de teléfono rápidamente (se hace en cada llamada entrante)
CREATE INDEX IF NOT EXISTS idx_businesses_phone ON businesses(phone_number);
CREATE INDEX IF NOT EXISTS idx_businesses_active ON businesses(active);


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA: agents
-- Configuración del agente de IA de cada negocio.
-- Un negocio puede tener diferentes agentes para diferentes propósitos.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Nombre del agente (ej: "TEST 0.1", "Recepcionista Principal")
  name            TEXT NOT NULL,

  -- Tipo de agente (por ahora solo medical_receptionist)
  type            TEXT NOT NULL DEFAULT 'medical_receptionist',

  -- Prompt personalizado adicional (por encima del prompt base)
  custom_prompt   TEXT,

  -- Voz de Cartesia a usar
  voice_id        TEXT,

  -- Idioma principal del agente
  language        TEXT NOT NULL DEFAULT 'es',

  -- Si este agente está activo para recibir llamadas
  active          BOOLEAN NOT NULL DEFAULT true,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agents IS 'Configuración de los agentes de IA. Cada negocio puede tener uno o más agentes.';

CREATE INDEX IF NOT EXISTS idx_agents_business ON agents(business_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA: calls
-- Registro completo de cada llamada telefónica.
-- Se crea al inicio de la llamada y se actualiza al terminar.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS calls (
  id                  UUID PRIMARY KEY,  -- ID generado por el servidor (no auto)
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Número que llamó (el paciente)
  from_phone          TEXT NOT NULL,

  -- Número al que llamaron (el consultorio)
  to_phone            TEXT NOT NULL,

  -- Estado de la llamada
  status              TEXT NOT NULL DEFAULT 'initiated'
                      CHECK (status IN ('initiated', 'answered', 'in_progress', 'completed', 'failed', 'transferred', 'emergency')),

  -- Duración en segundos (se llena al terminar)
  duration_seconds    INTEGER,

  -- Transcripción completa en formato JSON
  -- Array de: { role: 'patient'|'agent', text: '...', timestamp: 123 }
  transcription       JSONB,

  -- Resumen generado por Claude (se genera al terminar la llamada)
  summary             TEXT,

  -- Si se agendó una cita durante esta llamada
  appointment_created BOOLEAN NOT NULL DEFAULT false,

  -- Idioma detectado durante la llamada
  language_detected   TEXT DEFAULT 'es',

  -- URL de la grabación en Cloudflare R2
  recording_url       TEXT,

  -- Número de turnos de conversación
  messages_count      INTEGER DEFAULT 0,

  -- Si hubo una emergencia detectada
  emergency_detected  BOOLEAN NOT NULL DEFAULT false,

  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ
);

COMMENT ON TABLE calls IS 'Registro completo de todas las llamadas. Una fila por llamada.';
COMMENT ON COLUMN calls.transcription IS 'Array JSON con todos los turnos de la conversación.';
COMMENT ON COLUMN calls.summary IS 'Resumen en 2-3 oraciones generado por Claude al terminar la llamada.';

-- Índices para las consultas más frecuentes del dashboard
CREATE INDEX IF NOT EXISTS idx_calls_business      ON calls(business_id);
CREATE INDEX IF NOT EXISTS idx_calls_started_at    ON calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_business_date ON calls(business_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_status        ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_from_phone    ON calls(from_phone);


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA: patients
-- Datos básicos de pacientes que han llamado.
-- Se crea/actualiza automáticamente cuando el agente agenda una cita.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Nombre completo del paciente
  name          TEXT NOT NULL,

  -- Teléfono de contacto (en formato E.164 o como lo dio el paciente)
  phone         TEXT NOT NULL,

  -- Fecha de nacimiento (opcional — ayuda a distinguir pacientes con mismo nombre)
  birth_date    DATE,

  -- Última vez que llamó
  last_contact  TIMESTAMPTZ DEFAULT NOW(),

  -- Notas adicionales (futuro: alergias conocidas, etc.)
  notes         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un paciente se identifica por su teléfono dentro de un negocio
  UNIQUE (business_id, phone)
);

COMMENT ON TABLE patients IS 'Pacientes que han contactado al consultorio a través de EZAI.';

CREATE INDEX IF NOT EXISTS idx_patients_business ON patients(business_id);
CREATE INDEX IF NOT EXISTS idx_patients_phone    ON patients(business_id, phone);
CREATE INDEX IF NOT EXISTS idx_patients_name     ON patients(business_id, name);


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA: appointments
-- Citas agendadas por el agente.
-- Cada cita está vinculada a una llamada y a un evento en Google Calendar.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS appointments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Llamada durante la que se agendó esta cita
  call_id           UUID REFERENCES calls(id) ON DELETE SET NULL,

  -- Datos del paciente en el momento de agendar
  patient_name      TEXT NOT NULL,
  phone             TEXT NOT NULL,
  birth_date        DATE,

  -- Motivo de la consulta (en términos generales)
  reason            TEXT NOT NULL,

  -- Fecha y hora de la cita
  appointment_date  DATE NOT NULL,
  appointment_time  TIME NOT NULL,

  -- ID del evento en Google Calendar (para poder modificarlo o cancelarlo)
  google_event_id   TEXT UNIQUE,

  -- Estado de la cita
  status            TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'rescheduled', 'cancelled', 'completed', 'no_show')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE appointments IS 'Citas agendadas por el agente. Sincronizadas con Google Calendar.';
COMMENT ON COLUMN appointments.google_event_id IS 'ID del evento en Google Calendar. Se usa para reagendar o cancelar.';

CREATE INDEX IF NOT EXISTS idx_appointments_business      ON appointments(business_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date          ON appointments(business_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status        ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_google_event  ON appointments(google_event_id);
CREATE INDEX IF NOT EXISTS idx_appointments_phone         ON appointments(business_id, phone);


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA: users
-- Usuarios del dashboard web (los dueños del negocio y su equipo).
-- Supabase maneja la autenticación — esta tabla solo guarda el perfil.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Nombre para mostrar en el dashboard
  full_name     TEXT NOT NULL,

  -- Rol dentro del negocio
  role          TEXT NOT NULL DEFAULT 'owner'
                CHECK (role IN ('owner', 'admin', 'viewer')),

  -- Si el usuario está activo
  active        BOOLEAN NOT NULL DEFAULT true,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Perfiles de usuarios del dashboard. Vinculados a auth.users de Supabase.';

CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA: audit_logs
-- Registro de acciones importantes del sistema.
-- Útil para diagnóstico, soporte y cumplimiento.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE SET NULL,

  -- Qué acción ocurrió
  action        TEXT NOT NULL,

  -- De dónde viene la acción: 'agent', 'user', 'system'
  actor         TEXT NOT NULL DEFAULT 'agent',

  -- ID relacionado (call_id, appointment_id, etc.)
  entity_id     TEXT,
  entity_type   TEXT,

  -- Datos adicionales del evento en JSON
  metadata      JSONB DEFAULT '{}'::jsonb,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'Log de acciones importantes. Se usa para diagnóstico y auditoría.';

-- Solo índice por negocio y fecha — esta tabla crece rápido, menos índices es mejor
CREATE INDEX IF NOT EXISTS idx_audit_business_date ON audit_logs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action        ON audit_logs(action);


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCIÓN: actualizar updated_at automáticamente
-- En vez de actualizar updated_at manualmente en cada UPDATE,
-- esta función lo hace automáticamente via triggers.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar el trigger a todas las tablas con updated_at
CREATE OR REPLACE TRIGGER trg_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Garantiza que cada negocio solo pueda ver sus propios datos,
-- incluso si hay un bug en el código o una consulta incorrecta.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE businesses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls         ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    ENABLE ROW LEVEL SECURITY;

-- El service_role (usado por el servidor) puede ver y modificar todo
-- Los usuarios del dashboard solo pueden ver datos de su propio negocio

CREATE POLICY "service_role_all_businesses"   ON businesses    FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_agents"       ON agents        FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_calls"        ON calls         FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_patients"     ON patients      FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_appointments" ON appointments  FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_users"        ON users         FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_audit"        ON audit_logs    FOR ALL TO service_role USING (true);

-- Usuarios autenticados del dashboard solo ven datos de su negocio
CREATE POLICY "users_own_business_calls" ON calls
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "users_own_business_appointments" ON appointments
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "users_own_business_patients" ON patients
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "users_own_profile" ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());


-- ═══════════════════════════════════════════════════════════════════════════
-- DATOS DE PRUEBA
-- Un negocio de ejemplo para desarrollo.
-- Borra este bloque antes de usar en producción.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO businesses (id, name, phone_number, email, config, active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Consultorio Dr. García',
  '+5215500000000',
  'doctor@consultorio.com',
  '{
    "doctorName": "García",
    "address": "Av. Insurgentes Sur 1234, Col. Del Valle, CDMX",
    "consultationPrice": 500,
    "transferPhone": "+5215500000001",
    "timezone": "America/Mexico_City"
  }'::jsonb,
  true
)
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO agents (business_id, name, type, language, active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'TEST 0.1',
  'medical_receptionist',
  'es',
  true
)
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- VISTAS ÚTILES PARA EL DASHBOARD
-- ═══════════════════════════════════════════════════════════════════════════

-- Resumen de llamadas por negocio (para la página principal del dashboard)
CREATE OR REPLACE VIEW calls_summary AS
SELECT
  business_id,
  COUNT(*)                                          AS total_calls,
  COUNT(*) FILTER (WHERE DATE(started_at) = CURRENT_DATE) AS calls_today,
  COUNT(*) FILTER (WHERE appointment_created = true) AS appointments_created,
  COUNT(*) FILTER (WHERE emergency_detected = true)  AS emergencies_detected,
  ROUND(AVG(duration_seconds))                       AS avg_duration_seconds,
  MAX(started_at)                                    AS last_call_at
FROM calls
GROUP BY business_id;

COMMENT ON VIEW calls_summary IS 'Métricas agregadas de llamadas por negocio. Usada en el dashboard principal.';

-- Citas próximas (para mostrar en el dashboard)
CREATE OR REPLACE VIEW upcoming_appointments AS
SELECT
  a.*,
  b.name AS business_name
FROM appointments a
JOIN businesses b ON a.business_id = b.id
WHERE
  a.appointment_date >= CURRENT_DATE
  AND a.status IN ('scheduled', 'rescheduled')
ORDER BY a.appointment_date ASC, a.appointment_time ASC;

COMMENT ON VIEW upcoming_appointments IS 'Citas próximas activas. Ordenadas por fecha más cercana.';
