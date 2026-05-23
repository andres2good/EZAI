'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Shell } from '../page';

const DEFAULT_BUSINESS_ID = 'a0000000-0000-0000-0000-000000000001';

export default function SettingsPage() {
  const [config, setConfig] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [agentActive, setAgentActive] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: biz } = await supabase.from('businesses').select('*').eq('id', DEFAULT_BUSINESS_ID).single();
      const { data: ag } = await supabase.from('agents').select('*').eq('business_id', DEFAULT_BUSINESS_ID).single();
      if (biz) setConfig(biz.config || {});
      if (ag) { setAgent(ag); setAgentActive(ag.active); }
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    setMsg('');
    await supabase.from('businesses').update({ config }).eq('id', DEFAULT_BUSINESS_ID);
    setSaving(false);
    setMsg('✓ Guardado correctamente');
    setTimeout(() => setMsg(''), 3000);
  }

  async function toggleAgent() {
    const newState = !agentActive;
    await supabase.from('agents').update({ active: newState }).eq('id', agent?.id);
    setAgentActive(newState);
    setMsg(newState ? '✓ Agente activado' : '⚠ Agente desactivado');
    setTimeout(() => setMsg(''), 3000);
  }

  if (!config) return <Shell><p style={{ color: '#555' }}>Cargando...</p></Shell>;

  return (
    <Shell>
      <p className="page-title">Configuración del Agente</p>

      {/* Estado del agente */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, color: '#aaa' }}>Estado del Agente TEST 0.1</div>
          <div style={{ marginTop: 4 }}>
            <span className={`badge ${agentActive ? 'badge-green' : 'badge-red'}`}>
              {agentActive ? '● ACTIVO — contestando llamadas' : '● INACTIVO — no contesta'}
            </span>
          </div>
        </div>
        <button className={`btn ${agentActive ? 'btn-danger' : 'btn-primary'}`} onClick={toggleAgent}>
          {agentActive ? 'Desactivar Agente' : 'Activar Agente'}
        </button>
      </div>

      {/* Configuración del consultorio */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Datos del Consultorio</h3>

        <label>Nombre del Doctor</label>
        <input value={config.doctorName || ''} onChange={e => setConfig({ ...config, doctorName: e.target.value })} />

        <label>Dirección</label>
        <input value={config.address || ''} onChange={e => setConfig({ ...config, address: e.target.value })} />

        <label>Precio de Consulta (MXN)</label>
        <input type="number" value={config.consultationPrice || ''} onChange={e => setConfig({ ...config, consultationPrice: Number(e.target.value) })} />

        <label>Teléfono de Transferencia (cuando el paciente pide hablar con humano)</label>
        <input value={config.transferPhone || ''} onChange={e => setConfig({ ...config, transferPhone: e.target.value })} placeholder="+521XXXXXXXXXX" />

        <label>Prompt personalizado adicional (opcional)</label>
        <textarea rows={4} value={config.customPrompt || ''} onChange={e => setConfig({ ...config, customPrompt: e.target.value })} placeholder="Instrucciones adicionales para el agente..." />

        {msg && <p style={{ color: msg.startsWith('✓') ? '#4caf50' : '#ffc107', marginBottom: 12 }}>{msg}</p>}

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      {/* Info de solo lectura */}
      <div className="card" style={{ fontSize: 12, color: '#666' }}>
        <h3 style={{ marginBottom: 12 }}>Info del Sistema</h3>
        <table><tbody>
          <tr><td style={{ paddingRight: 24, paddingBottom: 8 }}>Modelo IA</td><td style={{ color: '#aaa' }}>claude-sonnet-4-6</td></tr>
          <tr><td style={{ paddingBottom: 8 }}>STT</td><td style={{ color: '#aaa' }}>Deepgram Nova-3</td></tr>
          <tr><td style={{ paddingBottom: 8 }}>TTS</td><td style={{ color: '#aaa' }}>Cartesia Sonic-3</td></tr>
          <tr><td style={{ paddingBottom: 8 }}>Horario</td><td style={{ color: '#aaa' }}>Lun-Vie 9-18h · Sáb 9-14h</td></tr>
          <tr><td>Grabaciones</td><td style={{ color: '#aaa' }}>Expiran en 7 días (Cloudflare R2)</td></tr>
        </tbody></table>
      </div>
    </Shell>
  );
}
