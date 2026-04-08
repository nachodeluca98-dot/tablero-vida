// Cron nocturno: inicia la reflexión diaria conversacional vía Telegram.
// Crea/resetea ReflexionDiaria de hoy con paso=1 y envía la primera pregunta.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegram } from "@/lib/telegram";
import { sendPushToAll } from "@/lib/push";
import { PREGUNTAS } from "@/lib/reflexion";

export const dynamic = "force-dynamic";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const fecha = today();
  await prisma.reflexionDiaria.upsert({
    where: { fecha },
    update: { paso: 1, animo: null, mejor: null, frustracion: null, mejorar: null, gratitud: null },
    create: { fecha, paso: 1 },
  });

  const texto = `🌙 <b>Review del día</b>\n\n<b>1/5</b> — ${PREGUNTAS[0]}\n\n<i>Respondé este mensaje para continuar.</i>`;
  const tg = await sendTelegram(texto);
  const push = await sendPushToAll({
    title: "🌙 Review del día",
    body: "Respondé la reflexión diaria en Telegram",
    url: "/habitos",
    tag: "review",
  });
  return NextResponse.json({ ok: true, telegram: tg, push });
}
