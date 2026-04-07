// Helper para mandar Web Push notifications a todas las suscripciones guardadas.
import webpush from "web-push";
import { prisma } from "./prisma";

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:nacho@tablero.local";

if (PUBLIC && PRIVATE) {
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushToAll(payload: PushPayload) {
  if (!PUBLIC || !PRIVATE) {
    console.warn("[push] VAPID keys no configuradas");
    return { ok: false, error: "no_vapid" };
  }

  const subs = await prisma.pushSubscription.findMany();
  const results = await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload)
        );
        return { ok: true, id: s.id };
      } catch (err: any) {
        // 410 Gone = subscripción muerta, la borramos
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: s.id } });
        }
        return { ok: false, id: s.id, error: String(err) };
      }
    })
  );

  return { ok: true, sent: results.length, results };
}
