// Interpreta texto libre con el mismo parser del bot y devuelve los campos para prellenar el formulario (no guarda nada)
import { NextRequest, NextResponse } from "next/server";
import { resolverVehiculo, vehiculosActivos } from "@/lib/vehiculos/core";
import { parsearMensaje } from "@/lib/vehiculos/parser";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KM_OBLIGATORIO = new Set(["aceite", "service", "neumaticos"]);

export async function POST(req: NextRequest) {
  const { texto, vehiculoId } = await req.json();
  if (!texto?.trim()) return NextResponse.json({ error: "Escribí algo primero" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });

  const vehiculos = await vehiculosActivos();
  if (!vehiculos.length) return NextResponse.json({ error: "Primero agregá un vehículo" }, { status: 400 });

  const p = await parsearMensaje(texto, vehiculos);
  if (p.tipo !== "carga_combustible" && p.tipo !== "mantenimiento") {
    return NextResponse.json({ error: "No lo reconocí como una carga o un mantenimiento. Probá con algo como \"35 litros, 45 lucas, 87.400 km\"." }, { status: 422 });
  }

  // Si no nombra un vehículo, se usa el que está abierto en pantalla
  const vehiculo = p.vehiculo_alias
    ? resolverVehiculo(vehiculos, p.vehiculo_alias)
    : vehiculos.find(v => v.id === vehiculoId) ?? resolverVehiculo(vehiculos, null);

  const d = p.datos;
  const faltan = new Set<string>();
  const avisos: string[] = [];
  if (p.tipo === "carga_combustible") {
    if (d.litros == null) faltan.add("litros");
    if (d.odometro == null) faltan.add("odometro");
    if (d.monto_total == null && d.precio_litro == null) faltan.add("monto");
  } else if (d.odometro == null && KM_OBLIGATORIO.has(d.subtipo ?? "")) {
    faltan.add("odometro");
  }
  if (d.odometro != null && vehiculo?.kmActual != null && d.odometro < vehiculo.kmActual) {
    faltan.add("odometro");
    avisos.push(`El km (${d.odometro.toLocaleString("es-AR")}) es menor al último registrado (${vehiculo.kmActual.toLocaleString("es-AR")}). Revisalo.`);
  }
  if (p.vehiculo_alias && !vehiculo) avisos.push(`No encontré el vehículo "${p.vehiculo_alias}". Elegilo arriba.`);

  const monto = d.monto_total ?? d.monto ?? (d.precio_litro && d.litros ? d.precio_litro * d.litros : null);

  return NextResponse.json({
    kind: p.tipo === "carga_combustible" ? "carga" : "mantenimiento",
    vehiculoId: vehiculo?.id ?? null,
    valores: {
      fecha: d.fecha ?? null,
      litros: d.litros ?? null,
      monto,
      odometro: d.odometro ?? null,
      tanqueLleno: d.tanque_lleno ?? true,
      tipo: d.subtipo ?? null,
      descripcion: d.descripcion ?? null,
      venceFecha: d.vence_fecha ?? null,
    },
    faltan: Array.from(faltan),
    avisos,
  });
}
