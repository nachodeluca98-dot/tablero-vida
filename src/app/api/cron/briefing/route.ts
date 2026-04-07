// Cron diario matinal: envía el briefing del día por Telegram.
// Lo dispara Vercel Cron según vercel.json.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegram, escapeHtml } from "@/lib/telegram";
import { pilarFromKey, pilarKey } from "@/lib/pilares";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export async function GET(req: NextRequest) {
  // Seguridad: Vercel Cron manda header authorization con CRON_SECRET
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const t = new Date();
  const inicio = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const fin = new Date(inicio); fin.setDate(fin.getDate() + 1);
  const en7 = new Date(inicio); en7.setDate(en7.getDate() + 7);
  const dia = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][t.getDay()];

  const [tareasHoy, bloques, vencen] = await Promise.all([
    prisma.tarea.findMany({
      where: {
        estado: { not: "Completada" },
        OR: [
          { fechaInicio: { gte: inicio, lt: fin } },
          { fechaVencimiento: { gte: inicio, lt: fin } },
        ],
      },
      orderBy: [{ horario: "asc" }],
      take: 15,
    }),
    prisma.cronogramaBase.findMany({
      where: { dia },
      orderBy: { horarioInicio: "asc" },
    }),
    prisma.tarea.findMany({
      where: {
        estado: { not: "Completada" },
        fechaVencimiento: { gt: fin, lte: en7 },
      },
      orderBy: { fechaVencimiento: "asc" },
      take: 5,
    }),
  ]);

  const lines: string[] = [
    `☀️ <b>Buen día, Nacho</b>`,
    `<b>${dia} ${fmtDate(t)}</b>`,
    "",
  ];

  if (bloques.length) {
    lines.push("<b>🕐 Cronograma de hoy:</b>");
    for (const b of bloques) {
      const p = pilarFromKey(pilarKey(b.pilar));
      lines.push(`${b.horarioInicio}-${b.horarioFin} ${p.emoji} ${escapeHtml(b.actividad)}`);
    }
    lines.push("");
  }

  lines.push("<b>✅ Tareas de hoy:</b>");
  if (tareasHoy.length) {
    for (const t of tareasHoy) {
      const p = pilarFromKey(pilarKey(t.epica));
      const h = t.horario ? `${t.horario} ` : "";
      lines.push(`${p.emoji} ${h}${escapeHtml(t.nombre)}`);
    }
  } else {
    lines.push("— sin tareas agendadas");
  }

  if (vencen.length) {
    lines.push("", "<b>⏰ Próximos vencimientos (7 días):</b>");
    for (const v of vencen) {
      const p = pilarFromKey(pilarKey(v.epica));
      const f = v.fechaVencimiento ? fmtDate(v.fechaVencimiento) : "?";
      lines.push(`${p.emoji} ${f} ${escapeHtml(v.nombre)}`);
    }
  }

  lines.push("", "💪 ¡A romperla!");

  const result = await sendTelegram(lines.join("\n"));
  return NextResponse.json({ ok: true, sent: result });
}
