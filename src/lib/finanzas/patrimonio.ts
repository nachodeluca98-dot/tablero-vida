// Patrimonio (spec §6.9): total en ARS | USD, evolución mensual y cuentas con el saldo del último cierre.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sumarMontos, type Moneda, type Montos } from "./dinero";
import { anioMesActual, sumarMeses } from "./fechas";

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : d.toNumber());

// Evolución hasta `hasta` (inclusive): por mes, el saldo vigente de cada cuenta (el último snapshot a esa fecha)
export async function evolucionPatrimonio(hasta = anioMesActual(), meses = 12) {
  const desde = sumarMeses(hasta, -(meses - 1));
  const [cuentas, snaps] = await Promise.all([
    prisma.finCuenta.findMany({ orderBy: [{ orden: "asc" }, { createdAt: "asc" }] }),
    prisma.finPatrimonioSnapshot.findMany({
      where: { mes: { anioMes: { lte: hasta } } },
      include: { mes: { select: { anioMes: true } } },
      orderBy: { mes: { anioMes: "asc" } },
    }),
  ]);
  if (!snaps.length) return { meses: [], cuentas: [] };

  const primero = snaps[0].mes.anioMes > desde ? snaps[0].mes.anioMes : desde;
  const lista: string[] = [];
  for (let am = primero; am <= hasta; am = sumarMeses(am, 1)) lista.push(am);

  const saldoA = (cuentaId: string, am: string): Montos | null => {
    const s = snaps.filter((x) => x.cuentaId === cuentaId && x.mes.anioMes <= am).pop();
    return s ? { ars: num(s.saldoArs), usd: num(s.saldoUsd) } : null;
  };
  const conDatos = cuentas.filter((c) => snaps.some((s) => s.cuentaId === c.id));
  return {
    meses: lista.map((am) => ({
      anioMes: am,
      // Total = saldo vigente de cada cuenta activa en ese mes
      total: sumarMontos(conDatos.filter((c) => c.activa).map((c) => saldoA(c.id, am)).filter((x): x is Montos => !!x)),
      porCuenta: Object.fromEntries(conDatos.map((c) => [c.id, saldoA(c.id, am)])),
    })),
    cuentas: conDatos.map((c) => ({ id: c.id, nombre: c.nombre })),
  };
}

export async function datosPatrimonio() {
  const cuentas = await prisma.finCuenta.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { createdAt: "asc" }] });
  const ultimos = await Promise.all(
    cuentas.map((c) =>
      prisma.finPatrimonioSnapshot.findFirst({ where: { cuentaId: c.id }, include: { mes: { select: { anioMes: true } } }, orderBy: { mes: { anioMes: "desc" } } })
    )
  );
  const evolucion = await evolucionPatrimonio();
  return {
    cuentas: cuentas.map((c, i) => ({
      id: c.id, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda as Moneda, icono: c.icono,
      saldo: num(ultimos[i]?.saldoOriginal),
      equivalente: ultimos[i] ? { ars: num(ultimos[i]!.saldoArs), usd: num(ultimos[i]!.saldoUsd) } : null,
      anioMes: ultimos[i]?.mes.anioMes ?? null,
    })),
    evolucion,
  };
}

export type DatosPatrimonio = Awaited<ReturnType<typeof datosPatrimonio>>;
