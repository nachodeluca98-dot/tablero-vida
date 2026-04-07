import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { oauthClient } from "@/lib/google";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/settings?error=no_code", req.url));

  const oauth = oauthClient();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);

  // Obtener email del usuario
  let email: string | undefined;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: oauth });
    const info = await oauth2.userinfo.get();
    email = info.data.email || undefined;
  } catch {}

  await prisma.settings.upsert({
    where: { id: "user" },
    create: {
      id: "user",
      googleAccessToken: tokens.access_token || null,
      googleRefreshToken: tokens.refresh_token || null,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      googleCalendarConectado: true,
      googleEmail: email,
    },
    update: {
      googleAccessToken: tokens.access_token || null,
      ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      googleCalendarConectado: true,
      googleEmail: email,
    },
  });

  return NextResponse.redirect(new URL("/settings?connected=1", req.url));
}
