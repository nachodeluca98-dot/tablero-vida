import { prisma } from "@/lib/prisma";
import { escapeHtml } from "@/lib/telegram";
import { notificar } from "./canal";
import { describirVencimiento, resumenVehiculo, vehiculosActivos } from "./core";

const DIA = 86400000;
// No repetir el mismo aviso antes de estos días según cómo quedó el anterior
const SILENCIO_DIAS: Record<string, number> = { enviado: 3, pospuesto: 7, reconocido: 3 };

export async function revisarRecordatoriosVehiculos() {
  const vehiculos = await vehiculosActivos();
  let enviados = 0;

  for (const v of vehiculos) {
    const r = await resumenVehiculo(v.id);
    if (!r) continue;

    for (const venc of r.vencimientos) {
      if (venc.estado !== "vencido" && venc.estado !== "proximo") continue;

      const previo = await prisma.recordatorioVehiculo.findFirst({
        where: { vehiculoId: v.id, tipo: venc.tipo },
        orderBy: { enviadoAt: "desc" },
      });
      if (previo && Date.now() - +previo.enviadoAt < (SILENCIO_DIAS[previo.estado] ?? 3) * DIA) continue;

      const rec = await prisma.recordatorioVehiculo.create({
        data: { vehiculoId: v.id, tipo: venc.tipo, canal: "telegram" },
      });

      const titulo = venc.estado === "vencido" ? "🔴 Vencido" : "🟡 Se acerca";
      const texto = [
        `${titulo}: <b>${venc.emoji} ${venc.label}</b> — ${escapeHtml(v.alias)}`,
        describirVencimiento(venc),
        "",
        "¿Ya lo hiciste?",
      ].join("\n");

      await notificar(texto, [[
        { text: "✅ Ya lo hice", callback_data: `vr:hecho:${rec.id}` },
        { text: "⏰ En una semana", callback_data: `vr:pos:${rec.id}` },
      ]]);
      enviados++;
    }
  }
  return { enviados };
}
