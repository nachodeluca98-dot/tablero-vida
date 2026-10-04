// Avisos de Finanzas (spec §8). Los manda el cron del briefing; esta ruta sirve para probarlos
// (?simular=1 muestra qué se mandaría sin enviar) y para la Configuración (preferencias por tipo).
import { NextRequest, NextResponse } from "next/server";
import { enviarAvisosFinanzas, preferenciasAvisos, TIPOS_AVISO } from "@/lib/finanzas/avisos";
import { obtenerPreferencias } from "@/lib/finanzas/meses";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("preferencias")) return NextResponse.json(await preferenciasAvisos());
  // Enviar de verdad requiere el secreto del cron; simular no
  const simular = req.nextUrl.searchParams.get("simular") === "1";
  const auth = req.headers.get("authorization");
  if (!simular && process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await enviarAvisosFinanzas({ simular }));
}

// Prender o apagar un tipo de aviso: { tipo, activo }
export async function PATCH(req: NextRequest) {
  const { tipo, activo } = await req.json();
  if (!(tipo in TIPOS_AVISO)) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  const prefs = await obtenerPreferencias();
  const actuales = (prefs.avisosTelegram ?? {}) as Record<string, boolean>;
  await prisma.finPreferencias.update({ where: { id: "user" }, data: { avisosTelegram: { ...actuales, [tipo]: !!activo } } });
  return NextResponse.json(await preferenciasAvisos());
}
