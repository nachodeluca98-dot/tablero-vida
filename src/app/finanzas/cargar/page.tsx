"use client";
// Carga de movimientos (spec §6.2): por voz con tarjetas editables, modo Rápido y atajos.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Borrador } from "@/lib/finanzas/borrador";
import { nuevaKey } from "@/lib/finanzas/borrador";
import type { DatosCarga } from "@/lib/finanzas/carga";
import { equivalentes, fmtArs, fmtUsd } from "@/lib/finanzas/dinero";
import { hoyISO } from "@/lib/finanzas/fechas";
import GrillaCategorias from "@/components/finanzas/GrillaCategorias";
import { OpcionesCarga } from "@/components/finanzas/HojaCargar";
import TarjetaBorrador, { conImputacion } from "@/components/finanzas/TarjetaBorrador";
import Teclado, { formatearTexto, montoDeTexto } from "@/components/finanzas/Teclado";
import { extensionDe, useGrabadora } from "@/components/finanzas/useGrabadora";

type Guardado = { ids: string[]; texto: string; avisos?: string[] };

function vibrar(ms = 15) {
  try { navigator.vibrate?.(ms); } catch {}
}

function borradorVacio(datos: DatosCarga, extra: Partial<Borrador> = {}): Borrador {
  return conImputacion({
    key: nuevaKey(), tipo: "gasto", descripcion: null, incluye: null, monto: null, moneda: "ARS", esAproximado: false,
    categoriaId: null, presupuestoItemId: null, medioPago: null, tarjetaId: null, cuotasTotal: null, compartido: false,
    notaCompartido: null, metaId: null, fecha: hoyISO(), mesImputacion: hoyISO().slice(0, 7), mesImputacionManual: false,
    ...extra,
  }, datos.tarjetas);
}

