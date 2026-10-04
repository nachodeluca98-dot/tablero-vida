import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Dos pedidos simultáneos pueden intentar crear la misma fila: el segundo choca con la clave única y relee
async function crearSiFalta<T>(crear: () => Promise<T>, leer: () => Promise<T | null>): Promise<T> {
  try {
    return await crear();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const fila = await leer();
      if (fila) return fila;
    }
    throw e;
  }
}

// Devuelve el mes, creándolo vacío si no existe. Clonar el presupuesto es parte de la apertura (spec §6.4), no de acá.
export async function obtenerMes(anioMes: string) {
  return crearSiFalta(
    () => prisma.finMes.upsert({ where: { anioMes }, update: {}, create: { anioMes } }),
    () => prisma.finMes.findUnique({ where: { anioMes } })
  );
}

// Fila única de preferencias (id "user")
export async function obtenerPreferencias() {
  return crearSiFalta(
    () => prisma.finPreferencias.upsert({ where: { id: "user" }, update: {}, create: { id: "user" } }),
    () => prisma.finPreferencias.findUnique({ where: { id: "user" } })
  );
}

// TC para convertir montos de un mes: el suyo; si todavía no tiene, el último cargado antes (se recalcula al cargarlo)
export async function tcVigente(anioMes: string): Promise<number | null> {
  const m = await prisma.finMes.findFirst({
    where: { anioMes: { lte: anioMes }, tipoCambio: { not: null } },
    orderBy: { anioMes: "desc" },
    select: { tipoCambio: true },
  });
  return m?.tipoCambio?.toNumber() ?? null;
}

// Último tipo de cambio cargado antes de ese mes, para prellenar (spec §2.2.3)
export async function ultimoTipoCambio(anterioresA: string) {
  return prisma.finMes.findFirst({
    where: { anioMes: { lt: anterioresA }, tipoCambio: { not: null } },
    orderBy: { anioMes: "desc" },
    select: { anioMes: true, tipoCambio: true, fuenteTc: true },
  });
}

// Carga o edita el TC del mes y recalcula los equivalentes de ese mes (spec §3.5).
// Los registros con tc_propio no se tocan. La moneda original nunca cambia.
export async function actualizarTipoCambio(anioMes: string, tipoCambio: number, fuenteTc?: string | null) {
  const mes = await obtenerMes(anioMes);
  const tc = new Prisma.Decimal(tipoCambio);
  await prisma.$transaction([
    prisma.finMes.update({
      where: { id: mes.id },
      data: { tipoCambio: tc, ...(fuenteTc !== undefined ? { fuenteTc: fuenteTc || null } : {}) },
    }),
    ...["fin_registros", "fin_presupuesto_items", "fin_aportes_meta"].map((tabla) =>
      prisma.$executeRawUnsafe(
        `UPDATE "${tabla}" SET
           "monto_ars" = CASE WHEN "moneda_original" = 'USD' THEN ROUND("monto_original" * $1::numeric, 2) ELSE "monto_original" END,
           "monto_usd" = CASE WHEN "moneda_original" = 'ARS' THEN ROUND("monto_original" / $1::numeric, 2) ELSE "monto_original" END,
           "updated_at" = NOW()
         WHERE "mes_id" = $2${tabla === "fin_registros" ? ` AND "tc_propio" IS NULL` : ""}`,
        tc.toString(),
        mes.id
      )
    ),
    prisma.$executeRawUnsafe(
      `UPDATE "fin_patrimonio_snapshots" SET
         "saldo_ars" = CASE WHEN "moneda_original" = 'USD' THEN ROUND("saldo_original" * $1::numeric, 2) ELSE "saldo_original" END,
         "saldo_usd" = CASE WHEN "moneda_original" = 'ARS' THEN ROUND("saldo_original" / $1::numeric, 2) ELSE "saldo_original" END,
         "updated_at" = NOW()
       WHERE "mes_id" = $2`,
      tc.toString(),
      mes.id
    ),
  ]);
  return prisma.finMes.findUniqueOrThrow({ where: { id: mes.id } });
}
