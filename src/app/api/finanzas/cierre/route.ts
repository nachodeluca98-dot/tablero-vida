import { NextRequest, NextResponse } from "next/server";
import { anioMesActual, sumarMeses } from "@/lib/finanzas/fechas";
import {
  abrirMes, cerrarMes, configurarAhorro, confirmarAportes, crearCuenta, crearFondoEmergencia, datosCierre, ErrorCierre, finalizarCierre, guardarPatrimonio,
} from "@/lib/finanzas/cierre";

export const dynamic = "force-dynamic";

const mesValido = (m: unknown) => (typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null);

export async function GET(req: NextRequest) {
  return NextResponse.json(await datosCierre(mesValido(req.nextUrl.searchParams.get("mes")) ?? sumarMeses(anioMesActual(), -1)));
}

// Acciones del asistente de cierre y apertura (spec §6.4). Todas devuelven los datos actualizados.
export async function POST(req: NextRequest) {
  const b = await req.json();
  const mes = mesValido(b.mes);
  if (!mes) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
  const siguiente = sumarMeses(mes, 1);
  try {
    switch (b.accion) {
      case "cuenta": await crearCuenta(b.cuenta ?? {}); break;
      case "fondo": await crearFondoEmergencia(); break;
      case "patrimonio": await guardarPatrimonio(mes, Array.isArray(b.saldos) ? b.saldos : []); break;
      case "aportes": await confirmarAportes(mes, Array.isArray(b.aportes) ? b.aportes : []); break;
      case "cerrar": await cerrarMes(mes); break;
      case "abrir": await abrirMes(siguiente, { tipoCambio: b.tipoCambio, fuenteTc: b.fuenteTc, ajustePct: b.ajustePct }); break;
      case "ahorro": await configurarAhorro(siguiente, { monto: Number(b.monto) || 0, moneda: b.moneda === "USD" ? "USD" : "ARS", metaId: b.metaId ?? null }); break;
      case "finalizar": await finalizarCierre(String(b.revisionId), siguiente); break;
      default: return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof ErrorCierre) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return NextResponse.json(await datosCierre(mes));
}
