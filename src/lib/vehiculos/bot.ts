import { prisma } from "@/lib/prisma";
import { sendTelegram, sendTelegramWithButtons, editTelegramMessage, escapeHtml } from "@/lib/telegram";
import type { Vehiculo } from "@prisma/client";
import {
  TIPO_EMOJI, TIPO_LABEL, TIPOS_MANT,
  actualizarOdometro, describirVencimiento, fechaDesdeYmd, fmtFecha, fmtKm, fmtPesos,
  recalcularOdometro, resolverVehiculo, resumenVehiculo, vehiculosActivos,
} from "./core";
import { parsearMensaje, type Parseo } from "./parser";

const PENDIENTE_ID = "vehiculos";
const PENDIENTE_TTL_MS = 30 * 60 * 1000;
const MAX_INTENTOS = 2;

type Pendiente = { texto: string; pregunta: string };

const PREGUNTAS: Record<string, string> = {
  litros: "¿Cuántos litros cargaste?",
  odometro: "¿Qué kilometraje marcaba el auto?",
  monto_total: "¿Cuánto pagaste?",
};

const KM_OBLIGATORIO = new Set(["aceite", "service", "neumaticos"]);

function nombreVehiculo(v: Vehiculo) {
  return escapeHtml(v.alias);
}

async function leerPendiente() {
  const p = await prisma.botPendiente.findUnique({ where: { id: PENDIENTE_ID } });
  if (!p) return null;
  if (Date.now() - +p.updatedAt > PENDIENTE_TTL_MS) {
    await borrarPendiente();
    return null;
  }
  return { ...(JSON.parse(p.payload) as Pendiente), intentos: p.intentos };
}

async function guardarPendiente(p: Pendiente, intentos: number) {
  const payload = JSON.stringify(p);
  await prisma.botPendiente.upsert({
    where: { id: PENDIENTE_ID },
    update: { payload, intentos },
    create: { id: PENDIENTE_ID, payload, intentos },
  });
}

async function borrarPendiente() {
  await prisma.botPendiente.deleteMany({ where: { id: PENDIENTE_ID } });
}

function camposFaltantes(p: Parseo, vehiculo: Vehiculo | null): string[] {
  const falta = new Set(p.falta.filter(f => f in PREGUNTAS));
  const d = p.datos;
  if (p.tipo === "carga_combustible") {
    if (d.litros == null) falta.add("litros");
    if (d.odometro == null) falta.add("odometro");
  }
  if (p.tipo === "mantenimiento" && d.odometro == null && KM_OBLIGATORIO.has(d.subtipo ?? "")) {
    falta.add("odometro");
  }
  if (d.odometro != null && vehiculo?.kmActual != null && d.odometro < vehiculo.kmActual) {
    falta.add("odometro");
  }
  return Array.from(falta);
}

// Devuelve true si el mensaje se trató como algo del módulo de vehículos
export async function procesarMensajeVehiculo(texto: string, chatId: string, fuente: "texto" | "voz"): Promise<boolean> {
  const vehiculos = await vehiculosActivos();
  if (!vehiculos.length) return false;

  const pendiente = await leerPendiente();
  if (pendiente && /^(cancel|cancelar|dejalo|dejá|olvidate|nada)\b/i.test(texto.trim())) {
    await borrarPendiente();
    await sendTelegram("👌 Cancelado, no guardé nada.", chatId);
    return true;
  }

  const textoCompleto = pendiente
    ? `${pendiente.texto}\n(Respuesta a "${pendiente.pregunta}": ${texto})`
    : texto;
  const intentos = pendiente ? pendiente.intentos + 1 : 0;

  const p = await parsearMensaje(textoCompleto, vehiculos);

  if (p.tipo === "desconocido") {
    if (pendiente) await borrarPendiente();
    return false;
  }

  if (p.tipo === "consulta") {
    await borrarPendiente();
    await enviarEstado(chatId);
    return true;
  }

  const vehiculo = resolverVehiculo(vehiculos, p.vehiculo_alias);
  if (!vehiculo) {
    const pregunta = `¿Para qué vehículo? (${vehiculos.map(v => v.alias).join(", ")})`;
    if (intentos >= MAX_INTENTOS) {
      await borrarPendiente();
      await sendTelegram("No pude identificar el vehículo. Probá de nuevo nombrándolo por su alias.", chatId);
      return true;
    }
    await guardarPendiente({ texto: textoCompleto, pregunta }, intentos);
    await sendTelegram(`🚗 ${escapeHtml(pregunta)}`, chatId);
    return true;
  }

  const faltan = camposFaltantes(p, vehiculo);
  if (faltan.length && intentos < MAX_INTENTOS) {
    const campo = faltan[0];
    let pregunta = PREGUNTAS[campo];
    if (campo === "odometro" && p.datos.odometro != null && vehiculo.kmActual != null && p.datos.odometro < vehiculo.kmActual) {
      pregunta = `Entendí ${fmtKm(p.datos.odometro)} km, pero el último registro era ${fmtKm(vehiculo.kmActual)} km. ¿Qué kilometraje marcaba?`;
    }
    await guardarPendiente({ texto: textoCompleto, pregunta }, intentos);
    await sendTelegram(`❓ ${escapeHtml(pregunta)}\n<i>(o "cancelar")</i>`, chatId);
    return true;
  }

  await borrarPendiente();
  if (p.tipo === "carga_combustible") {
    await guardarCarga(p, vehiculo, textoCompleto, fuente, chatId);
  } else {
    await guardarMantenimiento(p, vehiculo, textoCompleto, fuente, chatId);
  }
  return true;
}

