// Dashboard inteligente: calcula señales y sugerencias en base al estado actual.
// Sin AI, lógica local — instantáneo y gratis.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pilarKey, PILARES } from "@/lib/pilares";

export const dynamic = "force-dynamic";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET() {
  const now = new Date();
  const hoy = ymd(now);
  const ayer = ymd(new Date(+now - 86400000));
  const dia7 = new Date(+now + 7 * 86400000);
  const hace7 = new Date(+now - 7 * 86400000);
  const inicioHoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const finHoy = new Date(+inicioHoy + 86400000);

  const DIAS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const diaSemana = DIAS[now.getDay()];
  const horaActual = now.getHours() * 60 + now.getMinutes();

  const [habitos, tareasHoy, vencen, todasTareas, bloques] = await Promise.all([
    prisma.tarea.findMany({
      where: { mostrarEnHabitos: true, caracterVisibilidad: "Relevante" },
      include: { habitoLogs: { where: { fecha: { in: [hoy, ayer] } } } },
    }),
    prisma.tarea.findMany({
      where: {
        estado: { not: "Completada" },
        OR: [
          { fechaInicio: { gte: inicioHoy, lt: finHoy } },
          { fechaVencimiento: { gte: inicioHoy, lt: finHoy } },
        ],
      },
    }),
    prisma.tarea.findMany({
      where: {
        estado: { not: "Completada" },
        fechaVencimiento: { gte: now, lte: dia7 },
      },
      orderBy: { fechaVencimiento: "asc" },
      take: 5,
    }),
    prisma.tarea.findMany({
      where: { caracterVisibilidad: "Relevante" },
    }),
    prisma.cronogramaBase.findMany({ where: { dia: diaSemana }, orderBy: { horarioInicio: "asc" } }),
  ]);

  // Hábitos del día
  const habHoy = habitos.filter(h => h.habitoLogs.some(l => l.fecha === hoy));
  const habFaltan = habitos.filter(h => !h.habitoLogs.some(l => l.fecha === hoy));
  const habRiesgo = habFaltan.filter(h => h.racha >= 3); // racha >= 3 días = vale la pena salvarla

  // Pilares descuidados (en los últimos 7 días casi no tienen actividad)
  const pilarStats = PILARES.map(p => {
    const tareasPilar = todasTareas.filter(t => pilarKey(t.epica) === p.key);
    const recientes = tareasPilar.filter(t => t.updatedAt && +t.updatedAt > +hace7).length;
    return { ...p, total: tareasPilar.length, recientes };
  });
  const descuidados = pilarStats
    .filter(p => p.total > 0 && p.recientes === 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  // Bloque actual del cronograma
  function parseHora(h: string) {
    const [hh, mm] = h.split(":").map(Number);
    return hh * 60 + (mm || 0);
  }
  const bloqueActual = bloques.find(b => {
    const ini = parseHora(b.horarioInicio);
    const fin = parseHora(b.horarioFin);
    return horaActual >= ini && horaActual < fin;
  });
  const bloqueProximo = bloques.find(b => parseHora(b.horarioInicio) > horaActual);

  // Sobrecarga
  const sobrecarga = tareasHoy.length >= 10;

  // Construir señales
  const senales: Array<{ tipo: string; nivel: "info" | "warn" | "alert"; titulo: string; texto: string; emoji: string }> = [];

  if (bloqueActual) {
    senales.push({
      tipo: "bloque",
      nivel: "info",
      emoji: "🕐",
      titulo: `Bloque actual: ${bloqueActual.actividad}`,
      texto: `${bloqueActual.horarioInicio}–${bloqueActual.horarioFin} · ${bloqueActual.pilar}`,
    });
  } else if (bloqueProximo) {
    senales.push({
      tipo: "bloque",
      nivel: "info",
      emoji: "⏭",
      titulo: `Próximo bloque: ${bloqueProximo.actividad}`,
      texto: `Empieza a las ${bloqueProximo.horarioInicio}`,
    });
  }

  if (habRiesgo.length > 0) {
    senales.push({
      tipo: "racha",
      nivel: "warn",
      emoji: "🔥",
      titulo: `${habRiesgo.length} racha(s) en riesgo`,
      texto: habRiesgo.slice(0, 3).map(h => `${h.nombre} (🔥${h.racha})`).join(" · "),
    });
  }

  if (habFaltan.length > 0 && habHoy.length < habitos.length) {
    senales.push({
      tipo: "habitos",
      nivel: habFaltan.length > habHoy.length ? "warn" : "info",
      emoji: "⬜",
      titulo: `Hábitos pendientes: ${habFaltan.length}/${habitos.length}`,
      texto: `Llevás ${habHoy.length} marcados hoy`,
    });
  }

  if (sobrecarga) {
    senales.push({
      tipo: "sobrecarga",
      nivel: "alert",
      emoji: "⚠️",
      titulo: `Sobrecarga: ${tareasHoy.length} tareas hoy`,
      texto: "Considerá mover algunas o priorizar las críticas",
    });
  }

  if (vencen.length > 0) {
    senales.push({
      tipo: "vencimientos",
      nivel: vencen.length >= 3 ? "warn" : "info",
      emoji: "⏰",
      titulo: `${vencen.length} vencimientos en 7 días`,
      texto: vencen.slice(0, 2).map(v => v.nombre).join(" · "),
    });
  }

  if (descuidados.length > 0) {
    senales.push({
      tipo: "pilar_descuidado",
      nivel: "info",
      emoji: descuidados[0].emoji,
      titulo: `Pilar descuidado: ${descuidados[0].nombre}`,
      texto: `Sin actividad reciente. Agendá algo esta semana.`,
    });
  }

  if (senales.length === 0) {
    senales.push({
      tipo: "ok",
      nivel: "info",
      emoji: "✨",
      titulo: "Todo en orden",
      texto: "No hay señales urgentes. Buen momento para avanzar en algo importante.",
    });
  }

  return NextResponse.json({
    senales,
    stats: {
      tareasHoy: tareasHoy.length,
      habitosHoy: habHoy.length,
      habitosTotal: habitos.length,
      vencimientosProximos: vencen.length,
      bloqueActual: bloqueActual?.actividad || null,
    },
  });
}
