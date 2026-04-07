// Webhook de Telegram: recibe los mensajes que vos le mandás al bot
// y los procesa como comandos. Se registra una sola vez con setWebhook.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegram, escapeHtml } from "@/lib/telegram";
import { pilarFromKey, pilarKey } from "@/lib/pilares";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function handleCommand(text: string, chatId: string) {
  const [rawCmd, ...rest] = text.trim().split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@\w+$/, ""); // limpia /hoy@bot
  const args = rest.join(" ");

  if (cmd === "/start" || cmd === "/ayuda" || cmd === "/help") {
    await sendTelegram(
      [
        "<b>Tablero de Vida — Bot</b> 🧭",
        "",
        "Comandos disponibles:",
        "• /hoy — tareas y bloques de hoy",
        "• /nueva &lt;texto&gt; — crear tarea rápida",
        "• /hecho &lt;hábito&gt; — marcar hábito del día",
        "• /habitos — lista de hábitos + rachas",
        "• /vencimientos — próximos vencimientos",
        "• /briefing — resumen matinal",
        "• /ayuda — este mensaje",
        "",
        `Tu chat ID: <code>${chatId}</code>`,
      ].join("\n"),
      chatId
    );
    return;
  }

  if (cmd === "/hoy") {
    const t = new Date();
    const inicio = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const fin = new Date(inicio); fin.setDate(fin.getDate() + 1);

    const tareas = await prisma.tarea.findMany({
      where: {
        estado: { not: "Completada" },
        OR: [
          { fechaInicio: { gte: inicio, lt: fin } },
          { fechaVencimiento: { gte: inicio, lt: fin } },
        ],
      },
      orderBy: [{ horario: "asc" }, { orden: "asc" }],
      take: 20,
    });

    const dia = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][t.getDay()];
    const bloques = await prisma.cronogramaBase.findMany({
      where: { dia },
      orderBy: { horarioInicio: "asc" },
    });

    const lines: string[] = [`<b>📅 Hoy ${fmtDate(t)} — ${dia}</b>`, ""];
    if (bloques.length) {
      lines.push("<b>Cronograma:</b>");
      for (const b of bloques) {
        const p = pilarFromKey(pilarKey(b.pilar));
        lines.push(`${b.horarioInicio}-${b.horarioFin} ${p.emoji} ${escapeHtml(b.actividad)}`);
      }
      lines.push("");
    }
    if (tareas.length) {
      lines.push("<b>Tareas:</b>");
      for (const t of tareas) {
        const p = pilarFromKey(pilarKey(t.epica));
        const h = t.horario ? `${t.horario} ` : "";
        lines.push(`${p.emoji} ${h}${escapeHtml(t.nombre)}`);
      }
    } else {
      lines.push("✨ No hay tareas con fecha de hoy.");
    }
    await sendTelegram(lines.join("\n"), chatId);
    return;
  }

  if (cmd === "/nueva") {
    if (!args) {
      await sendTelegram("Uso: <code>/nueva &lt;nombre de la tarea&gt;</code>", chatId);
      return;
    }
    const tarea = await prisma.tarea.create({
      data: {
        nombre: args,
        estado: "Hoy",
        epica: "Meta-sistema",
      },
    });
    await sendTelegram(`✅ Tarea creada: <b>${escapeHtml(tarea.nombre)}</b>`, chatId);
    return;
  }

  if (cmd === "/hecho") {
    if (!args) {
      await sendTelegram("Uso: <code>/hecho &lt;nombre del hábito&gt;</code>", chatId);
      return;
    }
    const habito = await prisma.tarea.findFirst({
      where: {
        mostrarEnHabitos: true,
        nombre: { contains: args },
      },
    });
    if (!habito) {
      await sendTelegram(`❌ No encontré hábito que contenga "${escapeHtml(args)}"`, chatId);
      return;
    }
    const fecha = today();
    await prisma.habitoLog.upsert({
      where: { tareaId_fecha: { tareaId: habito.id, fecha } },
      update: {},
      create: { tareaId: habito.id, fecha },
    });
    await sendTelegram(`✅ Marcado: <b>${escapeHtml(habito.nombre)}</b> (${fecha})`, chatId);
    return;
  }

  if (cmd === "/habitos") {
    const habitos = await prisma.tarea.findMany({
      where: { mostrarEnHabitos: true, caracterVisibilidad: "Relevante" },
      include: { habitoLogs: true },
      take: 30,
    });
    const fecha = today();
    const lines: string[] = ["<b>🔁 Hábitos</b>", ""];
    for (const h of habitos) {
      const hecho = h.habitoLogs.some(l => l.fecha === fecha);
      const p = pilarFromKey(pilarKey(h.epica));
      lines.push(`${hecho ? "✅" : "⬜"} ${p.emoji} ${escapeHtml(h.nombre)} · 🔥${h.racha}`);
    }
    await sendTelegram(lines.join("\n"), chatId);
    return;
  }

  if (cmd === "/vencimientos") {
    const hoy = new Date();
    const en7 = new Date(); en7.setDate(en7.getDate() + 7);
    const tareas = await prisma.tarea.findMany({
      where: {
        estado: { not: "Completada" },
        fechaVencimiento: { gte: hoy, lte: en7 },
      },
      orderBy: { fechaVencimiento: "asc" },
      take: 20,
    });
    const lines: string[] = ["<b>⏰ Vencimientos próximos (7 días)</b>", ""];
    if (!tareas.length) lines.push("✨ Nada por vencer esta semana.");
    for (const t of tareas) {
      const p = pilarFromKey(pilarKey(t.epica));
      const f = t.fechaVencimiento ? fmtDate(t.fechaVencimiento) : "?";
      lines.push(`${p.emoji} <b>${f}</b> ${escapeHtml(t.nombre)}`);
    }
    await sendTelegram(lines.join("\n"), chatId);
    return;
  }

  if (cmd === "/briefing") {
    // Reusa /hoy pero con encabezado distinto
    await handleCommand("/hoy", chatId);
    return;
  }

  // Fallback
  await sendTelegram(
    `No reconozco ese comando. Mandá /ayuda para ver la lista.`,
    chatId
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const msg = body.message || body.edited_message;
    if (!msg || !msg.text) return NextResponse.json({ ok: true });

    const chatId = String(msg.chat.id);
    const text = msg.text as string;

    // Solo permitir el chat autorizado (seguridad: nadie más puede controlar tu bot)
    const allowed = process.env.TELEGRAM_CHAT_ID;
    if (allowed && chatId !== allowed) {
      await sendTelegram("🚫 Bot privado.", chatId);
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/")) {
      await handleCommand(text, chatId);
    } else {
      await sendTelegram("Mandá /ayuda para ver los comandos disponibles.", chatId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram webhook] error", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// GET para healthcheck
export async function GET() {
  return NextResponse.json({ ok: true, service: "telegram-webhook" });
}
