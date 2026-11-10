// Interpreta texto libre con el mismo parser del bot y devuelve los campos para prellenar el formulario (no guarda nada)
import { NextRequest, NextResponse } from "next/server";
import { resolverVehiculo, vehiculosActivos } from "@/lib/vehiculos/core";
import { parsearMensaje, type Imagen } from "@/lib/vehiculos/parser";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const TIPOS_IMAGEN = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGENES = 3;
const MAX_BASE64 = 2_000_000; // ~1,5 MB por foto: el navegador ya las achica antes de mandarlas

const KM_OBLIGATORIO = new Set(["aceite", "service", "neumaticos"]);

export async function POST(req: NextRequest) {
  const { texto = "", vehiculoId, kind, imagenes: crudas } = await req.json();
  const imagenes: Imagen[] = Array.isArray(crudas)
    ? crudas.filter((i: any) => TIPOS_IMAGEN.has(i?.media_type) && typeof i?.data === "string" && i.data.length <= MAX_BASE64).slice(0, MAX_IMAGENES)
    : [];
  if (Array.isArray(crudas) && crudas.length && !imagenes.length) {
    return NextResponse.json({ error: "No pude leer esa foto. Probá con otra (JPG o PNG)." }, { status: 400 });
  }
  if (!String(texto).trim() && !imagenes.length) return NextResponse.json({ error: "Escribí algo primero" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "La interpretación con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY)." }, { status: 500 });

  const vehiculos = await vehiculosActivos();
  if (!vehiculos.length) return NextResponse.json({ error: "Primero agregá un vehículo" }, { status: 400 });

  const p = await parsearMensaje(String(texto), vehiculos, kind === "carga" || kind === "mantenimiento" ? kind : undefined, imagenes);
  if (p.tipo !== "carga_combustible" && p.tipo !== "mantenimiento") {
    if (imagenes.length) return NextResponse.json({ error: "No encontré datos de una carga ni de un service en la foto. Probá con una más cerca y sin reflejos." }, { status: 422 });
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
      taller: d.taller ?? null,
      estacion: d.estacion ?? null,
      notas: d.notas ?? null,
      venceFecha: d.vence_fecha ?? null,
    },
    faltan: Array.from(faltan),
    avisos,
  });
}
