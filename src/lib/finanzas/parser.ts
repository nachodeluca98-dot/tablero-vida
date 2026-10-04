// Parser de dictados de gastos con IA (spec §11). Devuelve registros crudos; la resolución
// (tarjeta, meta, mes de imputación, duplicados) la hace carga.ts.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODELO = "claude-opus-5-5";

const SISTEMA = `Sos un parser de gastos personales para un usuario argentino que habla en español
rioplatense informal. Recibís una transcripción de voz (o texto escrito) y devolvés los registros
que se mencionan.

Interpretación de montos:
- "lucas" o "mil" = miles ("180 lucas" = 180000). "palo" = millón.
- Los números transcriptos pueden venir con puntos o comas inconsistentes ("180.000", "180,000", "180 000").
- "verdes", "dólares", "usd", "u$s" → moneda USD. Si no se aclara, ARS.
- "unos", "más o menos", "aprox", "tipo" → es_aproximado = true.

Otras señales:
- "en N cuotas" → cuotas_total = N. El monto es el total de la compra salvo que diga "cuotas de X".
  Si dice "N cuotas de X", monto = N × X.
- "con la visa/master/<nombre de tarjeta>" → medio_pago = tarjeta_credito, tarjeta = nombre.
- "débito", "transferí", "efectivo", "mercado pago" → medio correspondiente
  (efectivo, debito, transferencia, billetera). Mercado Pago, Ualá y similares = billetera.
- "a medias", "compartido", "lo pagamos entre", "la mitad era de" → compartido = true y
  nota_compartido con la aclaración textual.
- Si un gasto agrupa varias cosas ("súper: coto y verdulería"), un solo registro con
  incluye = "Coto + verdulería".
- "cobré", "me pagaron", "entró" → tipo ingreso. "ahorré", "separé", "puse en el fondo" →
  tipo ahorro (y meta si se menciona).
- Asigná la categoría más probable de la lista dada (por id). Si no hay una razonable, null.
- Si coincide con un ítem de presupuesto del mes, devolvé su presupuesto_item_id.
- Fechas relativas ("ayer", "el finde") → resolvé contra la fecha actual. Si no se dice, null.
- descripcion: corta, con mayúscula inicial, como la diría el usuario ("Súper", "Nafta", "Delivery").

Modo corrección: si recibís "lista_actual" y un dictado de corrección ("el segundo eran 50",
"sacá el tercero", "el súper va en mascotas"), devolvé la lista completa actualizada, en el mismo
orden y conservando los campos que no se corrigieron. Si el dictado agrega gastos nuevos, sumalos al final.

Ante ambigüedad, elegí la interpretación más probable y dejá en null lo que no sepas:
el usuario corrige en pantalla. Si el texto no menciona ningún gasto, ingreso ni ahorro, devolvé
registros vacío.`;

const NULLABLE_STRING = { type: ["string", "null"] };

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["registros"],
  properties: {
    registros: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "tipo", "descripcion", "incluye", "monto", "moneda", "es_aproximado", "categoria_id",
          "presupuesto_item_id", "medio_pago", "tarjeta", "cuotas_total", "compartido",
          "nota_compartido", "meta", "fecha",
        ],
        properties: {
          tipo: { type: "string", enum: ["gasto", "ingreso", "ahorro"] },
          descripcion: NULLABLE_STRING,
          incluye: NULLABLE_STRING,
          monto: { type: ["number", "null"] },
          moneda: { type: "string", enum: ["ARS", "USD"] },
          es_aproximado: { type: "boolean" },
          categoria_id: NULLABLE_STRING,
          presupuesto_item_id: NULLABLE_STRING,
          medio_pago: NULLABLE_STRING,
          tarjeta: NULLABLE_STRING,
          cuotas_total: { type: ["integer", "null"] },
          compartido: { type: "boolean" },
          nota_compartido: NULLABLE_STRING,
          meta: NULLABLE_STRING,
          fecha: { type: ["string", "null"], description: "YYYY-MM-DD" },
        },
      },
    },
  },
} as const;

export type RegistroParseado = {
  tipo: "gasto" | "ingreso" | "ahorro";
  descripcion: string | null;
  incluye: string | null;
  monto: number | null;
  moneda: "ARS" | "USD";
  es_aproximado: boolean;
  categoria_id: string | null;
  presupuesto_item_id: string | null;
  medio_pago: string | null;
  tarjeta: string | null;
  cuotas_total: number | null;
  compartido: boolean;
  nota_compartido: string | null;
  meta: string | null;
  fecha: string | null;
};

export type ContextoParser = {
  fechaActual: string;
  tipoCambio: number | null;
  categorias: { id: string; nombre: string; tipo: string }[];
  itemsPresupuesto: { id: string; concepto: string; categoria_id: string }[];
  tarjetas: string[];
  metas: string[];
};

export class ErrorParser extends Error {}

export function parserDisponible() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function parsearDictado(
  texto: string,
  contexto: ContextoParser,
  listaActual?: RegistroParseado[]
): Promise<RegistroParseado[]> {
  const entrada = {
    contexto,
    ...(listaActual?.length ? { lista_actual: listaActual } : {}),
    dictado: texto,
  };

  // Fallbacks del lado del servidor: si el modelo declina, la API reintenta con otro modelo en la misma llamada.
  // El SDK instalado todavía no tipa `fallbacks`, por eso se arma el objeto aparte.
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming & { fallbacks: "default" } = {
    model: MODELO,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA as unknown as Record<string, unknown> } },
    system: SISTEMA,
    messages: [{ role: "user", content: JSON.stringify(entrada) }],
  };

  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create(params);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new ErrorParser("Hay mucha demanda en este momento. Probá de nuevo en un ratito.");
    if (e instanceof Anthropic.APIError) throw new ErrorParser(`No pude interpretar el dictado (error ${e.status ?? "de conexión"}).`);
    throw e;
  }
  if (res.stop_reason === "refusal") throw new ErrorParser("No pude interpretar el dictado.");
  if (res.stop_reason === "max_tokens") throw new ErrorParser("El dictado es muy largo. Probá cargarlo en partes.");

  const raw = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const out = JSON.parse(raw) as { registros: RegistroParseado[] };
    return Array.isArray(out.registros) ? out.registros : [];
  } catch {
    throw new ErrorParser("No pude interpretar el dictado.");
  }
}
