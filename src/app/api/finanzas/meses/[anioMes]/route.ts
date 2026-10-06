import { NextRequest, NextResponse } from "next/server";
import { actualizarTipoCambio } from "@/lib/finanzas/meses";
import { reabrirMes } from "@/lib/finanzas/presupuesto";

export const dynamic = "force-dynamic";

// Tipo de cambio del mes (spec §3.5) o { reabrir: true } para reabrir un mes cerrado (spec §6.4)
export async function PATCH(req: NextRequest, { params }: { params: { anioMes: string } }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(params.anioMes)) {
    return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
  }
  const b = await req.json();
  if (b.reabrir) {
    const m = await reabrirMes(params.anioMes);
    return NextResponse.json({ anioMes: m.anioMes, estado: m.estado });
  }
  // Número, o texto en formato es-AR ("1.450,50")
  const tc = typeof b.tipoCambio === "number" ? b.tipoCambio : Number(String(b.tipoCambio ?? "").replace(/\./g, "").replace(",", "."));
  if (!isFinite(tc) || tc <= 0) return NextResponse.json({ error: "El tipo de cambio tiene que ser un número mayor a 0" }, { status: 400 });
  const mes = await actualizarTipoCambio(params.anioMes, tc, b.fuenteTc);
  return NextResponse.json({ anioMes: mes.anioMes, tipoCambio: mes.tipoCambio?.toNumber() ?? null, fuenteTc: mes.fuenteTc });
}