function odometroValido(odo: number | null | undefined, v: Vehiculo): number | null {
  if (odo == null || !Number.isFinite(odo) || odo <= 0) return null;
  if (v.kmActual != null && odo < v.kmActual) return null;
  return Math.round(odo);
}

async function guardarCarga(p: Parseo, v: Vehiculo, raw: string, fuente: string, chatId: string) {
  const d = p.datos;
  if (d.litros == null || d.litros <= 0) {
    await sendTelegram("No entendí cuántos litros cargaste, así que no guardé nada. Probá de nuevo.", chatId);
    return;
  }
  const odometro = odometroValido(d.odometro, v);
  const monto = d.monto_total ?? (d.precio_litro ? d.precio_litro * d.litros : null);
  const precio = d.precio_litro ?? (monto ? monto / d.litros : null);
  const fecha = fechaDesdeYmd(d.fecha);

  const carga = await prisma.cargaCombustible.create({
    data: {
      vehiculoId: v.id,
      fecha,
      litros: d.litros,
      montoTotal: monto,
      precioLitro: precio,
      odometro,
      tanqueLleno: d.tanque_lleno ?? true,
      estacion: d.estacion ?? null,
      fuente,
      rawInput: raw,
    },
  });
  await actualizarOdometro(v.id, odometro, fecha);

  const r = await resumenVehiculo(v.id);
  const partes = [`${d.litros.toLocaleString("es-AR")} L`];
  if (monto) partes.push(fmtPesos(monto));
  if (odometro) partes.push(`${fmtKm(odometro)} km`);

  const lines = [`✅ <b>Registrado</b> (${nombreVehiculo(v)}): ${partes.join(", ")}`];
  if (d.odometro != null && odometro == null) {
    lines.push("⚠️ No guardé el km porque era menor al último registrado.");
  }
  const punto = r?.rendimientos.find(x => x.cargaId === carga.id);
  if (punto) {
    lines.push(`⛽ Rendimiento desde la última carga: <b>${punto.kmL.toFixed(1).replace(".", ",")} km/L</b>`);
    if (r?.rendimientoProm) lines.push(`📊 Promedio histórico: ${r.rendimientoProm.toFixed(1).replace(".", ",")} km/L`);
  } else if (!carga.tanqueLleno) {
    lines.push("⛽ Carga parcial: el rendimiento se calcula en la próxima de tanque lleno.");
  } else if (!odometro) {
    lines.push("⛽ Sin km no puedo calcular rendimiento en esta carga.");
  }
  const prox = r?.vencimientos.find(x => x.estado !== "sin_datos");
  if (prox) lines.push(`${prox.emoji} Próximo vencimiento — ${prox.label}: ${describirVencimiento(prox)}`);

  await sendTelegram(lines.join("\n"), chatId);
}

