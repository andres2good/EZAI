'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function Home() {
  const [stats, setStats] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: calls } = await supabase
        .from('calls').select('*').order('started_at', { ascending: false }).limit(5);
      const { data: all } = await supabase
        .from('calls').select('id,appointment_created,emergency_detected,duration_seconds,started_at');
      const today = new Date().toISOString().slice(0, 10);
      setStats({
        total: all?.length || 0,
        today: all?.filter(c => c.started_at?.startsWith(today)).length || 0,
        appointments: all?.filter(c => c.appointment_created).length || 0,
        emergencies: all?.filter(c => c.emergency_detected).length || 0,
        avgDuration: all?.length ? Math.round(all.reduce((s, c) => s + (c.duration_seconds || 0), 0) / all.length) : 0,
      });
      setRecent(calls || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Shell><p style={{ color: '#555' }}>Cargando...</p></Shell>;

  return (
    <Shell>
      <p className="page-title">Panel de Control</p>
      <div className="grid-4">
        <div className="card"><h3>Llamadas Hoy</h3><div className="value">{stats.today}</div></div>
        <div className="card"><h3>Total Llamadas</h3><div className="value">{stats.total}</div></div>
        <div className="card"><h3>Citas Agendadas</h3><div className="value" style={{ color: '#4caf50' }}>{stats.appointments}</div></div>
        <div className="card"><h3>Emergencias</h3><div className="value" style={{ color: stats.emergencies > 0 ? '#f44336' : '#555' }}>{stats.emergencies}</div></div>
      </div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3>Últimas Llamadas</h3>
          <Link href="/calls" className="btn" style={{ fontSize: 12 }}>Ver todas →</Link>
        </div>
        {recent.length === 0 ? <p className="empty">Sin llamadas aún</p> : (
          <table><thead><tr>
            <th>Hora</th><th>Desde</th><th>Duración</th><th>Estado</th><th>Cita</th><th></th>
          </tr></thead><tbody>
            {recent.map(c => (
              <tr key={c.id}>
                <td className="mono">{new Date(c.started_at).toLocaleTimeString('es-MX')}</td>
                <td className="mono">{c.from_phone}</td>
                <td>{c.duration_seconds ? `${c.duration_seconds}s` : '—'}</td>
                <td><StatusBadge status={c.status} /></td>
                <td>{c.appointment_created ? <span style={{ color: '#4caf50' }}>✓ Sí</span> : '—'}</td>
                <td><Link href={`/calls/${c.id}`} className="btn" style={{ fontSize: 11 }}>Ver</Link></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
      <div className="card" style={{ color: '#666', fontSize: 12 }}>
        Duración promedio: <strong style={{ color: '#aaa' }}>{stats.avgDuration}s</strong>
      </div>
    </Shell>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { completed: 'badge-green', failed: 'badge-red', emergency: 'badge-red', transferred: 'badge-yellow', in_progress: 'badge-yellow' };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <aside className="sidebar">
        <h2>EZAI</h2>
        <nav>
          <Link href="/">Panel</Link>
          <Link href="/calls">Llamadas</Link>
          <Link href="/appointments">Citas</Link>
          <Link href="/settings">Config</Link>
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
