import { prisma } from "@/lib/prisma";
import { escapeHtml } from "@/lib/telegram";
import { notificar } from "@/lib/compartido/canal";
import { describirVencimiento, hoyYmd, resumenVehiculo, vehiculosActivos } from "./core";

const DIA = 86400000;
// No repetir el mismo aviso antes de estos días según cómo quedó el anterior
const SILENCIO_DIAS: Record<string, number> = { enviado: 3, pospuesto: 7, reconocido: 3 };

export async function revisarRecordatoriosVehiculos() {
  const vehiculos = await vehiculosActivos();
  let enviados = 0;

  for (const v of vehiculos) {
    const r = await resumenVehiculo(v.id);
    if (!r) continue;
    const abiertas = await prisma.vehiculoTarea.findMany({ where: { vehiculoId: v.id, hecho: false } });
    const tiposAnotados = new Set(abiertas.map(t => t.tipo));

    for (const venc of r.vencimientos) {
      if (venc.estado !== "vencido" && venc.estado !== "proximo") continue;
      // ya lo anotó como pendiente: se avisa por ese pendiente, no por la regla
      if (tiposAnotados.has(venc.tipo)) continue;

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

    // Pendientes anotados con fecha de hoy o atrasada: un aviso por día
    const hoy = hoyYmd();
    for (const t of abiertas) {
      if (!t.fecha || t.fecha.toISOString().slice(0, 10) > hoy) continue;
      const tipo = `tarea:${t.id}`;
      const previo = await prisma.recordatorioVehiculo.findFirst({ where: { vehiculoId: v.id, tipo }, orderBy: { enviadoAt: "desc" } });
      if (previo && Date.now() - +previo.enviadoAt < (previo.estado === "pospuesto" ? 7 : 1) * DIA - 3600000) continue;
      const rec = await prisma.recordatorioVehiculo.create({ data: { vehiculoId: v.id, tipo, canal: "telegram" } });
      const atrasado = t.fecha.toISOString().slice(0, 10) < hoy;
      await notificar(
        `📝 ${atrasado ? "Pendiente atrasado" : "Pendiente para hoy"}: <b>${escapeHtml(t.titulo)}</b> — ${escapeHtml(v.alias)}\n\n¿Ya lo hiciste?`,
        [[
          { text: "✅ Ya lo hice", callback_data: `vr:hecho:${rec.id}` },
          { text: "⏰ En una semana", callback_data: `vr:pos:${rec.id}` },
        ]],
      );
      enviados++;
    }
  }
  return { enviados };
}
