// Adopción (spec §7): motor de guías contextuales, marcas de primera vez, racha de revisiones e hitos.
// Todo el estado vive en fin_guias_estado; las marcas y los hitos usan ids con prefijo ("marca:", "hito:").
import { prisma } from "@/lib/prisma";
import { anioMesActual, fechaDB, hoyISO, sumarMeses, TZ } from "./fechas";
import { GUIA_POR_ID, GUIAS, MAX_DESCARTES_GUIA, type Guia, type GuiaId } from "./guias";
import { obtenerPreferencias } from "./meses";

const diaAR = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

// ─── Racha ──────────────────────────────────────────────────────

// Revisiones seguidas completas (las exprés cuentan, spec §7.3)
export async function rachaRevisiones(): Promise<number> {
  const ultimas = await prisma.finRevision.findMany({
    where: { estado: { in: ["completa", "salteada"] }, tipo: { not: "apertura" } },
    orderBy: { fecha: "desc" },
    take: 60,
    select: { estado: true },
  });
  let racha = 0;
  for (const u of ultimas) {
    if (u.estado !== "completa") break;
    racha++;
  }
  return racha;
}

// ─── Condiciones de las guías (spec §7.2) ───────────────────────

type Contexto = { racha: number };

// Grupos de una misma carga por voz: los registros de un guardado comparten (casi) el mismo created_at
function cargasPorVoz(regs: { createdAt: Date }[]) {
  const grupos: number[] = [];
  let ultimo = 0;
  for (const r of [...regs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const t = r.createdAt.getTime();
    if (grupos.length && t - ultimo < 3000) grupos[grupos.length - 1]++;
    else grupos.push(1);
    ultimo = t;
  }
  return grupos;
}

const CONDICIONES: Partial<Record<GuiaId, (c: Contexto) => Promise<boolean>>> = {
  probar_dictar: async () => (await prisma.finRegistro.count({ where: { origen: "app_voz" } })) === 0,

  varios_de_una: async () => {
    const regs = await prisma.finRegistro.findMany({ where: { origen: "app_voz" }, select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 200 });
    const g = cargasPorVoz(regs);
    return g.length >= 2 && g.every((n) => n === 1);
  },

  agrupar_incluye: async () => {
    const desde = fechaDB(new Date(Date.now() - 14 * 864e5).toLocaleDateString("en-CA", { timeZone: TZ }));
    const g = await prisma.finRegistro.groupBy({
      by: ["fecha", "categoriaId"],
      where: { tipo: "gasto", fecha: { gte: desde }, categoriaId: { not: null }, incluye: null, planCuotasId: null },
      _count: true,
      having: { categoriaId: { _count: { gte: 3 } } },
    });
    return g.length > 0;
  },

  modo_expres: async () => {
    const ultima = await prisma.finRevision.findFirst({ where: { tipo: { not: "apertura" }, estado: { in: ["completa", "salteada"] } }, orderBy: { fecha: "desc" } });
    if (ultima?.estado !== "salteada") return false;
    return (await prisma.finRevision.count({ where: { modo: "expres", estado: "completa" } })) === 0;
  },

  fondo_emergencia: async () =>
    (await prisma.finMes.count({ where: { estado: "cerrado" } })) >= 1 && (await prisma.finMeta.count({ where: { activa: true } })) === 0,

  seguir_patrimonio: async () =>
    (await prisma.finMes.count({ where: { estado: "cerrado" } })) >= 2 && (await prisma.finCuenta.count()) === 0,

  tarjetas_resumenes: async () =>
    (await prisma.finTarjeta.count()) === 0 && (await prisma.finRegistro.count({ where: { medioPago: "tarjeta_credito" } })) > 0,

  gastos_anuales: async () =>
    (await prisma.finPresupuestoItem.count({ where: { activo: true, frecuencia: { not: "mensual" }, mes: { anioMes: { gte: anioMesActual() } } } })) > 0,

  reasignar: async () => {
    const am = anioMesActual();
    const [items, gastos, reasig] = await Promise.all([
      prisma.finPresupuestoItem.groupBy({ by: ["categoriaId"], where: { activo: true, mes: { anioMes: am }, categoria: { tipo: "gasto" } }, _sum: { montoArs: true } }),
      prisma.finRegistro.groupBy({ by: ["categoriaId"], where: { tipo: "gasto", mes: { anioMes: am }, categoriaId: { not: null } }, _sum: { montoArs: true } }),
      prisma.finPresupuestoItem.count({ where: { origen: "reasignacion", mes: { anioMes: am } } }),
    ]);
    if (reasig > 0) return false;
    return gastos.some((g) => {
      const p = items.find((i) => i.categoriaId === g.categoriaId)?._sum.montoArs?.toNumber();
      return !!p && (g._sum.montoArs?.toNumber() ?? 0) > p;
    });
  },

  mirar_estadisticas: async () => (await prisma.finMes.count({ where: { estado: "cerrado" } })) >= 1,

  racha: async (c) => c.racha >= 3,
};

// ─── Guía contextual sugerida ───────────────────────────────────

export type GuiaVisible = Pick<Guia, "id" | "titulo" | "texto" | "accion">;

// Reglas (spec §7.2): una sola visible a la vez, máximo una nueva por día, si se descarta 2 veces no vuelve,
// y se apagan todas desde Configuración. Las revisiones y el onboarding (asistentes) ya tienen prioridad en
// "Tu próximo paso", así que una guía nunca aparece con un asistente pendiente.
export async function guiaSugerida(racha?: number): Promise<GuiaVisible | null> {
  const prefs = await obtenerPreferencias();
  if (!prefs.mostrarGuias || prefs.onboardingPaso !== -1) return null;

  const hoy = hoyISO();
  const estados = await prisma.finGuiaEstado.findMany({ where: { guiaId: { in: GUIAS.map((g) => g.id) } } });
  const est = new Map(estados.map((e) => [e.guiaId, e]));
  const terminada = (id: string) => {
    const e = est.get(id);
    return !!e && (e.estado === "completada" || e.estado === "descartada" || e.vecesDescartada >= MAX_DESCARTES_GUIA);
  };

  // La guía de hoy, si ya hubo una: se sigue mostrando mientras aplique y no se haya pospuesto hoy
  const deHoy = estados.find((e) => e.ultimaVezMostrada && diaAR(e.ultimaVezMostrada) === hoy);
  const ctx: Contexto = { racha: racha ?? (await rachaRevisiones()) };
  const aplica = async (id: GuiaId) => !terminada(id) && !!CONDICIONES[id] && (await CONDICIONES[id]!(ctx));

  if (deHoy) {
    const id = deHoy.guiaId as GuiaId;
    const pospuestaHoy = deHoy.estado === "pendiente"; // "Ahora no" la vuelve a pendiente
    return !pospuestaHoy && GUIA_POR_ID[id] && (await aplica(id)) ? visible(GUIA_POR_ID[id]) : null;
  }

  for (const g of [...GUIAS].sort((a, b) => a.orden - b.orden)) {
    if (!(await aplica(g.id))) continue;
    const ahora = new Date();
    await prisma.finGuiaEstado.upsert({
      where: { guiaId: g.id },
      create: { guiaId: g.id, estado: "vista", vistaAt: ahora, vecesMostrada: 1, ultimaVezMostrada: ahora },
      update: { estado: "vista", vistaAt: est.get(g.id)?.vistaAt ?? ahora, vecesMostrada: { increment: 1 }, ultimaVezMostrada: ahora },
    });
    return visible(g);
  }
  return null;
}

const visible = (g: Guia): GuiaVisible => ({ id: g.id, titulo: g.titulo, texto: g.texto, accion: g.accion });

export type RespuestaGuia = "completar" | "ahora_no" | "no_mostrar";

export async function responderGuia(id: string, r: RespuestaGuia) {
  if (!(id in GUIA_POR_ID)) return;
  const data =
    r === "completar" ? { estado: "completada" as const }
    : r === "no_mostrar" ? { estado: "descartada" as const, vecesDescartada: { increment: 1 } }
    : { estado: "pendiente" as const, vecesDescartada: { increment: 1 } };
  await prisma.finGuiaEstado.upsert({
    where: { guiaId: id },
    create: { guiaId: id, ...data, vecesDescartada: r === "completar" ? 0 : 1 },
    update: data,
  });
}

// ─── Marcas de primera vez (spec §7.1, formato 1) ───────────────

export const MARCAS = {
  movimientos: "Tocá un movimiento para ver el detalle y editarlo en el lugar.",
  presupuesto: "Tocá un monto para editarlo. Si una categoría se pasa, la podés cubrir desde otra.",
  estadisticas: "Tocá cualquier barra o número para ver esos movimientos.",
  metas: "Tocá una meta para ver su historial y aportar.",
  patrimonio: "Tocá un saldo para corregirlo. En cada cierre de mes solo lo confirmás.",
  clasificar: "Tocá la categoría sugerida o elegí otra: un toque por movimiento.",
} as const;
export type MarcaId = keyof typeof MARCAS;

export async function marcaPendiente(id: MarcaId): Promise<string | null> {
  const prefs = await obtenerPreferencias();
  if (!prefs.mostrarGuias) return null;
  const e = await prisma.finGuiaEstado.findUnique({ where: { guiaId: `marca:${id}` } });
  return e ? null : MARCAS[id];
}

export async function cerrarMarca(id: MarcaId) {
  await prisma.finGuiaEstado.upsert({
    where: { guiaId: `marca:${id}` },
    create: { guiaId: `marca:${id}`, estado: "completada", vistaAt: new Date(), vecesMostrada: 1 },
    update: { estado: "completada" },
  });
}

// ─── Hitos (spec §7.3) ──────────────────────────────────────────

export type Hito = { id: string; icono: string; titulo: string; texto: string; anteriores: string[] };

type MetaResumen = { id: string; nombre: string; tipo: string; progreso: number | null; mesesCubiertos: number | null };

// Devuelve el hito más importante sin celebrar (como máximo uno por día). Al celebrarlo también se dan por celebrados los
// "anteriores" (ej.: si ya cerró 3 meses seguidos no tiene sentido festejar después el primero).
export async function hitoPendiente(metas: MetaResumen[]): Promise<Hito | null> {
  const [cerrados, celebrados] = await Promise.all([
    prisma.finMes.findMany({ where: { estado: "cerrado" }, select: { anioMes: true }, orderBy: { anioMes: "desc" } }),
    prisma.finGuiaEstado.findMany({ where: { guiaId: { startsWith: "hito:" } }, select: { guiaId: true, updatedAt: true } }),
  ]);
  // Un festejo por día: si ya se celebró uno hoy, el siguiente espera a mañana
  if (celebrados.some((c) => diaAR(c.updatedAt) === hoyISO())) return null;
  const ya = new Set(celebrados.map((c) => c.guiaId));
  const candidatos: Hito[] = [];

  for (const m of metas) {
    if (m.tipo !== "fondo_emergencia" && m.progreso != null && m.progreso >= 1) {
      candidatos.push({ id: `hito:meta_${m.id}`, icono: "🏆", titulo: `¡Llegaste a ${m.nombre}!`, texto: "Meta cumplida. Cuando quieras, armá la próxima.", anteriores: [] });
    }
    if (m.tipo === "fondo_emergencia" && m.mesesCubiertos != null && m.mesesCubiertos >= 1) {
      const n = Math.floor(m.mesesCubiertos);
      candidatos.push({
        id: `hito:fondo_${n}`, icono: "🛟",
        titulo: n === 1 ? "Tu fondo ya cubre un mes" : `Tu fondo ya cubre ${n} meses`,
        texto: n === 1 ? "Un mes entero de gastos esenciales a salvo. Buen arranque." : "Cada mes cubierto es tranquilidad extra.",
        anteriores: Array.from({ length: n - 1 }, (_, i) => `hito:fondo_${i + 1}`),
      });
    }
  }

  // Meses seguidos cerrados, contando hacia atrás desde el último cierre
  let seguidos = 0;
  for (let i = 0; i < cerrados.length; i++) {
    if (i > 0 && cerrados[i].anioMes !== sumarMeses(cerrados[i - 1].anioMes, -1)) break;
    seguidos++;
  }
  if (seguidos >= 3) {
    candidatos.push({ id: "hito:tres_meses", icono: "🔥", titulo: "3 meses seguidos cerrados", texto: "Ya es un hábito: sabés exactamente a dónde va tu plata.", anteriores: ["hito:primer_mes"] });
  }
  if (cerrados.length >= 1) {
    candidatos.push({ id: "hito:primer_mes", icono: "🎉", titulo: "Cerraste tu primer mes", texto: "Lo más difícil es empezar, y ya lo hiciste.", anteriores: [] });
  }
  return candidatos.find((h) => !ya.has(h.id)) ?? null;
}

export async function celebrarHito(id: string, anteriores: string[] = []) {
  const ids = [id, ...anteriores].filter((x) => x.startsWith("hito:"));
  await prisma.$transaction(
    ids.map((guiaId) =>
      prisma.finGuiaEstado.upsert({ where: { guiaId }, create: { guiaId, estado: "completada", vistaAt: new Date() }, update: { estado: "completada" } })
    )
  );
}
