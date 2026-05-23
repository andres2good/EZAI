'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Shell, StatusBadge } from '../../page';
import Link from 'next/link';

export default function CallDetail() {
  const { id } = useParams();
  const [call, setCall] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('calls').select('*').eq('id', id).single()
      .then(({ data }) => { setCall(data); setLoading(false); });
  }, [id]);

  if (loading) return <Shell><p style={{ color: '#555' }}>Cargando...</p></Shell>;
  if (!call) return <Shell><p className="empty">Llamada no encontrada</p></Shell>;

  const transcript: any[] = (() => { try { return JSON.parse(call.transcription || '[]'); } catch { return []; } })();

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link href="/calls" className="btn" style={{ fontSize: 12 }}>← Volver</Link>
        <p className="page-title" style={{ margin: 0 }}>Detalle de Llamada</p>
      </div>

      {/* Datos generales */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <table style={{ fontSize: 13 }}><tbody>
            <tr><td style={{ color: '#666', paddingRight: 16 }}>Fecha</td><td>{new Date(call.started_at).toLocaleString('es-MX')}</td></tr>
            <tr><td style={{ color: '#666' }}>Desde</td><td className="mono">{call.from_phone}</td></tr>
            <tr><td style={{ color: '#666' }}>Hacia</td><td className="mono">{call.to_phone}</td></tr>
            <tr><td style={{ color: '#666' }}>Duración</td><td>{call.duration_seconds ? `${call.duration_seconds}s` : '—'}</td></tr>
            <tr><td style={{ color: '#666' }}>Estado</td><td><StatusBadge status={call.status} /></td></tr>
            <tr><td style={{ color: '#666' }}>Idioma</td><td>{call.language_detected || 'es'}</td></tr>
            <tr><td style={{ color: '#666' }}>Cita agendada</td><td>{call.appointment_created ? <span style={{ color: '#4caf50' }}>✓ Sí</span> : 'No'}</td></tr>
            <tr><td style={{ color: '#666' }}>Emergencia</td><td>{call.emergency_detected ? <span style={{ color: '#f44' }}>⚠ Sí</span> : 'No'}</td></tr>
            <tr><td style={{ color: '#666' }}>Turnos</td><td>{call.messages_count || transcript.length}</td></tr>
          </tbody></table>
        </div>

        {/* Grabación + Resumen */}
        <div>
          {call.recording_url && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3>Grabación</h3>
              <audio controls src={call.recording_url} style={{ width: '100%', marginTop: 8 }} />
            </div>
          )}
          {call.summary && (
            <div className="card">
              <h3>Resumen (generado por IA)</h3>
              <p style={{ color: '#ccc', marginTop: 8, lineHeight: 1.6 }}>{call.summary}</p>
            </div>
          )}
        </div>
      </div>

      {/* Transcripción */}
      <div className="card">
        <h3>Transcripción Completa</h3>
        {transcript.length === 0 ? (
          <p style={{ color: '#555', marginTop: 8 }}>Sin transcripción disponible</p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {transcript.map((t: any, i: number) => (
              <div key={i} style={{
                display: 'flex', gap: 12, marginBottom: 10, padding: '8px 0',
                borderBottom: '1px solid #1a1a1a',
                flexDirection: t.role === 'patient' ? 'row' : 'row-reverse',
              }}>
                <span style={{
                  minWidth: 60, fontSize: 10, color: t.role === 'patient' ? '#7c9eff' : '#4caf50',
                  textAlign: t.role === 'patient' ? 'left' : 'right', paddingTop: 2,
                }}>
                  {t.role === 'patient' ? 'PACIENTE' : 'AGENTE'}
                </span>
                <span style={{ color: '#ddd', lineHeight: 1.5, flex: 1 }}>{t.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