async function guardarMantenimiento(p: Parseo, v: Vehiculo, raw: string, fuente: string, chatId: string) {
  const d = p.datos;
  const tipo = (TIPOS_MANT as readonly string[]).includes(d.subtipo ?? "") ? d.subtipo! : "otro";
  const odometro = odometroValido(d.odometro, v);
  const fecha = fechaDesdeYmd(d.fecha);

  await prisma.mantenimiento.create({
    data: {
      vehiculoId: v.id,
      tipo,
      fecha,
      odometro,
      monto: d.monto ?? null,
      taller: d.taller ?? null,
      descripcion: d.descripcion ?? null,
      venceFecha: d.vence_fecha ? fechaDesdeYmd(d.vence_fecha) : null,
      fuente,
      rawInput: raw,
    },
  });
  await actualizarOdometro(v.id, odometro, fecha);

  const partes = [`${TIPO_EMOJI[tipo]} ${TIPO_LABEL[tipo]}`];
  if (odometro) partes.push(`${fmtKm(odometro)} km`);
  if (d.monto) partes.push(fmtPesos(d.monto));
  if (d.taller) partes.push(escapeHtml(d.taller));
  const lines = [`✅ <b>Registrado</b> (${nombreVehiculo(v)}): ${partes.join(", ")}`];

  const r = await resumenVehiculo(v.id);
  const venc = r?.vencimientos.find(x => x.tipo === tipo);
  if (venc && venc.estado !== "sin_datos") {
    const cuando: string[] = [];
    if (venc.proxKm != null) cuando.push(`a los ${fmtKm(venc.proxKm)} km`);
    if (venc.proxFecha) cuando.push(`el ${fmtFecha(venc.proxFecha)}`);
    lines.push(`📅 Próximo: ${cuando.join(" o ")}, lo que llegue primero.`);
  }
  await sendTelegram(lines.join("\n"), chatId);
}

// ─── Comandos ──────────────────────────────────────────────────────

export async function enviarEstado(chatId: string) {
  const vehiculos = await vehiculosActivos();
  if (!vehiculos.length) {
    await sendTelegram("No tenés vehículos cargados. Agregalos desde la web, en la sección Vehículos.", chatId);
    return;
  }
  const lines: string[] = ["<b>🚗 Estado de tus vehículos</b>"];
  for (const v of vehiculos) {
    const r = await resumenVehiculo(v.id);
    if (!r) continue;
    lines.push("", `<b>${nombreVehiculo(v)}</b>${[v.marca, v.modelo].filter(Boolean).length ? ` — ${escapeHtml([v.marca, v.modelo].filter(Boolean).join(" "))}` : ""}`);
    if (r.kmHoy != null) {
      const est = v.kmActual != null && r.kmHoy !== v.kmActual ? " (estimado)" : "";
      lines.push(`📍 ${fmtKm(r.kmHoy)} km${est}`);
    }
    if (r.rendimientoProm) lines.push(`⛽ Rendimiento promedio: ${r.rendimientoProm.toFixed(1).replace(".", ",")} km/L`);
    const conDatos = r.vencimientos.filter(x => x.estado !== "sin_datos").slice(0, 3);
    for (const x of conDatos) {
      const icono = x.estado === "vencido" ? "🔴" : x.estado === "proximo" ? "🟡" : "🟢";
      lines.push(`${icono} ${x.emoji} ${x.label}: ${describirVencimiento(x)}`);
    }
    const sinDatos = r.vencimientos.filter(x => x.estado === "sin_datos");
    if (sinDatos.length) lines.push(`<i>Sin registro aún: ${sinDatos.map(x => x.label).join(", ")}</i>`);
  }
  await sendTelegram(lines.join("\n"), chatId);
}

export async function enviarVehiculos(chatId: string) {
  const vehiculos = await vehiculosActivos();
  if (!vehiculos.length) {
    await sendTelegram("No tenés vehículos cargados. Agregalos desde la web, en la sección Vehículos.", chatId);
    return;
  }
  const lines = ["<b>🚗 Tus vehículos</b>", "Tappeá uno para usarlo por defecto:"];
  const buttons = vehiculos.map(v => [{
    text: `${v.porDefecto ? "⭐" : "▫️"} ${v.alias}${v.kmActual != null ? ` · ${fmtKm(v.kmActual)} km` : ""}`.slice(0, 60),
    callback_data: `vd:${v.id}`,
  }]);
  await sendTelegramWithButtons(lines.join("\n"), buttons, chatId);
}

