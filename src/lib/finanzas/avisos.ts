// Avisos por Telegram (spec §8). Telegram solo avisa: cada mensaje trae un botón que abre la app
// en la pantalla exacta. Corre una vez por día desde el cron del briefing.
// Reglas: máximo 2 mensajes por día (si hay más, se agrupan), cada tipo se puede apagar,
// las alertas de categoría van una vez por umbral por mes y nada se repite.
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/compartido/canal";
import { escapeHtml } from "@/lib/telegram";
import { fmtArs } from "./dinero";
import { anioMesActual, diaReal, diasDelMes, fechaDB, hoyISO, nombreMes, sumarMeses } from "./fechas";
import { obtenerMes, obtenerPreferencias } from "./meses";
import { datosPresupuesto } from "./presupuesto";

export const TIPOS_AVISO = {
  revision: "Revisión quincenal",
  cierre: "Cierre de mes",
  recordatorio: "Recordatorio de revisión pendiente",
  tipo_cambio: "Tipo de cambio sin cargar",
  categoria_80: "Categoría al 80%",
  categoria_superada: "Categoría superada",
  vencimiento: "Vencimiento de un fijo",
  fin_cuotas: "Fin de cuotas",
  reenganche: "Volver a las revisiones",
} as const;
export type TipoAviso = keyof typeof TIPOS_AVISO;

// Orden de importancia: si hay más de 2, los primeros van solos y el resto se agrupa
const PRIORIDAD: TipoAviso[] = ["cierre", "revision", "vencimiento", "categoria_superada", "recordatorio", "reenganche", "tipo_cambio", "categoria_80", "fin_cuotas"];

export type Aviso = { tipo: TipoAviso; clave: string; texto: string; boton: { texto: string; ruta: string } };

// URL pública de la app para los botones (deep links)
export function urlApp(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return base ? base.replace(/\/$/, "") : null;
}

async function yaEnviado(clave: string) {
  return !!(await prisma.finAviso.findUnique({ where: { clave } }));
}

// ─── Qué corresponde avisar hoy ─────────────────────────────────

