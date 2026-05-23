'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Shell, StatusBadge } from '../page';

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function load() {
      let q = supabase.from('calls').select('*').order('started_at', { ascending: false }).limit(100);
      if (filter === 'appointments') q = q.eq('appointment_created', true);
      if (filter === 'emergencies')  q = q.eq('emergency_detected', true);
      if (filter === 'failed')       q = q.eq('status', 'failed');
      const { data } = await q;
      setCalls(data || []);
      setLoading(false);
    }
    load();
  }, [filter]);

  return (
    <Shell>
      <p className="page-title">Llamadas</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'appointments', 'emergencies', 'failed'].map(f => (
          <button key={f} className={`btn ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Todas' : f === 'appointments' ? 'Con cita' : f === 'emergencies' ? 'Emergencias' : 'Fallidas'}
          </button>
        ))}
      </div>
      {loading ? <p style={{ color: '#555' }}>Cargando...</p> : calls.length === 0 ? <p className="empty">Sin resultados</p> : (
        <div className="card" style={{ padding: 0 }}>
          <table><thead><tr>
            <th>Fecha / Hora</th><th>Paciente</th><th>Duración</th><th>Idioma</th><th>Estado</th><th>Cita</th><th>Emergencia</th><th></th>
          </tr></thead><tbody>
            {calls.map(c => (
              <tr key={c.id}>
                <td className="mono">{new Date(c.started_at).toLocaleString('es-MX')}</td>
                <td className="mono">{c.from_phone}</td>
                <td>{c.duration_seconds ? `${c.duration_seconds}s` : '—'}</td>
                <td><span className="badge badge-gray">{c.language_detected || 'es'}</span></td>
                <td><StatusBadge status={c.status} /></td>
                <td>{c.appointment_created ? <span style={{ color: '#4caf50' }}>✓</span> : '—'}</td>
                <td>{c.emergency_detected ? <span style={{ color: '#f44' }}>⚠ Sí</span> : '—'}</td>
                <td><Link href={`/calls/${c.id}`} className="btn" style={{ fontSize: 11 }}>Detalle</Link></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </Shell>
  );
}
