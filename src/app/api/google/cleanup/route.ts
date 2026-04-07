import { NextResponse } from "next/server";
import { calendarClient } from "@/lib/google";
import { prisma } from "@/lib/prisma";

// Borra TODOS los calendarios cuyo summary empiece con "TV — "
// y limpia googleCalendarsJson. Después se puede volver a hacer bootstrap limpio.
export async function POST() {
  try {
    const cal = await calendarClient();
    const list = await cal.calendarList.list({ maxResults: 250 });
    const items = list.data.items || [];

    const aBorrar = items.filter(c => c.summary?.startsWith("TV — "));
    let borrados = 0;
    for (const c of aBorrar) {
      try {
        await cal.calendars.delete({ calendarId: c.id! });
        borrados++;
      } catch {}
    }

    await prisma.settings.update({
      where: { id: "user" },
      data: { googleCalendarsJson: null },
    });

    // También limpiar los IDs viejos en tareas
    await prisma.tarea.updateMany({
      data: { googleEventId: null, googleCalendarId: null },
    });

    return NextResponse.json({ ok: true, borrados });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
