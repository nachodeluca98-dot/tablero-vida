// Google Calendar push notifications (watch channels).
// Cada watch escucha cambios en UN calendario y avisa a /api/google/notifications.
// Los watches expiran cada 7 días → hay que renovarlos.

import { calendarClient } from "./google";
import { prisma } from "./prisma";
import { randomUUID } from "crypto";

const WEBHOOK_URL = process.env.GOOGLE_WEBHOOK_URL ||
  (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api/google/notifications` : "");

export async function startWatch() {
  if (!WEBHOOK_URL) throw new Error("GOOGLE_WEBHOOK_URL no configurada");

  const settings = await prisma.settings.findUnique({ where: { id: "user" } });
  if (!settings?.googleCalendarsJson) throw new Error("Primero bootstrap de calendarios");

  // Parar watch viejo si existe
  await stopWatch().catch(() => {});

  const cal = await calendarClient();
  // Watch sobre el calendario principal del usuario (que recibe eventos de todos)
  // En realidad necesitamos uno por calendario; arrancamos con "primary" que es el general.
  const channelId = randomUUID();
  const res = await cal.events.watch({
    calendarId: "primary",
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: WEBHOOK_URL,
      // expiration en ms desde epoch — Google permite máx 7 días
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.settings.update({
    where: { id: "user" },
    data: {
      googleWatchChannelId: channelId,
      googleWatchResourceId: res.data.resourceId || null,
      googleWatchExpiration: res.data.expiration ? new Date(Number(res.data.expiration)) : null,
    },
  });

  return res.data;
}

export async function stopWatch() {
  const settings = await prisma.settings.findUnique({ where: { id: "user" } });
  if (!settings?.googleWatchChannelId || !settings?.googleWatchResourceId) return;

  const cal = await calendarClient();
  try {
    await cal.channels.stop({
      requestBody: {
        id: settings.googleWatchChannelId,
        resourceId: settings.googleWatchResourceId,
      },
    });
  } catch (e) {
    // Ignorar si ya estaba muerto
  }

  await prisma.settings.update({
    where: { id: "user" },
    data: {
      googleWatchChannelId: null,
      googleWatchResourceId: null,
      googleWatchExpiration: null,
    },
  });
}

// Renueva el watch si expira en menos de 2 días.
// Llamado desde el cron diario de briefing.
export async function renewWatchIfNeeded() {
  const s = await prisma.settings.findUnique({ where: { id: "user" } });
  if (!s?.googleRefreshToken) return { skipped: "no_google" };
  if (!s.googleWatchExpiration) return { skipped: "no_watch" };

  const ms = +s.googleWatchExpiration - Date.now();
  const dosDias = 2 * 24 * 60 * 60 * 1000;
  if (ms > dosDias) return { skipped: "not_yet", expiresIn: Math.round(ms / 86400000) + "d" };

  const data = await startWatch();
  return { renewed: true, expiration: data.expiration };
}
