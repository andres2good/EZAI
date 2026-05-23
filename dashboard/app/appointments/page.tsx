'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Shell } from '../page';

export default function AppointmentsPage() {
  const [appts, setAppts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      let q = supabase.from('appointments').select('*').order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true });
      if (filter === 'upcoming') q = q.gte('appointment_date', today).in('status', ['scheduled', 'rescheduled']);
      if (filter === 'past')     q = q.lt('appointment_date', today);
      if (filter === 'cancelled') q = q.eq('status', 'cancelled');
      const { data } = await q.limit(100);
      setAppts(data || []);
      setLoading(false);
    }
    load();
  }, [filter]);

  async function cancel(id: string, googleEventId: string) {
    if (!confirm('¿Cancelar esta cita?')) return;
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id);
    setAppts(a => a.map(x => x.id === id ? { ...x, status: 'cancelled' } : x));
    // Llamar al API para cancelar también en Google Calendar
    await fetch('/api/appointments/cancel', { method: 'POST', body: JSON.stringify({ googleEventId }), headers: { 'Content-Type': 'application/json' } });
  }

  return (
    <Shell>
      <p className="page-title">Citas</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['upcoming', 'past', 'cancelled'].map(f => (
          <button key={f} className={`btn ${filter === f ? 'btn-primary' : ''}`} onClick={() => { setFilter(f); setLoading(true); }}>
            {f === 'upcoming' ? 'Próximas' : f === 'past' ? 'Pasadas' : 'Canceladas'}
          </button>
        ))}
      </div>
      {loading ? <p style={{ color: '#555' }}>Cargando...</p> : appts.length === 0 ? <p className="empty">Sin citas</p> : (
        <div className="card" style={{ padding: 0 }}>
          <table><thead><tr>
            <th>Fecha</th><th>Hora</th><th>Paciente</th><th>Teléfono</th><th>Motivo</th><th>Estado</th><th></th>
          </tr></thead><tbody>
            {appts.map(a => (
              <tr key={a.id}>
                <td>{a.appointment_date}</td>
                <td className="mono">{a.appointment_time?.slice(0, 5)}</td>
                <td>{a.patient_name}</td>
                <td className="mono">{a.phone}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.reason}</td>
                <td>
                  <span className={`badge ${a.status === 'scheduled' ? 'badge-green' : a.status === 'cancelled' ? 'badge-red' : 'badge-yellow'}`}>
                    {a.status}
                  </span>
                </td>
                <td>
                  {a.status === 'scheduled' && (
                    <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={() => cancel(a.id, a.google_event_id)}>
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </Shell>
  );
}