export async function enviarUltimo(chatId: string) {
  const [c, m] = await Promise.all([
    prisma.cargaCombustible.findFirst({ orderBy: { createdAt: "desc" }, include: { vehiculo: true } }),
    prisma.mantenimiento.findFirst({ orderBy: { createdAt: "desc" }, include: { vehiculo: true } }),
  ]);
  const ultimo = [c ? { kind: "c" as const, r: c } : null, m ? { kind: "m" as const, r: m } : null]
    .filter(Boolean)
    .sort((a, b) => +b!.r.createdAt - +a!.r.createdAt)[0];
  if (!ultimo) {
    await sendTelegram("Todavía no hay registros.", chatId);
    return;
  }
  const lines = ["<b>🕘 Último registro</b>", ""];
  if (ultimo.kind === "c") {
    const x = ultimo.r as NonNullable<typeof c>;
    lines.push(
      `⛽ Carga — ${escapeHtml(x.vehiculo.alias)} — ${fmtFecha(x.fecha)}`,
      `${x.litros.toLocaleString("es-AR")} L${x.montoTotal ? `, ${fmtPesos(x.montoTotal)}` : ""}${x.odometro ? `, ${fmtKm(x.odometro)} km` : ""}${x.tanqueLleno ? "" : " (parcial)"}`,
    );
  } else {
    const x = ultimo.r as NonNullable<typeof m>;
    lines.push(
      `${TIPO_EMOJI[x.tipo] ?? "📌"} ${TIPO_LABEL[x.tipo] ?? x.tipo} — ${escapeHtml(x.vehiculo.alias)} — ${fmtFecha(x.fecha)}`,
      [x.odometro ? `${fmtKm(x.odometro)} km` : null, x.monto ? fmtPesos(x.monto) : null, x.descripcion ? escapeHtml(x.descripcion) : null].filter(Boolean).join(", "),
    );
  }
  if (ultimo.r.rawInput) lines.push("", `<i>"${escapeHtml(ultimo.r.rawInput.slice(0, 200))}"</i>`);
  lines.push("", "Si está mal, borralo y mandalo de nuevo.");
  await sendTelegramWithButtons(lines.join("\n"), [[{ text: "🗑 Borrar", callback_data: `vb:${ultimo.kind}:${ultimo.r.id}` }]], chatId);
}

// ─── Botones ───────────────────────────────────────────────────────

// Devuelve el texto para answerCallback, o null si el callback no es de este módulo
export async function manejarCallbackVehiculo(data: string, chatId: string, messageId: number): Promise<string | null> {
  if (data.startsWith("vd:")) {
    const id = data.slice(3);
    await prisma.$transaction([
      prisma.vehiculo.updateMany({ data: { porDefecto: false } }),
      prisma.vehiculo.update({ where: { id }, data: { porDefecto: true } }),
    ]);
    const v = await prisma.vehiculo.findUnique({ where: { id } });
    await editTelegramMessage(chatId, messageId, `⭐ Vehículo por defecto: <b>${escapeHtml(v?.alias ?? "?")}</b>`);
    return "Listo";
  }

  if (data.startsWith("vb:")) {
    const [, kind, id] = data.split(":");
    const borrado = kind === "c"
      ? await prisma.cargaCombustible.delete({ where: { id } }).catch(() => null)
      : await prisma.mantenimiento.delete({ where: { id } }).catch(() => null);
    if (borrado) await recalcularOdometro(borrado.vehiculoId);
    await editTelegramMessage(chatId, messageId, borrado ? "🗑 Registro borrado." : "Ese registro ya no existe.");
    return borrado ? "Borrado" : "No encontrado";
  }

  if (data.startsWith("vr:")) {
    const [, accion, id] = data.split(":");
    const rec = await prisma.recordatorioVehiculo.findUnique({ where: { id }, include: { vehiculo: true } });
    if (!rec) return "Recordatorio no encontrado";
    const label = `${TIPO_EMOJI[rec.tipo] ?? ""} ${TIPO_LABEL[rec.tipo] ?? rec.tipo}`;

    if (accion === "hecho") {
      const r = await resumenVehiculo(rec.vehiculoId);
      const km = r?.kmHoy ?? null;
      await prisma.mantenimiento.create({
        data: {
          vehiculoId: rec.vehiculoId,
          tipo: rec.tipo,
          fecha: fechaDesdeYmd(),
          odometro: km,
          descripcion: km != null ? "Registrado desde recordatorio (km estimado)" : "Registrado desde recordatorio",
          fuente: "texto",
        },
      });
      await prisma.recordatorioVehiculo.update({ where: { id }, data: { estado: "reconocido" } });
      await editTelegramMessage(
        chatId, messageId,
        `✅ ${label} registrado hoy para <b>${escapeHtml(rec.vehiculo.alias)}</b>${km != null ? ` a ~${fmtKm(km)} km` : ""}.\n<i>Si el km no es exacto, borralo con /ultimo y mandame el dato real.</i>`,
      );
      return "Registrado";
    }
    if (accion === "pos") {
      await prisma.recordatorioVehiculo.update({ where: { id }, data: { estado: "pospuesto" } });
      await editTelegramMessage(chatId, messageId, `⏰ ${label} de <b>${escapeHtml(rec.vehiculo.alias)}</b>: te lo recuerdo en una semana.`);
      return "Pospuesto";
    }
  }

  return null;
}