async function guardar(borradores: Borrador[], origen: string, extra: Record<string, unknown> = {}) {
  const res = await fetch("/api/finanzas/registros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ borradores, origen, ...extra }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "No se pudo guardar. Probá de nuevo.");
  return j as { ids: string[]; planes: { registroId: string; texto: string }[]; avisos: string[] };
}

async function deshacer(ids: string[]) {
  await fetch("/api/finanzas/registros", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
}

// Aviso inferior con Deshacer, en lugar de pedir confirmación (spec §2.2.5)
function AvisoDeshacer({ guardado, onDeshecho, onCerrar }: { guardado: Guardado; onDeshecho: () => void; onCerrar: () => void }) {
  const [deshaciendo, setDeshaciendo] = useState(false);
  useEffect(() => {
    const t = setTimeout(onCerrar, guardado.avisos?.length ? 9000 : 6000);
    return () => clearTimeout(t);
  }, [guardado, onCerrar]);
  return (
    <div className="fin-toast" role="status" style={{ maxWidth: "calc(100vw - 32px)" }}>
      ✓ {guardado.texto}
      <button
        type="button"
        className="accion"
        disabled={deshaciendo}
        onClick={async () => { setDeshaciendo(true); await deshacer(guardado.ids); onDeshecho(); }}
      >
        Deshacer
      </button>
      {guardado.avisos?.map((a) => <div key={a} style={{ fontSize: 12, color: "var(--amb-t)", marginTop: 4 }}>¿Posible duplicado? {a}</div>)}
    </div>
  );
}

// ─── Modo rápido ────────────────────────────────────────────────

function ModoRapido({ datos, atajo, descripcion }: { datos: DatosCarga; atajo: { categoriaId: string; descripcion: string } | null; descripcion?: string | null }) {
  const [valor, setValor] = useState("");
  const [b, setB] = useState<Borrador>(() =>
    borradorVacio(datos, atajo ? { categoriaId: atajo.categoriaId, descripcion: atajo.descripcion } : { descripcion: descripcion || null })
  );
  // Si viene una descripción sin categoría (p. ej. un dictado que no se pudo interpretar), se muestran los detalles
  const [detalles, setDetalles] = useState(!atajo && !!descripcion);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<Guardado | null>(null);

  const monto = montoDeTexto(valor);
  const eq = monto ? equivalentes(monto, b.moneda, datos.tipoCambio) : null;

  async function guardarCon(categoriaId: string | null) {
    if (!monto || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const final = { ...b, monto, categoriaId };
      const r = await guardar([final], "app_rapida", { chequearDuplicados: true });
      vibrar();
      const cat = datos.categorias.find((c) => c.id === categoriaId);
      const plan = r.planes[0]?.texto;
      setGuardado({
        ids: r.ids,
        texto: `${b.moneda === "USD" ? fmtUsd(monto) : fmtArs(monto)} en ${cat?.nombre ?? "Sin clasificar"}${plan ? ` · ${plan}` : ""}`,
        avisos: r.avisos,
      });
      setValor("");
      setB(borradorVacio(datos));
      setDetalles(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
        {(["ARS", "USD"] as const).map((m) => (
          <button key={m} type="button" className={`fin-chip ${b.moneda === m ? "activo" : ""}`} onClick={() => setB({ ...b, moneda: m })}>{m}</button>
        ))}
      </div>
      <div className="fin-monto-display" aria-live="polite">
        {valor ? <>{b.moneda === "USD" ? "US$ " : "$ "}{formatearTexto(valor)}</> : <span className="vacio">{b.moneda === "USD" ? "US$ 0" : "$ 0"}</span>}
      </div>
      <div className="fin-monto-conv">{eq ? (b.moneda === "ARS" ? fmtUsd(eq.usd) : fmtArs(eq.ars)) : ""}</div>
      <Teclado valor={valor} onChange={setValor} />

      {atajo ? (
        <button type="button" className="fin-btn primario" style={{ width: "100%", marginTop: 12, minHeight: 52 }} disabled={!monto || guardando} onClick={() => guardarCon(b.categoriaId)}>
          Guardar {b.descripcion}
        </button>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 6 }}>
            {monto ? "Tocá la categoría y listo" : "Escribí el monto y tocá la categoría"}
          </div>
          <GrillaCategorias categorias={datos.categorias} tipo={b.tipo} sugerida={b.categoriaId} onElegir={(id) => guardarCon(id)} />
          <button type="button" className="fin-chip vacio" style={{ marginTop: 8 }} disabled={!monto || guardando} onClick={() => guardarCon(null)}>
            Guardar sin categoría
          </button>
        </div>
      )}

      {error && <div style={{ color: "var(--amb-t)", marginTop: 10 }}>{error}</div>}

      <button type="button" className="fin-link" style={{ marginTop: 8 }} onClick={() => setDetalles((d) => !d)} aria-expanded={detalles}>
        {detalles ? "Menos detalles" : "Más detalles"}
      </button>
      {detalles && (
        <TarjetaBorrador b={b} datos={datos} onChange={setB} ocultarMonto ocultarCategoria={!atajo} />
      )}

      {guardado && (
        <AvisoDeshacer
          guardado={guardado}
          onCerrar={() => setGuardado(null)}
          onDeshecho={() => { setGuardado(null); vibrar(); }}
        />
      )}
    </>
  );
}

// ─── Modo voz ───────────────────────────────────────────────────

type FaseVoz = "listo" | "grabando" | "transcribiendo" | "interpretando" | "revision" | "error" | "guardado";

function ModoVoz({ datos }: { datos: DatosCarga }) {
  const router = useRouter();
  const g = useGrabadora();
  const [fase, setFase] = useState<FaseVoz>("listo");
  const [lista, setLista] = useState<Borrador[]>([]);
  const [texto, setTexto] = useState(""); // lo dictado (o escrito); nunca se pierde
  const [error, setError] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [quitado, setQuitado] = useState<{ b: Borrador; i: number } | null>(null);
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  const [porVoz, setPorVoz] = useState(false);
  const audioPendiente = useRef<Blob | null>(null);
  const arrancado = useRef(false);

  const interpretar = useCallback(async (t: string, correccion: boolean) => {
    setFase("interpretando");
    setError(null);
    const res = await fetch("/api/finanzas/interpretar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: t, lista: correccion ? lista : undefined }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setError(j.error || "No pude interpretarlo. Revisá la conexión.");
      setFase(correccion ? "revision" : "error");
      return;
    }
    setLista(j.borradores);
    setFase("revision");
  }, [lista]);

  const transcribir = useCallback(async (audio: Blob, correccion: boolean) => {
    audioPendiente.current = audio;
    setFase("transcribiendo");
    setError(null);
    const form = new FormData();
    form.append("audio", audio, `dictado.${extensionDe(audio.type)}`);
    const res = await fetch("/api/finanzas/transcribir", { method: "POST", body: form }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok || !j.texto) {
      setError(j.error || (res ? "No te pude escuchar bien. Probá de nuevo o escribilo." : "Sin conexión. Probá de nuevo cuando vuelva."));
      setFase(correccion ? "revision" : "error");
      return;
    }
    audioPendiente.current = null;
    setPorVoz(true);
    const t: string = j.texto;
    setTexto((prev) => (correccion && prev ? `${prev}\n${t}` : t));
    await interpretar(t, correccion);
  }, [interpretar]);

  const empezar = useCallback(async (correccion = false) => {
    setCorrigiendo(correccion);
    setError(null);
    const ok = await g.empezar();
    if (ok) setFase("grabando");
    else if (!correccion) setFase("error");
  }, [g]);

  const terminar = useCallback(async () => {
    const audio = await g.terminar();
    if (!audio) { setFase(corrigiendo ? "revision" : "listo"); return; }
    await transcribir(audio, corrigiendo);
  }, [g, corrigiendo, transcribir]);

  // Entrar a "Dictar" ya empieza a escuchar
  useEffect(() => {
    if (arrancado.current) return;
    arrancado.current = true;
    empezar(false);
  }, [empezar]);

  function quitar(i: number) {
    setQuitado({ b: lista[i], i });
    setLista((l) => l.filter((_, j) => j !== i));
    vibrar(8);
  }

  async function guardarTodo() {
    const validos = lista.filter((b) => b.monto != null && b.monto > 0);
    if (!validos.length) return;
    setFase("guardado");
    try {
      const r = await guardar(validos, porVoz ? "app_voz" : "app_formulario", { transcripcion: texto });
      vibrar(25);
      setGuardado({ ids: r.ids, texto: r.ids.length === 1 ? "1 movimiento guardado" : `${r.ids.length} movimientos guardados` });
      setLista([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setFase("revision");
    }
  }

  const sinMonto = lista.filter((b) => b.monto == null).length;
  const grabando = g.estado === "grabando";

  // Pantalla de grabación / errores
  if (fase !== "revision" && fase !== "guardado") {
    return (
      <div style={{ paddingTop: 12 }}>
        {(fase === "listo" || fase === "grabando") && (
          <>
            <button type="button" className={`fin-mic ${grabando ? "grabando" : ""}`} onClick={() => (grabando ? terminar() : empezar(false))} aria-label={grabando ? "Terminar de dictar" : "Empezar a dictar"}>
              {grabando ? "■" : "🎙"}
            </button>
            <div className="fin-onda" aria-hidden>
              {g.niveles.map((n, i) => <span key={i} style={{ height: `${Math.max(4, n * 48)}px`, opacity: grabando ? 1 : 0.3 }} />)}
            </div>
            <div className="fin-ejemplo">
              {grabando ? <>Te escucho. Tocá ■ cuando termines.</> : g.estado === "pidiendo" ? "Pidiendo permiso para el micrófono…" : "Tocá el micrófono y hablá."}
              <br />Ej.: &quot;súper 180 lucas, delivery 25 con la visa&quot;
            </div>
          </>
        )}

        {(fase === "transcribiendo" || fase === "interpretando") && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 36 }} aria-hidden>{fase === "transcribiendo" ? "👂" : "🧠"}</div>
            <div style={{ fontWeight: 600, marginTop: 8 }}>{fase === "transcribiendo" ? "Escuchando lo que dijiste…" : "Entendiendo los gastos…"}</div>
            <div className="fin-ejemplo" style={{ marginTop: 8 }}>{texto ? `"${texto}"` : 'Ej.: "súper 180 lucas, delivery 25 con la visa"'}</div>
          </div>
        )}

        {fase === "error" && (
          <div className="fin-vacio" role="alert">
            {g.estado === "denegada" ? (
              <>
                <strong>No tengo permiso para usar el micrófono</strong>
                Habilitalo desde el candado de la barra de direcciones (o en Ajustes → Safari/Chrome → Micrófono) y volvé a intentar. Mientras tanto, podés escribirlo o usar el modo Rápido.
              </>
            ) : g.estado === "no_soportada" ? (
              <>
                <strong>Este navegador no permite grabar audio</strong>
                Escribilo acá abajo o usá el modo Rápido.
              </>
            ) : (
              <>
                <strong>Algo no salió bien</strong>
                {error}
              </>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {audioPendiente.current && <button type="button" className="fin-btn primario" onClick={() => transcribir(audioPendiente.current!, false)}>Reintentar</button>}
              {g.estado !== "denegada" && g.estado !== "no_soportada" && <button type="button" className="fin-btn secundario" onClick={() => empezar(false)}>Dictar de nuevo</button>}
              <Link href="/finanzas/cargar?modo=rapido" className="fin-btn secundario">Modo Rápido</Link>
            </div>
          </div>
        )}

        {/* Siempre se puede escribir: también es la salida cuando la voz falla (spec §11) */}
        {fase !== "transcribiendo" && fase !== "interpretando" && (
          <form style={{ marginTop: 20 }} onSubmit={(e) => { e.preventDefault(); if (texto.trim()) { setPorVoz(false); interpretar(texto, false); } }}>
            <label style={{ fontSize: 12, color: "var(--tx3)" }}>{fase === "error" && texto ? "Lo que entendí (podés corregirlo)" : "O escribilo"}</label>
            <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="súper 180 lucas, delivery 25 con la visa" style={{ fontSize: 16, borderRadius: 10, marginTop: 4 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="submit" className="fin-btn secundario" disabled={!texto.trim()}>Interpretar</button>
              {fase === "error" && texto.trim() && (
                <Link href={`/finanzas/cargar?modo=rapido&desc=${encodeURIComponent(texto.trim().slice(0, 80))}`} className="fin-btn secundario">Cargar sin clasificar</Link>
              )}
            </div>
          </form>
        )}
      </div>
    );
  }

  // Guardado: devolución breve y positiva, con Deshacer
  if (fase === "guardado") {
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        {guardado ? (
          <>
            <div style={{ fontSize: 44 }} aria-hidden>✅</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginTop: 6 }}>{guardado.texto}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18 }}>
              <button type="button" className="fin-btn primario" onClick={() => { setGuardado(null); setTexto(""); setFase("listo"); empezar(false); }}>🎙 Dictar otro</button>
              <button type="button" className="fin-btn secundario" onClick={() => router.push("/finanzas")}>Listo</button>
            </div>
            <button
              type="button"
              className="fin-link"
              style={{ marginTop: 12 }}
              onClick={async () => { await deshacer(guardado.ids); setGuardado(null); setTexto(""); setFase("listo"); }}
            >
              Deshacer
            </button>
          </>
        ) : (
          <div style={{ color: "var(--tx3)" }}>Guardando…</div>
        )}
      </div>
    );
  }

  // Revisión: tarjetas editables
  return (
    <div style={{ paddingBottom: 90 }}>
      {texto && <div className="fin-ejemplo" style={{ textAlign: "left", marginBottom: 10 }}>&quot;{texto}&quot;</div>}
      {lista.length === 0 && (
        <div className="fin-vacio">
          <strong>No quedó nada para guardar</strong>
          Dictá de nuevo o escribilo.
          <div style={{ marginTop: 10 }}><button type="button" className="fin-btn secundario" onClick={() => { setFase("listo"); empezar(false); }}>🎙 Dictar</button></div>
        </div>
      )}
      {lista.map((b, i) => (
        <TarjetaBorrador
          key={b.key}
          b={b}
          datos={datos}
          onChange={(nb) => setLista((l) => l.map((x) => (x.key === b.key ? nb : x)))}
          onQuitar={() => quitar(i)}
        />
      ))}
      {error && <div style={{ color: "var(--amb-t)", marginTop: 10 }} role="alert">{error}</div>}
      {sinMonto > 0 && <div style={{ color: "var(--tx3)", fontSize: 12, marginTop: 8 }}>Los que no tienen monto no se guardan. Tocá &quot;Falta el monto&quot; para completarlo.</div>}

      <div className="fin-barra-accion">
        <button
          type="button"
          className={`fin-btn ${grabando ? "primario" : "secundario"}`}
          onClick={() => (grabando ? terminar() : empezar(true))}
          aria-label={grabando ? "Terminar corrección" : "Corregir dictando"}
          style={{ flex: "0 0 auto" }}
        >
          {grabando ? "■ Listo" : "🎙 Corregir"}
        </button>
        <button type="button" className="fin-btn primario" disabled={!lista.some((b) => b.monto)} onClick={guardarTodo}>
          Guardar todo ({lista.filter((b) => b.monto).length})
        </button>
      </div>

      {grabando && (
        <div className="fin-ejemplo" style={{ marginTop: 12 }}>Te escucho… ej.: &quot;el segundo eran 50 y va en delivery&quot;</div>
      )}

      {quitado && (
        <QuitadoAviso
          onDeshacer={() => { setLista((l) => [...l.slice(0, quitado.i), quitado.b, ...l.slice(quitado.i)]); setQuitado(null); }}
          onCerrar={() => setQuitado(null)}
        />
      )}
    </div>
  );
}

