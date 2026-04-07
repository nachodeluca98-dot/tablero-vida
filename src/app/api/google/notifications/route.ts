// Endpoint que Google llama cuando hay cambios en el calendario.
// Google manda un POST sin body, solo headers (X-Goog-Channel-ID, X-Goog-Resource-State).
// Nosotros disparamos una sync incremental usando syncToken para traer solo los cambios.

import { NextRequest, NextResponse } from "next/server";
import { calendarClient } from "@/lib/google";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const state = req.headers.get("x-goog-resource-state");
  // sync = mensaje inicial de confirmación, lo ignoramos
  if (state === "sync") return NextResponse.json({ ok: true, ignored: "initial_sync" });

  try {
    const settings = await prisma.settings.findUnique({ where: { id: "user" } });
    if (!settings?.googleRefreshToken) return NextResponse.json({ ok: false, error: "no_auth" });

    const cal = await calendarClient();
    const syncToken = settings.googleSyncToken || undefined;

    let pageToken: string | undefined = undefined;
    let nextSyncToken: string | undefined = undefined;
    let cambios = 0;

    do {
      const res: any = await cal.events.list({
        calendarId: "primary",
        syncToken,
        pageToken,
        showDeleted: true,
      } as any).catch(async (err: any) => {
        // 410 Gone = token inválido, hacer full sync
        if (err.code === 410) {
          await prisma.settings.update({ where: { id: "user" }, data: { googleSyncToken: null } });
          return null;
        }
        throw err;
      });

      if (!res) return NextResponse.json({ ok: true, fullResyncNeeded: true });

      const items = res.data.items || [];
      cambios += items.length;

      // Por cada evento cambiado, intentamos linkear con la tarea correspondiente
      for (const ev of items) {
        if (!ev.id) continue;
        const tarea = await prisma.tarea.findFirst({ where: { googleEventId: ev.id } });
        if (!tarea) continue;

        if (ev.status === "cancelled") {
          // Evento borrado en Google → desvinculamos (no borramos la tarea)
          await prisma.tarea.update({
            where: { id: tarea.id },
            data: { googleEventId: null, googleCalendarId: null },
          });
          continue;
        }

        // Actualizar título / fechas si cambiaron
        const updates: any = {};
        if (ev.summary && ev.summary !== tarea.nombre) updates.nombre = ev.summary;
        if (ev.start?.dateTime) {
          const newStart = new Date(ev.start.dateTime);
          if (!tarea.fechaInicio || +tarea.fechaInicio !== +newStart) updates.fechaInicio = newStart;
        }
        if (ev.end?.dateTime) {
          const newEnd = new Date(ev.end.dateTime);
          if (!tarea.fechaFin || +tarea.fechaFin !== +newEnd) updates.fechaFin = newEnd;
        }
        if (Object.keys(updates).length) {
          await prisma.tarea.update({ where: { id: tarea.id }, data: updates });
        }
      }

      pageToken = res.data.nextPageToken;
      if (res.data.nextSyncToken) nextSyncToken = res.data.nextSyncToken;
    } while (pageToken);

    if (nextSyncToken) {
      await prisma.settings.update({
        where: { id: "user" },
        data: { googleSyncToken: nextSyncToken },
      });
    }

    return NextResponse.json({ ok: true, cambios });
  } catch (e: any) {
    console.error("[google notifications]", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// Google a veces hace healthcheck con GET
export async function GET() {
  return NextResponse.json({ ok: true, service: "google-notifications" });
}
