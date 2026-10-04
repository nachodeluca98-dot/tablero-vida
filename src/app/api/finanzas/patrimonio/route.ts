import { NextRequest, NextResponse } from "next/server";
import { crearCuenta, ErrorCierre, guardarPatrimonio } from "@/lib/finanzas/cierre";
import { anioMesActual } from "@/lib/finanzas/fechas";
import { datosPatrimonio } from "@/lib/finanzas/patrimonio";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await datosPatrimonio());
}

// { accion: "cuenta", cuenta } | { accion: "saldo", cuentaId, saldo, anioMes? } | { accion: "archivar", cuentaId }
export async function POST(req: NextRequest) {
  const b = await req.json();
  try {
    if (b.accion === "cuenta") await crearCuenta(b.cuenta ?? {});
    else if (b.accion === "saldo") {
      // Se edita el saldo del último cierre de esa cuenta (o el del mes en curso si todavía no tiene)
      const ultimo = await prisma.finPatrimonioSnapshot.findFirst({ where: { cuentaId: String(b.cuentaId) }, include: { mes: true }, orderBy: { mes: { anioMes: "desc" } } });
      await guardarPatrimonio(b.anioMes ?? ultimo?.mes.anioMes ?? anioMesActual(), [{ cuentaId: String(b.cuentaId), saldo: Number(b.saldo) }]);
    } else if (b.accion === "archivar") await prisma.finCuenta.update({ where: { id: String(b.cuentaId) }, data: { activa: false } });
    else return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (e) {
    if (e instanceof ErrorCierre) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return NextResponse.json(await datosPatrimonio());
}