function QuitadoAviso({ onDeshacer, onCerrar }: { onDeshacer: () => void; onCerrar: () => void }) {
  useEffect(() => {
    const t = setTimeout(onCerrar, 5000);
    return () => clearTimeout(t);
  }, [onCerrar]);
  return (
    <div className="fin-toast" role="status" style={{ bottom: 150 }}>
      Movimiento quitado
      <button type="button" className="accion" onClick={onDeshacer}>Deshacer</button>
    </div>
  );
}

// ─── Página ─────────────────────────────────────────────────────

function Cargar() {
  const sp = useSearchParams();
  const modo = sp.get("modo");
  const [datos, setDatos] = useState<DatosCarga | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/finanzas/carga", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDatos)
      .catch(() => setError(true));
  }, []);

  const titulo = modo === "voz" ? "Dictar" : modo === "rapido" ? "Carga rápida" : "Cargar";
  const categoria = sp.get("categoria");
  const desc = sp.get("desc");

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{titulo}</h1>
        <Link href="/finanzas" className="fin-link">Cerrar</Link>
      </div>
      <div style={{ marginTop: 12 }}>
        {error && <div className="fin-vacio">No pudimos cargar tus categorías. Revisá la conexión y probá de nuevo.</div>}
        {!datos && !error && <div style={{ color: "var(--tx3)" }}>Cargando…</div>}
        {datos && modo === "voz" && <ModoVoz datos={datos} />}
        {datos && modo === "rapido" && (
          <ModoRapido
            key={`${categoria}-${desc}`}
            datos={datos}
            atajo={categoria && datos.categorias.some((c) => c.id === categoria) ? { categoriaId: categoria, descripcion: desc || "" } : null}
            descripcion={desc}
          />
        )}
        {datos && !modo && <OpcionesCarga atajos={datos.atajos} categorias={datos.categorias} />}
      </div>
    </>
  );
}

export default function PaginaCargar() {
  return (
    <Suspense fallback={<div style={{ color: "var(--tx3)" }}>Cargando…</div>}>
      <Cargar />
    </Suspense>
  );
}
