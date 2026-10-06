"use client";
import { useEffect, useMemo, useState } from "react";
import {
  CATEGORIA, COLOR_ESTADO, GraficoRendimiento, PIDE_KM, TIPO_EMOJI, TIPO_LABEL, fecha, km, kmL, pesos, textoVenc,
} from "./comun";
import { Campo, Stat, Tip, type ToastData, api } from "@/components/ui";

const DIA = 86400000;

// ─── Pendientes ────────────────────────────────────────────────────

const NIVELES = [
  { key: "urgente", label: "Urgente", color: "red" },
  { key: "importante", label: "Importante", color: "amb" },
  { key: "relevante", label: "Relevante", color: "ges" },
] as const;

function ItemPendiente({ p, mostrarAlias, onListo, onToast }: {
  p: any; mostrarAlias: boolean; onListo: () => void; onToast: (t: ToastData) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [kmVal, setKmVal] = useState<string>(p.kmHoy != null ? String(p.kmHoy) : "");
  const [monto, setMonto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function hecho(extra: any = {}) {
    setEnviando(true);
    try {
      const r = await api(`/api/vehiculos/${p.vehiculoId}/hecho`, "POST", { tipo: p.tipo, ...extra });
      setAbierto(false);
      onListo();
      onToast({
        titulo: p.tipo === "seguro" ? "✓ Seguro del mes verificado" : `✓ Hecho: ${TIPO_LABEL[p.tipo] ?? p.tipo}`,
        lineas: r.feedback,
        deshacer: r.id ? async () => {
          await api(`/api/vehiculos/${p.vehiculoId}/registros?kind=mantenimiento&rid=${r.id}`, "DELETE");
          onListo();
        } : undefined,
      });
    } catch (e: any) {
      onToast({ titulo: "No se pudo guardar", lineas: [e.message], error: true });
    } finally { setEnviando(false); }
  }

  async function cambioSeguro() {
    const nuevo = prompt("¿Cuál es la cuota mensual actual del seguro? (solo el número)");
    const n = Number(String(nuevo ?? "").replace(/[^\d]/g, ""));
    if (!n) return;
    await api(`/api/vehiculos/${p.vehiculoId}`, "PATCH", { seguroMensual: n });
    onListo();
    onToast({ titulo: `✓ Seguro actualizado: ${pesos(n)}/mes` });
  }

  const btn = { fontSize: 12, padding: "5px 10px" };
  return (
    <div style={{ padding: "7px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{p.emoji} {p.titulo}</div>
          <div style={{ fontSize: 11, color: "var(--tx3)" }}>{mostrarAlias ? `${p.alias} · ` : ""}{p.detalle}</div>
        </div>
        {!abierto && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {p.tipo === "seguro" ? (
              <>
                <button style={btn} disabled={enviando} onClick={() => hecho()}>✓ Bien</button>
                <button style={btn} onClick={cambioSeguro}>Cambió</button>
              </>
            ) : (
              <button style={btn} disabled={enviando} onClick={() => (PIDE_KM.has(p.tipo) ? setAbierto(true) : hecho())}>✓ Hecho</button>
            )}
          </div>
        )}
      </div>
      {abierto && (
        <div className="vh-2" style={{ marginTop: 8, alignItems: "end" }}>
          <Campo label="Km del auto"><input type="number" inputMode="numeric" value={kmVal} onChange={e => setKmVal(e.target.value)} /></Campo>
          <Campo label="Cuánto salió $"><input type="number" inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} /></Campo>
          <button className="primary" style={btn} disabled={enviando} onClick={() => hecho({ odometro: kmVal, monto })}>Guardar</button>
          <button style={btn} onClick={() => setAbierto(false)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

export function Pendientes({ items, variosVehiculos, onListo, onToast }: {
  items: any[]; variosVehiculos: boolean; onListo: () => void; onToast: (t: ToastData) => void;
}) {
  const [verTodo, setVerTodo] = useState(false);
  if (!items.length) {
    return (
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", borderColor: "rgba(34,197,94,.35)", padding: 12 }}>
        <span style={{ fontSize: 20 }}>✨</span>
        <div><div style={{ fontWeight: 600, color: "var(--sal-t)" }}>Todo al día</div><div style={{ fontSize: 12, color: "var(--tx3)" }}>No hay nada vencido ni por vencer.</div></div>
      </div>
    );
  }
  const LIMITE = 4;
  const visibles = verTodo ? items : items.slice(0, LIMITE);
  const peor = NIVELES.find(n => items.some(i => i.nivel === n.key))!;
  return (
    <div className="card" style={{ padding: "10px 12px", borderColor: `var(--${peor.color})` }}>
      {NIVELES.map(n => {
        const lista = visibles.filter(i => i.nivel === n.key);
        const total = items.filter(i => i.nivel === n.key).length;
        if (!lista.length) return null;
        return (
          <div key={n.key} style={{ borderLeft: `3px solid var(--${n.color})`, paddingLeft: 10, margin: "6px 0 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 11, color: `var(--${n.color}-t)`, textTransform: "uppercase", letterSpacing: ".06em" }}>{n.label}</span>
              <span className="tag" style={{ background: `var(--${n.color}-b)`, color: `var(--${n.color}-t)` }}>{total}</span>
            </div>
            {lista.map(p => <ItemPendiente key={p.id} p={p} mostrarAlias={variosVehiculos} onListo={onListo} onToast={onToast} />)}
          </div>
        );
      })}
      {items.length > LIMITE && (
        <button onClick={() => setVerTodo(v => !v)} style={{ width: "100%", border: "none", background: "none", color: "var(--tx2)", fontSize: 12, padding: 4 }}>
          {verTodo ? "Ver menos" : `Ver ${items.length - LIMITE} más`}
        </button>
      )}
    </div>
  );
}

// ─── Resumen ───────────────────────────────────────────────────────

// Qué parte del intervalo ya se consumió (0..1+), por km o por fecha, lo que esté más avanzado
function consumido(v: any, kmHoy: number | null): number | null {
  if (!v.ultimo) return null;
  const r: number[] = [];
  if (v.proxKm != null && v.ultimo.odometro != null && kmHoy != null) {
    const tot = v.proxKm - v.ultimo.odometro;
    if (tot > 0) r.push((kmHoy - v.ultimo.odometro) / tot);
  }
  if (v.proxFecha) {
    const tot = +new Date(v.proxFecha) - +new Date(v.ultimo.fecha);
    if (tot > 0) r.push((Date.now() - +new Date(v.ultimo.fecha)) / tot);
  }
  return r.length ? Math.max(...r) : null;
}

export function Resumen({ det, gastoMes, costoKm, onCargarUltimo, onSeguro }: {
  det: any; gastoMes: number; costoKm: number | null; onCargarUltimo: (tipo: string) => void; onSeguro: () => void;
}) {
  const v = det.vehiculo;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="vh-grid2">
        <Stat label="Km" value={km(det.kmHoy)} sub={det.kmHoy !== v.kmActual && det.kmHoy != null ? "estimado hoy" : det.kmDia ? `~${km(det.kmDia)} km/día` : undefined} />
        <Stat label="Rendimiento" value={det.rendimientoProm ? `${kmL(det.rendimientoProm)} km/L` : "—"}
          sub={det.ultimoRendimiento ? `última: ${kmL(det.ultimoRendimiento.kmL)}` : "falta 2da carga llena"} />
        <Stat label="Gasto del mes" value={pesos(gastoMes)} />
        <Stat label="Costo por km" value={costoKm ? pesos(costoKm) : "—"} sub="todo incluido" />
      </div>

      <div className="card">
        <div className="card-title">Estado de mantenimiento</div>
        {det.vencimientos.map((y: any) => {
          const c = COLOR_ESTADO[y.estado];
          const pct = consumido(y, det.kmHoy);
          return (
            <div key={y.tipo} style={{ padding: "8px 0", borderTop: "1px solid var(--bd)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span>{y.emoji} {y.label}</span>
                {y.estado === "sin_datos" ? (
                  <button onClick={() => onCargarUltimo(y.tipo)} style={{ fontSize: 11, padding: "3px 10px" }}>Cargar último</button>
                ) : (
                  <span className="tag" style={{ background: `var(--${c}-b)`, color: `var(--${c}-t)`, textTransform: "none" }}>{textoVenc(y)}</span>
                )}
              </div>
              {pct != null && (
                <div className="vh-progress" style={{ marginTop: 6, height: 4 }}>
                  <div style={{ width: `${Math.min(100, Math.max(3, pct * 100))}%`, background: `var(--${c})` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 2 }}>🛡️ Seguro</div>
          {v.seguroMensual != null
            ? <div><b>{pesos(v.seguroMensual)}</b><span style={{ color: "var(--tx3)" }}> /mes{v.seguroCompania ? ` · ${v.seguroCompania}` : ""}</span></div>
            : <div style={{ color: "var(--tx3)", fontSize: 12 }}>Sin cargar</div>}
        </div>
        <button onClick={onSeguro} style={{ fontSize: 12 }}>{v.seguroMensual != null ? "Actualizar" : "Cargar"}</button>
      </div>

      <div className="card">
        <div className="card-title">Rendimiento (km/L)</div>
        <GraficoRendimiento puntos={det.rendimientos} />
      </div>
    </div>
  );
}

// ─── Historial ─────────────────────────────────────────────────────

const FILTROS = [
  { key: "todo", label: "Todo" },
  { key: "carga", label: "⛽ Nafta" },
  { key: "mant", label: "🔧 Mantenimiento" },
  { key: "rep", label: "🔩 Reparaciones" },
] as const;

export function Historial({ historial, onBorrar }: { historial: any[]; onBorrar: (h: any) => void }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["key"]>("todo");
  const [abierto, setAbierto] = useState<string | null>(null);

  const lista = historial.filter(h =>
    filtro === "todo" ? true
      : filtro === "carga" ? h.kind === "carga"
      : filtro === "rep" ? h.kind === "mantenimiento" && (h.tipo === "reparacion" || h.tipo === "otro")
      : h.kind === "mantenimiento" && h.tipo !== "reparacion" && h.tipo !== "otro");

  const grupos = useMemo(() => {
    const g: { mes: string; total: number; items: any[] }[] = [];
    for (const h of lista) {
      const mes = new Date(h.fecha).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
      let grupo = g.find(x => x.mes === mes);
      if (!grupo) { grupo = { mes, total: 0, items: [] }; g.push(grupo); }
      grupo.items.push(h);
      grupo.total += h.monto ?? 0;
    }
    return g;
  }, [lista]);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12 }}>
        {FILTROS.map(f => <button key={f.key} className={`vh-chip ${filtro === f.key ? "on" : ""}`} onClick={() => setFiltro(f.key)}>{f.label}</button>)}
      </div>
      {!lista.length && <div className="card" style={{ color: "var(--tx3)" }}>Nada para mostrar todavía.</div>}
      {grupos.map(g => (
        <div key={g.mes} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".06em", margin: "0 2px 6px" }}>
            <span>{g.mes}</span><span>{g.total ? pesos(g.total) : ""}</span>
          </div>
          <div className="card" style={{ padding: "4px 12px" }}>
            {g.items.map((h, i) => {
              const id = h.kind + h.id;
              const ab = abierto === id;
              return (
                <div key={id} style={{ borderTop: i ? "1px solid var(--bd)" : "none", padding: "10px 0" }}>
                  <div onClick={() => setAbierto(ab ? null : id)} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <div style={{ fontSize: 18, width: 24 }}>{h.kind === "carga" ? "⛽" : TIPO_EMOJI[h.tipo]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>
                          {h.kind === "carga" ? `${h.litros.toLocaleString("es-AR")} L${h.tanqueLleno ? "" : " · parcial"}` : (h.tipo === "reparacion" && h.descripcion ? h.descripcion : TIPO_LABEL[h.tipo])}
                        </span>
                        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{h.monto ? pesos(h.monto) : ""}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--tx3)" }}>
                        {fecha(h.fecha)}{h.odometro != null ? ` · ${km(h.odometro)} km` : ""}
                        {h.kind === "carga" && h.precioLitro ? ` · ${pesos(h.precioLitro)}/L` : ""}
                        {h.taller ? ` · ${h.taller}` : ""}
                        {h.fuente === "voz" ? " · 🎙" : h.fuente === "texto" ? " · 💬" : ""}
                      </div>
                    </div>
                  </div>
                  {ab && (
                    <div style={{ marginLeft: 34, marginTop: 8, fontSize: 12, color: "var(--tx2)", display: "flex", flexDirection: "column", gap: 4 }}>
                      {h.kind === "mantenimiento" && h.descripcion && h.tipo !== "reparacion" && <div>{h.descripcion}</div>}
                      {h.notas && <div>💭 {h.notas}</div>}
                      {h.venceFecha && <div>📅 Vence {fecha(h.venceFecha)}</div>}
                      {h.rawInput && <div style={{ color: "var(--tx3)", fontStyle: "italic" }}>&quot;{h.rawInput}&quot;</div>}
                      <div><button onClick={() => onBorrar(h)} style={{ fontSize: 11, padding: "3px 10px", color: "var(--red-t)", marginTop: 4 }}>Borrar</button></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Gastos ────────────────────────────────────────────────────────

export function Gastos({ historial }: { historial: any[] }) {
  const [periodo, setPeriodo] = useState<"30" | "365" | "todo">("365");
  const { porCat, total } = useMemo(() => {
    const desde = periodo === "todo" ? 0 : Date.now() - Number(periodo) * DIA;
    const pc: Record<string, number> = {};
    for (const h of historial) {
      if (!h.monto || +new Date(h.fecha) < desde) continue;
      const cat = h.kind === "carga" ? "Combustible" : CATEGORIA[h.tipo] ?? "Otros";
      pc[cat] = (pc[cat] ?? 0) + h.monto;
    }
    return { porCat: Object.entries(pc).sort((a, b) => b[1] - a[1]), total: Object.values(pc).reduce((s, n) => s + n, 0) };
  }, [historial, periodo]);

  const meses = useMemo(() => {
    const out: { label: string; total: number }[] = [];
    const ahora = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - i, 1));
      const sig = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      const t = historial.filter(h => h.monto && +new Date(h.fecha) >= +d && +new Date(h.fecha) < +sig).reduce((s, h) => s + h.monto, 0);
      out.push({ label: d.toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" }), total: t });
    }
    return out;
  }, [historial]);
  const maxMes = Math.max(1, ...meses.map(m => m.total));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card">
        <div className="card-title">Últimos 6 meses</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
          {meses.map(m => (
            <div key={m.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
              <div style={{ fontSize: 9, color: "var(--tx3)" }}>{m.total ? `${Math.round(m.total / 1000)}k` : ""}</div>
              <div style={{ width: "100%", height: `${(m.total / maxMes) * 85}%`, minHeight: m.total ? 3 : 0, background: "var(--acc)", borderRadius: "4px 4px 0 0" }} />
              <div style={{ fontSize: 10, color: "var(--tx3)" }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Total</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{pesos(total)}</div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {([["30", "30 d"], ["365", "12 m"], ["todo", "Todo"]] as const).map(([k, l]) => (
              <button key={k} className={`vh-chip ${periodo === k ? "on" : ""}`} onClick={() => setPeriodo(k)}>{l}</button>
            ))}
          </div>
        </div>
        {!porCat.length && <div style={{ color: "var(--tx3)", fontSize: 12 }}>Sin gastos en el período.</div>}
        {porCat.map(([cat, monto]) => (
          <div key={cat} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span>{cat}</span><span style={{ fontWeight: 600 }}>{pesos(monto)} <span style={{ color: "var(--tx3)", fontWeight: 400 }}>· {Math.round((monto / total) * 100)}%</span></span>
            </div>
            <div className="vh-progress"><div style={{ width: `${(monto / total) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ajustes ───────────────────────────────────────────────────────

function Reglas() {
  const [reglas, setReglas] = useState<any[]>([]);
  const [guardado, setGuardado] = useState<string | null>(null);
  useEffect(() => { api("/api/vehiculos/reglas").then((rs: any[]) => setReglas(rs.filter(r => r.tipo !== "seguro"))).catch(() => {}); }, []);
  const set = (id: string, k: string, v: any) => setReglas(rs => rs.map(r => (r.id === id ? { ...r, [k]: v } : r)));
  async function guardar(r: any) {
    await api("/api/vehiculos/reglas", "PATCH", r);
    setGuardado(r.id);
    setTimeout(() => setGuardado(null), 1500);
  }
  return (
    <div className="card">
      <div className="card-title">Cada cuánto toca cada cosa</div>
      <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 10 }}>Lo que llegue primero: km o meses. Dejá vacío lo que no aplica.</div>
      {reglas.map(r => (
        <details key={r.id} className="vh-details" style={{ borderTop: "1px solid var(--bd)", padding: "10px 0", opacity: r.activa ? 1 : 0.5 }}>
          <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{TIPO_EMOJI[r.tipo]} {TIPO_LABEL[r.tipo] ?? r.tipo}</span>
            <span style={{ fontSize: 12, color: "var(--tx3)", textAlign: "right" }}>
              {!r.activa ? "desactivado" : [r.cadaKm ? `${km(Number(r.cadaKm))} km` : null, r.cadaMeses ? `${r.cadaMeses} ${Number(r.cadaMeses) === 1 ? "mes" : "meses"}` : null].filter(Boolean).join(" o ") || "—"} ›
            </span>
          </summary>
          <div style={{ marginTop: 10 }}>
            <div className="vh-grid2">
              <Campo label="Cada km"><input type="number" inputMode="numeric" value={r.cadaKm ?? ""} onChange={e => set(r.id, "cadaKm", e.target.value)} /></Campo>
              <Campo label="Cada meses"><input type="number" inputMode="numeric" value={r.cadaMeses ?? ""} onChange={e => set(r.id, "cadaMeses", e.target.value)} /></Campo>
              <Campo label="Avisar km antes"><input type="number" inputMode="numeric" value={r.avisoKmAntes ?? ""} onChange={e => set(r.id, "avisoKmAntes", e.target.value)} /></Campo>
              <Campo label="Avisar días antes"><input type="number" inputMode="numeric" value={r.avisoDiasAntes ?? ""} onChange={e => set(r.id, "avisoDiasAntes", e.target.value)} /></Campo>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <input type="checkbox" checked={r.activa} onChange={e => set(r.id, "activa", e.target.checked)} /> Avisarme de esto
              </label>
              <button onClick={() => guardar(r)} style={{ fontSize: 11 }}>{guardado === r.id ? "✓ Guardado" : "Guardar"}</button>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

export function Ajustes({ v, onPatch, onEstado }: { v: any; onPatch: (data: any) => Promise<void>; onEstado: () => void }) {
  const [f, setF] = useState<any>({});
  const [ok, setOk] = useState("");
  useEffect(() => {
    setF({
      alias: v.alias ?? "", marca: v.marca ?? "", modelo: v.modelo ?? "", anio: v.anio ?? "", patente: v.patente ?? "",
      seguroMensual: v.seguroMensual ?? "", seguroCompania: v.seguroCompania ?? "",
    });
  }, [v]);
  const input = (k: string, label: string, type = "text") => (
    <Campo label={label}><input type={type} inputMode={type === "number" ? "numeric" : undefined} value={f[k] ?? ""} onChange={e => setF({ ...f, [k]: e.target.value })} /></Campo>
  );
  async function guardar(campos: string[], msg: string) {
    const data: any = {};
    for (const c of campos) data[c] = f[c];
    await onPatch(data);
    setOk(msg);
    setTimeout(() => setOk(""), 1800);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card">
        <div className="card-title">Datos del vehículo</div>
        <div className="vh-2">
          {input("alias", "Alias")}
          {input("patente", "Patente")}
          {input("marca", "Marca")}
          {input("modelo", "Modelo")}
          {input("anio", "Año", "number")}
        </div>
        <button className="primary" onClick={() => guardar(["alias", "marca", "modelo", "anio", "patente"], "datos")} style={{ marginTop: 12 }}>
          {ok === "datos" ? "✓ Guardado" : "Guardar"}
        </button>
      </div>

      <div className="card" id="vh-seguro">
        <div className="card-title">🛡️ Seguro</div>
        <div className="vh-2">
          {input("seguroMensual", "Cuota mensual $", "number")}
          {input("seguroCompania", "Compañía")}
        </div>
        <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 6 }}>Se suma solo a tus gastos cada mes. El bot te pregunta si cambió.</div>
        <button className="primary" onClick={() => guardar(["seguroMensual", "seguroCompania"], "seguro")} style={{ marginTop: 12 }}>
          {ok === "seguro" ? "✓ Guardado" : "Guardar"}
        </button>
      </div>

      <div className="card">
        <div className="card-title">Historial previo</div>
        <div style={{ fontSize: 12, color: "var(--tx2)", marginBottom: 10 }}>Cargá el último aceite, service, VTV o correa que te falte para que los avisos sean exactos.</div>
        <button onClick={onEstado}>Completar estado inicial</button>
      </div>

      <Reglas />

      <div className="card">
        <div className="card-title">📲 Bot de Telegram</div>
        <div style={{ fontSize: 12, color: "var(--tx2)", display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          <div>• Te avisa a la mañana si algo vence o está por vencer.</div>
          <div>• <b>/estado</b> te muestra km, rendimiento y vencimientos.</div>
          <div>• <b>/ultimo</b> te deja borrar la última carga si te equivocaste.</div>
          <div>• También podés mandarle texto: &quot;cargué 30 litros, 40 lucas, 88.000 km&quot;.</div>
        </div>
        <Tip>Usá la app para cargar y dejá que el bot te avise: así no te olvidás de nada.</Tip>
      </div>

      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!v.porDefecto && v.activo && <button onClick={() => onPatch({ porDefecto: true })}>⭐ Usar por defecto</button>}
        <button onClick={() => { if (v.activo && !confirm(`¿Archivar ${v.alias}? Se guarda el historial pero deja de avisar.`)) return; onPatch({ activo: !v.activo }); }}>
          {v.activo ? "Archivar (lo vendí)" : "Reactivar"}
        </button>
      </div>
    </div>
  );
}
