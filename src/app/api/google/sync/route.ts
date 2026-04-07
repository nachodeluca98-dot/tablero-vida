import { NextResponse } from "next/server";
import { calendarClient } from "@/lib/google";
import { prisma } from "@/lib/prisma";
import { pilarKey } from "@/lib/pilares";

// Sincroniza tareas con fechaInicio a eventos de Google Calendar.
// - Crea el evento si no existe (guarda googleEventId)
// - Actualiza si cambió
// - Si la tarea no tiene fechaInicio, la ignora
// No borra eventos (conservador).
export async function POST() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: "user" } });
    if (!settings?.googleCalendarsJson) {
      return NextResponse.json({ error: "Primero crear calendarios (bootstrap)" }, { status: 400 });
    }
    const calendars: Record<string, string> = JSON.parse(settings.googleCalendarsJson);
    const cal = await calendarClient();

    const tareas = await prisma.tarea.findMany({ where: { fechaInicio: { not: null } } });

    let creados = 0, actualizados = 0, saltados = 0;

    for (const t of tareas) {
      const k = pilarKey(t.epica);
      const calendarId = calendars[k];
      if (!calendarId) { saltados++; continue; }

      const start = t.fechaInicio!;
      const end = t.fechaFin || new Date(+start + (t.duracionMin || 60) * 60000);

      const body = {
        summary: t.nombre,
        description: t.notas || undefined,
        start: { dateTime: start.toISOString(), timeZone: "America/Argentina/Buenos_Aires" },
        end:   { dateTime: end.toISOString(),   timeZone: "America/Argentina/Buenos_Aires" },
      };

      if (t.googleEventId && t.googleCalendarId === calendarId) {
        try {
          await cal.events.update({ calendarId, eventId: t.googleEventId, requestBody: body });
          actualizados++;
        } catch {
          // Evento borrado en Google → recrear
          const res = await cal.events.insert({ calendarId, requestBody: body });
          await prisma.tarea.update({ where: { id: t.id }, data: { googleEventId: res.data.id, googleCalendarId: calendarId } });
          creados++;
        }
      } else {
        // Si existía en otro calendario, lo borramos primero
        if (t.googleEventId && t.googleCalendarId && t.googleCalendarId !== calendarId) {
          try { await cal.events.delete({ calendarId: t.googleCalendarId, eventId: t.googleEventId }); } catch {}
        }
        const res = await cal.events.insert({ calendarId, requestBody: body });
        await prisma.tarea.update({ where: { id: t.id }, data: { googleEventId: res.data.id, googleCalendarId: calendarId } });
        creados++;
      }
    }

    return NextResponse.json({ ok: true, creados, actualizados, saltados, total: tareas.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
