import Anthropic from "@anthropic-ai/sdk";
import type { Vehiculo } from "@prisma/client";
import { hoyYmd, fmtKm, fmtFecha } from "./core";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type DatosCarga = {
  litros: number | null;
  monto_total: number | null;
  precio_litro: number | null;
  odometro: number | null;
  tanque_lleno: boolean | null;
  estacion: string | null;
  fecha: string | null;
};

export type DatosMant = {
  subtipo: string;
  monto: number | null;
  odometro: number | null;
  taller: string | null;
  descripcion: string | null;
  vence_fecha: string | null;
  fecha: string | null;
};

export type Parseo = {
  tipo: "carga_combustible" | "mantenimiento" | "consulta" | "desconocido";
  vehiculo_alias: string | null;
  confianza: number;
  falta: string[];
  datos: Partial<DatosCarga & DatosMant>;
};

function prompt(vehiculos: Vehiculo[]) {
  const lista = vehiculos
    .map(v => {
      const desc = [v.marca, v.modelo, v.anio].filter(Boolean).join(" ");
      const km = v.kmActual != null ? `último odómetro ${fmtKm(v.kmActual)} km${v.kmActualFecha ? ` del ${fmtFecha(v.kmActualFecha)}` : ""}` : "sin odómetro registrado";
      return `- alias "${v.alias}"${desc ? ` (${desc})` : ""}${v.porDefecto ? " [por defecto]" : ""}: ${km}`;
    })
    .join("\n");

  return `Sos un parser de registros de vehículos. Recibís un mensaje en español
rioplatense, informal, posiblemente transcrito de un audio y con errores.

Contexto:
- Fecha de hoy: ${hoyYmd()}
- Vehículos del usuario:
${lista || "- (ninguno)"}

Devolvé SOLO un JSON válido, sin markdown, sin explicación, con esta forma:

{
  "tipo": "carga_combustible" | "mantenimiento" | "consulta" | "desconocido",
  "vehiculo_alias": string | null,
  "confianza": number,
  "falta": [string],
  "datos": { ... }
}

Para "carga_combustible", datos:
  { "litros": number|null, "monto_total": number|null,
    "precio_litro": number|null, "odometro": number|null,
    "tanque_lleno": boolean|null, "estacion": string|null, "fecha": "YYYY-MM-DD" }
  Campos críticos (van en "falta" si no están): "litros", "odometro".

Para "mantenimiento", datos:
  { "subtipo": "service"|"aceite"|"neumaticos"|"vtv"|"seguro"|"patente"|"reparacion"|"otro",
    "monto": number|null, "odometro": number|null, "taller": string|null,
    "descripcion": string, "vence_fecha": "YYYY-MM-DD"|null, "fecha": "YYYY-MM-DD" }
  Para aceite, service y neumáticos el campo crítico es "odometro".

"consulta" = pregunta sobre el estado del auto, gastos, rendimiento o vencimientos. datos: {}.
"desconocido" = cualquier cosa que no tenga que ver con vehículos. datos: {}.

Reglas de interpretación:
- "lucas", "mil", "k" = miles de pesos. "45 lucas" = 45000.
- "palo" = millón.
- Los números transcritos pueden venir con puntos o comas inconsistentes.
- Si el odómetro informado es MENOR al último registrado de ese vehículo, marcá
  confianza baja y agregá "odometro" en "falta": probablemente se escuchó mal.
- Si el odómetro parece abreviado ("87 mil", "87.4"), interpretalo en kilómetros
  usando el último odómetro registrado como referencia.
- Si dice "lleno", "llené", "hasta arriba" → tanque_lleno true. Si da un monto fijo
  o dice "un poco", "media carga" → false. Si no dice nada → true.
- Si no menciona vehículo, "vehiculo_alias" va null.
- "ayer", "el lunes", etc: calculá la fecha a partir de hoy. Si no menciona fecha, asumí hoy.
- Si el mensaje incluye una respuesta a una pregunta previa, combiná ambos.
- Nunca inventes un valor. Si no está, va null.`;
}

export async function parsearMensaje(texto: string, vehiculos: Vehiculo[]): Promise<Parseo> {
  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 600,
    system: prompt(vehiculos),
    messages: [{ role: "user", content: texto }],
  });
  const raw = res.content.filter(b => b.type === "text").map(b => (b as { text: string }).text).join("");
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  try {
    const p = JSON.parse(json) as Parseo;
    return {
      tipo: p.tipo ?? "desconocido",
      vehiculo_alias: p.vehiculo_alias ?? null,
      confianza: typeof p.confianza === "number" ? p.confianza : 0,
      falta: Array.isArray(p.falta) ? p.falta : [],
      datos: p.datos ?? {},
    };
  } catch {
    return { tipo: "desconocido", vehiculo_alias: null, confianza: 0, falta: [], datos: {} };
  }
}