export async function avisosDeHoy(): Promise<Aviso[]> {
  const prefs = await obtenerPreferencias();
  if (prefs.onboardingPaso !== -1) return []; // sin presupuesto armado no hay nada que avisar

  const hoy = hoyISO();
  const anioMes = anioMesActual();
  const dia = Number(hoy.slice(8, 10));
  const ultimoDia = diasDelMes(anioMes);
  const out: Aviso[] = [];
  const sumar = async (a: Aviso) => { if (!(await yaEnviado(a.clave))) out.push(a); };

  // Revisión quincenal y cierre (el último día del mes es cierre)
  const diasRev = Array.from(new Set(prefs.diasRevision.map((d) => diaReal(anioMes, d))));
  if (dia === ultimoDia) {
    await sumar({
      tipo: "cierre", clave: `cierre:${anioMes}`,
      texto: `📅 <b>Hoy se cierra ${nombreMes(anioMes)}</b>\nConfirmás fijos y saldos y dejamos listo ${nombreMes(sumarMeses(anioMes, 1))}. Unos 7 minutos.`,
      boton: { texto: "Cerrar el mes", ruta: `/finanzas/revision?tipo=cierre&mes=${anioMes}` },
    });
  } else if (diasRev.includes(dia)) {
    const hecha = await prisma.finRevision.findFirst({ where: { tipo: "quincenal", estado: { in: ["completa", "salteada"] }, fecha: { gte: fechaDB(hoy) } } });
    if (!hecha) await sumar({
      tipo: "revision", clave: `rev:${hoy}`,
      texto: `📝 <b>Es día de revisión</b>\nTildás los fijos, dictás los variables y ves cómo vas. Menos de 5 minutos.`,
      boton: { texto: "Abrir revisión", ruta: `/finanzas/revision?tipo=quincenal&mes=${anioMes}` },
    });
  }

  // Recordatorio: un aviso de revisión o cierre de hace más de 24 h que sigue pendiente
  const hace24 = new Date(Date.now() - 24 * 3600e3);
  const hace4d = new Date(Date.now() - 4 * 24 * 3600e3);
  const previos = await prisma.finAviso.findMany({ where: { tipo: { in: ["revision", "cierre"] }, enviadoAt: { lte: hace24, gte: hace4d } } });
  for (const p of previos) {
    const [, ref] = p.clave.split(":");
    let pendiente: boolean;
    let ruta: string;
    if (p.tipo === "cierre") {
      const m = await prisma.finMes.findUnique({ where: { anioMes: ref } });
      pendiente = !!m && m.estado === "abierto";
      ruta = `/finanzas/revision?tipo=cierre&mes=${ref}`;
    } else {
      pendiente = !(await prisma.finRevision.findFirst({ where: { tipo: "quincenal", estado: { in: ["completa", "salteada"] }, fecha: { gte: fechaDB(ref) } } }));
      ruta = `/finanzas/revision?tipo=quincenal&mes=${ref.slice(0, 7)}`;
    }
    if (pendiente) await sumar({
      tipo: "recordatorio", clave: `rec:${p.clave}`,
      texto: p.tipo === "cierre"
        ? `⏳ El cierre de ${nombreMes(ref)} quedó pendiente. Lo retomás donde lo dejaste.`
        : `⏳ La revisión quedó pendiente. Si andás con poco tiempo, la exprés es de un minuto.`,
      boton: { texto: "Retomar", ruta },
    });
  }

  // Tipo de cambio sin cargar desde el día 2
  const mes = await obtenerMes(anioMes);
  if (dia >= 2 && mes.tipoCambio == null) await sumar({
    tipo: "tipo_cambio", clave: `tc:${anioMes}`,
    texto: `💱 Falta el tipo de cambio de ${nombreMes(anioMes)}. Con eso ves todo en pesos y en dólares.`,
    boton: { texto: "Cargar TC", ruta: "/finanzas" },
  });

  // Categorías al 80% y superadas (una vez por umbral por mes)
  const p = await datosPresupuesto(anioMes);
  for (const g of p.grupos.filter((x) => x.tipo === "gasto" && (x.previsto.ars ?? 0) > 0)) {
    const pct = (g.real.ars ?? 0) / (g.previsto.ars ?? 1);
    if (pct >= 1) {
      await sumar({
        tipo: "categoria_superada", clave: `catsup:${g.id}:${anioMes}`,
        texto: `${g.icono ?? "📊"} <b>${escapeHtml(g.nombre)}</b> llegó a lo previsto (${fmtArs(g.real.ars)} de ${fmtArs(g.previsto.ars)}). Podés cubrir la diferencia desde otra categoría.`,
        boton: { texto: "Reasignar", ruta: `/finanzas/presupuesto?mes=${anioMes}&reasignar=1&categoria=${g.id}` },
      });
    } else if (pct >= 0.8 && !(await yaEnviado(`catsup:${g.id}:${anioMes}`))) {
      await sumar({
        tipo: "categoria_80", clave: `cat80:${g.id}:${anioMes}`,
        texto: `${g.icono ?? "📊"} En <b>${escapeHtml(g.nombre)}</b> ya usaste el ${Math.round(pct * 100)}% de lo previsto. Te quedan ${fmtArs((g.previsto.ars ?? 0) - (g.real.ars ?? 0))}.`,
        boton: { texto: "Ver categoría", ruta: `/finanzas/movimientos?mes=${anioMes}&categoria=${g.id}` },
      });
    }
  }

  // Vencimientos: 2 días antes de un fijo sin pagar
  const vencen = await prisma.finPresupuestoItem.findMany({
    where: { mesId: mes.id, activo: true, fijoVariable: "fijo", frecuencia: "mensual", diaVencimiento: { not: null }, registros: { none: {} } },
  });
  for (const it of vencen) {
    if (diaReal(anioMes, it.diaVencimiento!) - dia !== 2) continue;
    await sumar({
      tipo: "vencimiento", clave: `venc:${it.id}`,
      texto: `🗓️ <b>${escapeHtml(it.concepto)}</b> vence pasado mañana (${it.monedaOriginal === "USD" ? "US$ " + it.montoOriginal.toNumber() : fmtArs(it.montoOriginal.toNumber())}). Cuando lo pagues, lo tildás en un toque.`,
      boton: { texto: "Marcar pagado", ruta: `/finanzas/revision?tipo=quincenal&mes=${anioMes}&modo=expres` },
    });
  }

  // Fin de cuotas: este mes se paga la última
  const planes = await prisma.finPlanCuotas.findMany({ where: { mesPrimeraCuota: { lte: anioMes } } });
  for (const pl of planes.filter((x) => sumarMeses(x.mesPrimeraCuota, x.cuotasTotal - 1) === anioMes)) {
    await sumar({
      tipo: "fin_cuotas", clave: `fincuotas:${pl.id}`,
      texto: `🎉 Este mes pagás la última cuota de <b>${escapeHtml(pl.descripcion)}</b>. El mes que viene se libera ${fmtArs(pl.montoCuota.toNumber())}.`,
      boton: { texto: "Ver cuotas", ruta: "/finanzas/estadisticas" },
    });
  }

  // Reenganche: las 2 últimas revisiones se saltearon
  const ultimas = await prisma.finRevision.findMany({
    where: { tipo: { not: "apertura" }, estado: { in: ["completa", "salteada"] } },
    orderBy: { fecha: "desc" },
    take: 2,
  });
  if (ultimas.length === 2 && ultimas.every((r) => r.estado === "salteada")) await sumar({
    tipo: "reenganche", clave: `reeng:${ultimas[0].id}`,
    texto: `👋 Hace un tiempo que no revisamos juntos. ¿Una exprés? Es solo tildar los fijos, un minuto.`,
    boton: { texto: "Revisión exprés", ruta: `/finanzas/revision?tipo=quincenal&mes=${anioMes}&modo=expres` },
  });

  // Tipos apagados desde Configuración
  const apagados = (prefs.avisosTelegram ?? {}) as Record<string, boolean>;
  return out
    .filter((a) => apagados[a.tipo] !== false)
    .sort((a, b) => PRIORIDAD.indexOf(a.tipo) - PRIORIDAD.indexOf(b.tipo));
}

