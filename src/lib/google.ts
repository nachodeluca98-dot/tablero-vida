import { google } from "googleapis";
import { prisma } from "./prisma";
import { PILARES, PilarKey } from "./pilares";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

// Colores de Google Calendar que mejor matchean los pilares (1-24)
// https://developers.google.com/calendar/api/v3/reference/colors
export const PILAR_CAL_COLOR: Record<PilarKey, string> = {
  mus: "5",  // banana (amarillo)
  fit: "11", // tomato (rojo)
  sal: "10", // basil (verde)
  ges: "9",  // blueberry (azul)
  apr: "3",  // grape (violeta)
  cre: "6",  // tangerine (naranja)
  pro: "7",  // peacock (celeste)
  soc: "4",  // flamingo (rosa)
  met: "8",  // graphite (gris)
};

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/google/callback"
  );
}

export function authUrl() {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function getAuthedClient() {
  const s = await prisma.settings.findUnique({ where: { id: "user" } });
  if (!s?.googleRefreshToken) throw new Error("Google no conectado");
  const oauth = oauthClient();
  oauth.setCredentials({
    access_token: s.googleAccessToken || undefined,
    refresh_token: s.googleRefreshToken,
    expiry_date: s.googleTokenExpiry ? +s.googleTokenExpiry : undefined,
  });
  oauth.on("tokens", async (tokens) => {
    await prisma.settings.update({
      where: { id: "user" },
      data: {
        googleAccessToken: tokens.access_token || s.googleAccessToken,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : s.googleTokenExpiry,
        ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
      },
    });
  });
  return oauth;
}

export async function calendarClient() {
  const auth = await getAuthedClient();
  return google.calendar({ version: "v3", auth });
}

// Crea los 9 calendarios (uno por pilar) si no existen.
// Devuelve mapping { pilarKey: calendarId }.
export async function bootstrapCalendars() {
  const cal = await calendarClient();
  const existing = await prisma.settings.findUnique({ where: { id: "user" } });
  const current: Record<string, string> = existing?.googleCalendarsJson
    ? JSON.parse(existing.googleCalendarsJson)
    : {};

  for (const p of PILARES) {
    if (current[p.key]) continue;
    const res = await cal.calendars.insert({
      requestBody: {
        summary: `TV — ${p.nombre}`,
        description: `Tablero de Vida — pilar ${p.nombre}`,
        timeZone: "America/Argentina/Buenos_Aires",
      },
    });
    const id = res.data.id!;
    current[p.key] = id;
    // Setear color
    try {
      await cal.calendarList.patch({
        calendarId: id,
        requestBody: { colorId: PILAR_CAL_COLOR[p.key] },
      });
    } catch {}
  }

  await prisma.settings.update({
    where: { id: "user" },
    data: { googleCalendarsJson: JSON.stringify(current) },
  });
  return current;
}
