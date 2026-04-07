import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  await prisma.settings.update({
    where: { id: "user" },
    data: {
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      googleCalendarConectado: false,
      googleEmail: null,
      // no borramos googleCalendarsJson para preservar IDs si reconecta
    },
  });
  return NextResponse.json({ ok: true });
}
