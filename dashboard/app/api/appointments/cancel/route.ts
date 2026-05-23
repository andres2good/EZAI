import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { googleEventId } = await req.json();
  if (!googleEventId) return NextResponse.json({ error: 'falta googleEventId' }, { status: 400 });

  // Llamar al servidor Node.js para cancelar en Google Calendar
  const serverUrl = process.env.EZAI_SERVER_URL || 'http://localhost:3000';
  try {
    await fetch(`${serverUrl}/api/appointments/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.EZAI_API_KEY}` },
      body: JSON.stringify({ googleEventId }),
    });
  } catch {
    // Si el servidor no está disponible, solo actualizamos Supabase (ya hecho en el cliente)
  }

  return NextResponse.json({ ok: true });
}
