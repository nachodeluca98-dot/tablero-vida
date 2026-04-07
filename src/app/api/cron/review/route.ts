// Cron nocturno: review del día.
// Muestra hábitos del día (qué marcaste y qué falta) + tareas pendientes.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegram, escapeHtml } from "@/lib/telegram";
import { pilarFromKey, pilarKey } from "@/lib/pilares";

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
  const habitos = await prisma.tarea.findMany({
    where: { mostrarEnHabitos: true, caracterVisibilidad: "Relevante" },
    include: { habitoLogs: { where: { fecha } } },
  });

  const hechos = habitos.filter(h => h.habitoLogs.length > 0);
  const faltan = habitos.filter(h => h.habitoLogs.length === 0);

  const lines: string[] = [
    "🌙 <b>Review del día</b>",
    "",
    `✅ Hábitos marcados: <b>${hechos.length}/${habitos.length}</b>`,
    "",
  ];

  if (faltan.length) {
    lines.push("<b>⬜ Pendientes de marcar:</b>");
    for (const h of faltan.slice(0, 15)) {
      const p = pilarFromKey(pilarKey(h.epica));
      lines.push(`${p.emoji} ${escapeHtml(h.nombre)}`);
    }
    lines.push("", "Marcalos con <code>/hecho &lt;nombre&gt;</code>");
  } else {
    lines.push("🔥 <b>¡Día perfecto! Todos los hábitos marcados.</b>");
  }

  const result = await sendTelegram(lines.join("\n"));
  return NextResponse.json({ ok: true, sent: result });
}