// ─── Enviar ─────────────────────────────────────────────────────

const MAX_POR_DIA = 2;

export async function enviarAvisosFinanzas(opciones: { simular?: boolean } = {}) {
  const avisos = await avisosDeHoy();
  // Lo ya mandado hoy (por si el cron corre más de una vez) cuenta para el máximo
  const inicioHoy = new Date(`${hoyISO()}T03:00:00.000Z`); // 00:00 en Argentina
  const enviadosHoy = await prisma.finAviso.count({ where: { enviadoAt: { gte: inicioHoy } } });
  const lugar = Math.max(0, MAX_POR_DIA - enviadosHoy);
  if (!avisos.length || !lugar) return { avisos: avisos.map((a) => a.clave), mensajes: [], enviados: 0 };

  const base = urlApp();
  const boton = (a: Aviso) => (base ? [{ text: a.boton.texto, url: `${base}${a.boton.ruta}` }] : []);

  // Hasta (lugar - 1) avisos solos; si sobran, el resto agrupado en un último mensaje
  const solos = avisos.length <= lugar ? avisos : avisos.slice(0, lugar - 1);
  const agrupados = avisos.length <= lugar ? [] : avisos.slice(lugar - 1);
  const mensajes: { texto: string; botones: { text: string; url: string }[][]; avisos: Aviso[] }[] = solos.map((a) => ({
    texto: a.texto + (base ? "" : "\n<i>Abrilo desde Finanzas en la app.</i>"),
    botones: boton(a).length ? [boton(a)] : [],
    avisos: [a],
  }));
  if (agrupados.length) {
    mensajes.push({
      texto: `💸 <b>Finanzas</b>\n\n${agrupados.map((a) => `• ${a.texto.replace(/\n/g, " ")}`).join("\n\n")}`,
      botones: base ? agrupados.slice(0, 4).map((a) => boton(a)) : [],
      avisos: agrupados,
    });
  }

  if (opciones.simular) return { avisos: avisos.map((a) => a.clave), mensajes: mensajes.map((m) => ({ texto: m.texto, botones: m.botones })), enviados: 0 };

  let enviados = 0;
  for (const m of mensajes) {
    const r = await notificar(m.texto, m.botones);
    if (!r?.ok) continue; // si Telegram falla, se reintenta mañana
    enviados++;
    await prisma.finAviso.createMany({ data: m.avisos.map((a) => ({ clave: a.clave, tipo: a.tipo })), skipDuplicates: true });
  }
  return { avisos: avisos.map((a) => a.clave), enviados };
}

// Para Configuración: el estado de cada tipo
export async function preferenciasAvisos() {
  const prefs = await obtenerPreferencias();
  const apagados = (prefs.avisosTelegram ?? {}) as Record<string, boolean>;
  return (Object.keys(TIPOS_AVISO) as TipoAviso[]).map((t) => ({ tipo: t, nombre: TIPOS_AVISO[t], activo: apagados[t] !== false }));
}

