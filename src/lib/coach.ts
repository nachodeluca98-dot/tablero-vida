// Coach personal con Claude. Recibe el estado actual del usuario y devuelve una recomendación.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { pilarKey, PILARES } from "./pilares";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function buildContext() {
  const now = new Date();
  const hoy = ymd(now);
  const inicioHoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const finHoy = new Date(+inicioHoy + 86400000);
  const en7 = new Date(+now + 7 * 86400000);
  const DIAS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const diaSem = DIAS[now.getDay()];

  const [habitos, tareasHoy, vencen, bloques] = await Promise.all([
    prisma.tarea.findMany({
      where: { mostrarEnHabitos: true, caracterVisibilidad: "Relevante" },
      include: { habitoLogs: { where: { fecha: hoy } } },
    }),
    prisma.tarea.findMany({
      where: {
        estado: { not: "Completada" },
        OR: [
          { fechaInicio: { gte: inicioHoy, lt: finHoy } },
          { fechaVencimiento: { gte: inicioHoy, lt: finHoy } },
        ],
      },
    }),
    prisma.tarea.findMany({
      where: { estado: { not: "Completada" }, fechaVencimiento: { gte: now, lte: en7 } },
      orderBy: { fechaVencimiento: "asc" },
      take: 8,
    }),
    prisma.cronogramaBase.findMany({ where: { dia: diaSem }, orderBy: { horarioInicio: "asc" } }),
  ]);

  const horaActual = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const fechaStr = now.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  const habitosHechos = habitos.filter(h => h.habitoLogs.length > 0);
  const habitosFaltan = habitos.filter(h => h.habitoLogs.length === 0);

  return `
ESTADO ACTUAL DE NACHO — ${fechaStr} ${horaActual}

CRONOGRAMA DE HOY (${diaSem}):
${bloques.map(b => `- ${b.horarioInicio}–${b.horarioFin}: ${b.actividad} [${b.pilar}]`).join("\n") || "- (sin bloques)"}

TAREAS DE HOY (${tareasHoy.length}):
${tareasHoy.slice(0, 15).map(t => `- ${t.nombre}${t.horario ? ` @${t.horario}` : ""} [${t.epica || "?"}]`).join("\n") || "- (sin tareas)"}

HÁBITOS (${habitosHechos.length}/${habitos.length} marcados hoy):
✅ Hechos: ${habitosHechos.map(h => h.nombre).join(", ") || "ninguno"}
⬜ Faltan: ${habitosFaltan.slice(0, 10).map(h => `${h.nombre}(🔥${h.racha})`).join(", ") || "ninguno"}

VENCIMIENTOS PRÓXIMOS (7 días):
${vencen.map(v => `- ${v.fechaVencimiento?.toLocaleDateString("es-AR")}: ${v.nombre}`).join("\n") || "- (nada)"}

PILARES DE VIDA: ${PILARES.map(p => `${p.emoji} ${p.nombre}`).join(", ")}
  `.trim();
}

const SYSTEM = `Sos un coach personal de productividad y bienestar para Nacho.
Tu rol es darle UNA recomendación concreta y accionable AHORA, en base a su estado actual.

Reglas:
- Sé directo, breve (máx 4-5 oraciones), en español rioplatense informal pero respetuoso.
- Mirá la HORA ACTUAL y elegí algo apropiado al momento del día.
- Si hay un bloque de cronograma activo, respetalo.
- Si hay rachas de hábitos en riesgo (no marcado hoy y racha alta), priorizá salvarlas.
- Si hay sobrecarga, sugerí qué postergar.
- No listes todo, elegí UNA cosa importante y explicá por qué.
- Terminá con una acción específica que pueda hacer en los próximos 30 min.`;

export async function askCoach() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "ANTHROPIC_API_KEY no configurada" };
  }
  const ctx = await buildContext();

  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    system: SYSTEM,
    messages: [{ role: "user", content: `${ctx}\n\n¿Qué me recomendás hacer ahora?` }],
  });

  const text = res.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  return { respuesta: text };
}
