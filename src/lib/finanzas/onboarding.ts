// Onboarding (spec §6.1). Cada paso se guarda al confirmarlo, así el asistente se puede cerrar y retomar:
// el estado se reconstruye desde la base (ítems con origen "onboarding" del mes en curso).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { equivalentes, sumarMontos, type Moneda } from "./dinero";
import { anioMesActual } from "./fechas";
import { actualizarTipoCambio, obtenerMes, obtenerPreferencias, ultimoTipoCambio } from "./meses";
import { FIJOS, PASOS_ONBOARDING, VARIABLES } from "./plantillas";

export type ItemOnboarding = { concepto: string; categoriaId: string; monto: number; moneda: Moneda; naturaleza?: "esencial" | "discrecional" };

const CAT_INGRESO = "fincat_honorarios";
const CAT_AHORRO = "fincat_ahorro";

export async function estadoOnboarding() {
  const anioMes = anioMesActual();
  const [prefs, mes] = await Promise.all([obtenerPreferencias(), obtenerMes(anioMes)]);
  const [items, tarjetas, fondo, sugerido] = await Promise.all([
    prisma.finPresupuestoItem.findMany({
      where: { mesId: mes.id, origen: "onboarding", activo: true },
      include: { categoria: { select: { tipo: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.finTarjeta.findMany({ where: { activa: true }, orderBy: { createdAt: "asc" }, select: { nombre: true, diaCierre: true } }),
    prisma.finMeta.findFirst({ where: { tipo: "fondo_emergencia", activa: true } }),
    mes.tipoCambio == null ? ultimoTipoCambio(anioMes) : Promise.resolve(null),
  ]);

  const aItem = (i: (typeof items)[number]): ItemOnboarding => ({
    concepto: i.concepto,
    categoriaId: i.categoriaId,
    monto: i.montoOriginal.toNumber(),
    moneda: i.monedaOriginal,
    naturaleza: i.naturaleza,
  });
  const ingresos = items.filter((i) => i.categoria.tipo === "ingreso");
  const gastos = items.filter((i) => i.categoria.tipo === "gasto");
  const ahorro = items.find((i) => i.categoria.tipo === "ahorro");
  const montosDe = (lista: typeof items) =>
    sumarMontos(lista.map((i) => ({ ars: i.montoArs?.toNumber() ?? null, usd: i.montoUsd?.toNumber() ?? null })));

  const resumen = {
    ingresos: montosDe(ingresos),
    fijos: montosDe(gastos.filter((i) => i.fijoVariable === "fijo")),
    variables: montosDe(gastos.filter((i) => i.fijoVariable === "variable")),
    ahorro: montosDe(ahorro ? [ahorro] : []),
  };

  return {
    paso: prefs.onboardingPaso,
    anioMes,
    tipoCambio: mes.tipoCambio?.toNumber() ?? null,
    fuenteTc: mes.fuenteTc,
    tcSugerido: sugerido?.tipoCambio?.toNumber() ?? null,
    ingreso: {
      moneda: (ingresos.length > 1 ? "ambas" : ingresos[0]?.monedaOriginal ?? null) as Moneda | "ambas" | null,
      ars: ingresos.find((i) => i.monedaOriginal === "ARS")?.montoOriginal.toNumber() ?? null,
      usd: ingresos.find((i) => i.monedaOriginal === "USD")?.montoOriginal.toNumber() ?? null,
    },
    fijos: gastos.filter((i) => i.fijoVariable === "fijo").map(aItem),
    variables: gastos.filter((i) => i.fijoVariable === "variable").map(aItem),
    ahorro: ahorro ? { monto: ahorro.montoOriginal.toNumber(), moneda: ahorro.monedaOriginal } : null,
    tieneFondo: !!fondo,
    tarjetas,
    resumen,
  };
}

export type EstadoOnboarding = Awaited<ReturnType<typeof estadoOnboarding>>;

// ─── Guardar pasos ──────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

async function reemplazarItems(
  tx: Tx,
  mes: { id: string; tipoCambio: Prisma.Decimal | null },
  filtro: Prisma.FinPresupuestoItemWhereInput,
  nuevos: (ItemOnboarding & { fijoVariable: "fijo" | "variable" })[]
) {
  await tx.finPresupuestoItem.deleteMany({ where: { mesId: mes.id, origen: "onboarding", ...filtro } });
  const tc = mes.tipoCambio?.toNumber() ?? null;
  const cats = await tx.finCategoria.findMany({
    where: { id: { in: nuevos.map((n) => n.categoriaId) } },
    select: { id: true, naturalezaDefault: true },
  });
  for (const n of nuevos) {
    if (!(n.monto > 0)) continue;
    const eq = equivalentes(n.monto, n.moneda, tc);
    const plantilla = [...FIJOS, ...VARIABLES].find((p) => p.concepto === n.concepto);
    await tx.finPresupuestoItem.create({
      data: {
        mesId: mes.id,
        categoriaId: cats.some((c) => c.id === n.categoriaId) ? n.categoriaId : "fincat_varios",
        concepto: n.concepto.trim() || "Sin nombre",
        montoOriginal: new Prisma.Decimal(n.monto),
        monedaOriginal: n.moneda,
        montoArs: eq.ars == null ? null : new Prisma.Decimal(eq.ars),
        montoUsd: eq.usd == null ? null : new Prisma.Decimal(eq.usd),
        recurrente: true,
        fijoVariable: n.fijoVariable,
        naturaleza: n.naturaleza ?? plantilla?.naturaleza ?? cats.find((c) => c.id === n.categoriaId)?.naturalezaDefault ?? "esencial",
        origen: "onboarding",
      },
    });
  }
}

const limpiarItems = (lista: unknown): ItemOnboarding[] =>
  (Array.isArray(lista) ? lista : [])
    .filter((x): x is ItemOnboarding => !!x && typeof x.concepto === "string" && typeof x.categoriaId === "string" && Number(x.monto) > 0)
    .map((x) => ({ concepto: x.concepto.slice(0, 80), categoriaId: x.categoriaId, monto: Number(x.monto), moneda: x.moneda === "USD" ? "USD" : "ARS", naturaleza: x.naturaleza }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function guardarPaso(paso: string, datos: any, saltear: boolean) {
  const idx = PASOS_ONBOARDING.indexOf(paso as (typeof PASOS_ONBOARDING)[number]);
  if (idx < 0) throw new Error("Paso inválido");
  const anioMes = anioMesActual();
  let mes = await obtenerMes(anioMes);

  if (!saltear) {
    switch (paso) {
      case "ingreso": {
        const moneda = datos?.moneda as Moneda | "ambas";
        const nuevos: ItemOnboarding[] = [];
        if ((moneda === "ARS" || moneda === "ambas") && Number(datos.ars) > 0)
          nuevos.push({ concepto: moneda === "ambas" ? "Ingreso en pesos" : "Ingreso mensual", categoriaId: CAT_INGRESO, monto: Number(datos.ars), moneda: "ARS" });
        if ((moneda === "USD" || moneda === "ambas") && Number(datos.usd) > 0)
          nuevos.push({ concepto: moneda === "ambas" ? "Ingreso en dólares" : "Ingreso mensual", categoriaId: CAT_INGRESO, monto: Number(datos.usd), moneda: "USD" });
        await prisma.$transaction((tx) =>
          reemplazarItems(tx, mes, { categoria: { tipo: "ingreso" } }, nuevos.map((n) => ({ ...n, fijoVariable: "fijo" })))
        );
        break;
      }
      case "tipo_cambio": {
        const tc = Number(datos?.tipoCambio);
        if (!(tc > 0)) throw new Error("El tipo de cambio tiene que ser un número mayor a 0");
        mes = await actualizarTipoCambio(anioMes, tc, datos?.fuenteTc ?? null);
        break;
      }
      case "fijos":
        await prisma.$transaction((tx) =>
          reemplazarItems(tx, mes, { categoria: { tipo: "gasto" }, fijoVariable: "fijo" }, limpiarItems(datos?.items).map((n) => ({ ...n, fijoVariable: "fijo" })))
        );
        break;
      case "variables":
        await prisma.$transaction((tx) =>
          reemplazarItems(tx, mes, { categoria: { tipo: "gasto" }, fijoVariable: "variable" }, limpiarItems(datos?.items).map((n) => ({ ...n, fijoVariable: "variable" })))
        );
        break;
      case "ahorro": {
        const monto = Number(datos?.monto);
        await prisma.$transaction(async (tx) => {
          await reemplazarItems(
            tx, mes, { categoria: { tipo: "ahorro" } },
            monto > 0 ? [{ concepto: "Ahorro", categoriaId: CAT_AHORRO, monto, moneda: datos?.moneda === "USD" ? "USD" : "ARS", fijoVariable: "fijo" }] : []
          );
          if (datos?.crearFondo && !(await tx.finMeta.findFirst({ where: { tipo: "fondo_emergencia", activa: true } }))) {
            await tx.finMeta.create({ data: { nombre: "Fondo de emergencia", tipo: "fondo_emergencia", icono: "🛟", mesesCobertura: 6 } });
          }
        });
        break;
      }
      case "tarjetas": {
        const lista = (Array.isArray(datos?.tarjetas) ? datos.tarjetas : [])
          .map((t: { nombre?: string; diaCierre?: number }) => ({ nombre: String(t?.nombre ?? "").trim().slice(0, 40), diaCierre: Math.round(Number(t?.diaCierre)) }))
          .filter((t: { nombre: string; diaCierre: number }) => t.nombre && t.diaCierre >= 1 && t.diaCierre <= 31);
        await prisma.$transaction(async (tx) => {
          const existentes = await tx.finTarjeta.findMany({ where: { activa: true } });
          let hayDefault = existentes.some((t) => t.esDefault);
          for (const t of lista) {
            const ya = existentes.find((e) => e.nombre.toLowerCase() === t.nombre.toLowerCase());
            if (ya) {
              await tx.finTarjeta.update({ where: { id: ya.id }, data: { diaCierre: t.diaCierre } });
            } else {
              await tx.finTarjeta.create({ data: { nombre: t.nombre, diaCierre: t.diaCierre, esDefault: !hayDefault } });
              hayDefault = true;
            }
          }
        });
        break;
      }
    }
  }

  // "listo" cierra el onboarding; el resto avanza al paso siguiente
  const siguiente = paso === "listo" ? -1 : idx + 1;
  await prisma.finPreferencias.update({ where: { id: "user" }, data: { onboardingPaso: siguiente } });
  return estadoOnboarding();
}

// Volver a un paso anterior sin perder lo cargado
export async function irAPaso(paso: string) {
  const idx = PASOS_ONBOARDING.indexOf(paso as (typeof PASOS_ONBOARDING)[number]);
  if (idx < 0) throw new Error("Paso inválido");
  await obtenerPreferencias();
  await prisma.finPreferencias.update({ where: { id: "user" }, data: { onboardingPaso: idx } });
  return estadoOnboarding();
}
