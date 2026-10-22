"use client";
import { useCallback, useEffect, useState } from "react";
import { Campo, Chips, PageHeader, Sheet, Tip, Toast, type ToastData, api } from "@/components/ui";

type Item = {
  id: string; nombre: string; busquedas: string[]; criterio: string; cantidad: number; unidad: string;
  opcional: boolean; activo: boolean; cotoUrl: string | null; cotoNombre: string | null; notas: string | null;
};
type Producto = { nombre: string; url: string; precio: number | null; promo: string | null; imagen: string | null };

const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const cant = (i: { cantidad: number; unidad: string }) => (i.unidad === "kg" ? `${i.cantidad.toLocaleString("es-AR")} kg` : `×${i.cantidad}`);
const fecha = (s: string) => new Date(s).toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

const ICONO_ESTADO: Record<string, string> = { agregado: "✅", ya_estaba: "☑️", elegido: "🔎", omitido: "➖", sin_resultados: "❌", error: "⚠️" };

export default function Supermercado() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [corridas, setCorridas] = useState<any[]>([]);
  const [editando, setEditando] = useState<Partial<Item> | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const cargar = useCallback(async () => {
    const [l, c] = await Promise.all([api("/api/supermercado/items"), api("/api/supermercado/corridas").catch(() => [])]);
    setItems(l); setCorridas(c);
  }, []);
  useEffect(() => { cargar().catch(() => setItems([])); }, [cargar]);
  const cerrarToast = useCallback(() => setToast(null), []);
  const cerrarEdicion = useCallback(() => setEditando(null), []);

  async function precargar() {
    await api("/api/supermercado/items/inicial", "POST");
    await cargar();
    setToast({ titulo: "✓ Lista habitual cargada", lineas: ["Revisá las búsquedas y cantidades antes del miércoles."] });
  }

  async function toggleActivo(it: Item) {
    setItems(l => l?.map(x => (x.id === it.id ? { ...x, activo: !x.activo } : x)) ?? null);
    await api(`/api/supermercado/items/${it.id}`, "PATCH", { activo: !it.activo }).catch(() => cargar());
  }

  async function fijar(itemId: string, p: { nombre: string; url: string }) {
    await api(`/api/supermercado/items/${itemId}`, "PATCH", { cotoUrl: p.url, cotoNombre: p.nombre });
    await cargar();
    setToast({ titulo: "📌 Producto fijado", lineas: [p.nombre] });
  }

  if (!items) return <div style={{ color: "var(--tx3)", padding: 20 }}>Cargando...</div>;

  const activos = items.filter(i => i.activo);
  const ultima = corridas[0];

  return (
    <div className="vh-page" style={{ maxWidth: 760 }}>
      <PageHeader titulo="Supermercado" sub="Los miércoles a la mañana armo el carrito de Coto con esto. Vos lo revisás y confirmás la compra.">
        {items.length > 0 && <button className="primary" onClick={() => setEditando({ cantidad: 1, unidad: "un", criterio: "primero", busquedas: [] })}>＋ Producto</button>}
      </PageHeader>

      {items.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🛒</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "8px 0 4px" }}>Tu compra de los miércoles</h2>
          <div style={{ color: "var(--tx2)", marginBottom: 18 }}>Cargá la lista una vez y cada semana te dejo el carrito armado en Coto Digital.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="primary" onClick={precargar} style={{ padding: 14 }}>Cargar mi lista habitual</button>
            <button onClick={() => setEditando({ cantidad: 1, unidad: "un", criterio: "primero", busquedas: [] })}>Empezar de cero</button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="card-title">Lista · {activos.length} de {items.length} van esta semana</div>
            {items.map(it => (
              <div key={it.id} className="fila" style={{ opacity: it.activo ? 1 : 0.5 }}>
                <button className={`check ${it.activo ? "on" : ""}`} onClick={() => toggleActivo(it)} aria-label={it.activo ? "Sacar de esta semana" : "Incluir esta semana"} />
                <button onClick={() => setEditando(it)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0 }}>
                  <div style={{ fontWeight: 600 }}>{it.nombre} <span style={{ color: "var(--tx3)", fontWeight: 400 }}>{cant(it)}</span></div>
                  <div style={{ fontSize: 11, color: "var(--tx3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.criterio === "mas_barato" ? "💲 el más barato · " : ""}
                    {it.opcional ? "si hay · " : ""}
                    {it.cotoUrl && it.criterio !== "mas_barato" ? `📌 ${it.cotoNombre || "fijado"}` : `🔎 ${it.busquedas.join(" / ") || it.nombre}`}
                  </div>
                </button>
              </div>
            ))}
          </div>

          {ultima && <UltimaCorrida corrida={ultima} items={items} onFijar={fijar} />}

          <Tip>
            El carrito se arma solo los miércoles a las 8. Para probar antes, en GitHub → Actions → &quot;Carrito de Coto&quot; → Run workflow
            (con <b>solo_buscar</b> ves qué elegiría sin tocar el carrito).
          </Tip>
        </div>
      )}

      <Sheet abierto={!!editando} onCerrar={cerrarEdicion} titulo={editando?.id ? "Editar producto" : "Nuevo producto"}>
        {editando && <FormItem item={editando} onListo={async (msg) => { setEditando(null); await cargar(); if (msg) setToast({ titulo: msg }); }} />}
      </Sheet>
      <Toast data={toast} onCerrar={cerrarToast} />
    </div>
  );
}

function UltimaCorrida({ corrida, items, onFijar }: { corrida: any; items: Item[]; onFijar: (itemId: string, p: { nombre: string; url: string }) => void }) {
  const porId = new Map(items.map(i => [i.id, i]));
  const titulo = corrida.modo === "solo_buscar" ? "Última prueba de búsqueda" : "Último carrito";
  return (
    <div className="card">
      <div className="card-title" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{titulo} · {fecha(corrida.createdAt)}</span>
        {corrida.total ? <span>≈ {pesos(corrida.total)}</span> : null}
      </div>
      {corrida.error && <div style={{ color: "var(--red-t)", marginBottom: 8 }}>⚠️ {corrida.error}</div>}
      {(corrida.detalle as any[]).map(d => {
        const it = porId.get(d.itemId);
        const fijable = it && d.url && d.motivo === "busqueda" && it.cotoUrl !== d.url;
        return (
          <div key={d.itemId} className="fila" style={{ alignItems: "flex-start" }}>
            <span>{ICONO_ESTADO[d.estado] ?? "•"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{d.nombre}</div>
              {d.producto && (
                <div style={{ fontSize: 12, color: "var(--tx2)" }}>
                  <a href={d.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{d.producto}</a>
                  {d.precio ? ` · ${pesos(d.precio)}` : ""}
                </div>
              )}
              {d.nota && <div style={{ fontSize: 11, color: "var(--tx3)" }}>{d.nota}</div>}
            </div>
            {fijable && <button onClick={() => onFijar(d.itemId, { nombre: d.producto, url: d.url })} style={{ fontSize: 11 }} title="Usar siempre este producto">📌 Fijar</button>}
          </div>
        );
      })}
    </div>
  );
}

function FormItem({ item, onListo }: { item: Partial<Item>; onListo: (msg?: string) => void }) {
  const [f, setF] = useState({
    nombre: item.nombre ?? "",
    cantidad: String(item.cantidad ?? 1),
    unidad: item.unidad ?? "un",
    criterio: item.criterio ?? "primero",
    busquedas: (item.busquedas ?? []).join("\n"),
    opcional: item.opcional ?? false,
    cotoUrl: item.cotoUrl ?? "",
    cotoNombre: item.cotoNombre ?? "",
    notas: item.notas ?? "",
  });
  const [prueba, setPrueba] = useState<{ q: string; resultados: Producto[] | null; error?: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: any) => setF(p => ({ ...p, [k]: v }));

  async function probar(q: string) {
    setPrueba({ q, resultados: null });
    try { setPrueba({ q, resultados: await api(`/api/supermercado/buscar?q=${encodeURIComponent(q)}`) }); }
    catch (e: any) { setPrueba({ q, resultados: [], error: e.message }); }
  }

  async function guardar() {
    setGuardando(true); setError("");
    try {
      if (item.id) await api(`/api/supermercado/items/${item.id}`, "PATCH", f);
      else await api("/api/supermercado/items", "POST", f);
      onListo(item.id ? "✓ Guardado" : "✓ Producto agregado");
    } catch (e: any) { setError(e.message); } finally { setGuardando(false); }
  }

  async function borrar() {
    if (!item.id || !confirm(`¿Sacar "${item.nombre}" de la lista?`)) return;
    await api(`/api/supermercado/items/${item.id}`, "DELETE");
    onListo("Producto borrado");
  }

  const busquedas = f.busquedas.split("\n").map(s => s.trim()).filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Campo label="Producto"><input type="text" value={f.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Leche proteica" /></Campo>
      <div className="vh-2">
        <Campo label="Cantidad"><input type="number" inputMode="decimal" step="any" value={f.cantidad} onChange={e => set("cantidad", e.target.value)} /></Campo>
        <Campo label="Unidad">
          <Chips opciones={[{ key: "un", label: "Unidades" }, { key: "kg", label: "Kilos" }]} valor={f.unidad} onChange={v => set("unidad", v)} />
        </Campo>
      </div>
      <Campo label="Qué escribir en la lupa de Coto (una búsqueda por línea)">
        <textarea rows={3} value={f.busquedas} onChange={e => set("busquedas", e.target.value)} placeholder={"pan doble integral mi mago\npan doble integral noly"} />
      </Campo>
      <Campo label="Si hay varias búsquedas">
        <Chips opciones={[{ key: "primero", label: "La primera que encuentre" }, { key: "mas_barato", label: "💲 La más barata" }]} valor={f.criterio} onChange={v => set("criterio", v)} />
      </Campo>
      {(busquedas.length ? busquedas : f.nombre ? [f.nombre] : []).length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(busquedas.length ? busquedas : [f.nombre]).map(q => (
            <button key={q} onClick={() => probar(q)} style={{ fontSize: 11 }}>🔎 Probar “{q}”</button>
          ))}
        </div>
      )}
      {prueba && (
        <div className="card" style={{ padding: 10 }}>
          <div className="card-title" style={{ marginBottom: 6 }}>Coto para “{prueba.q}”</div>
          {!prueba.resultados && <div style={{ color: "var(--tx3)" }}>Buscando…</div>}
          {prueba.error && <div style={{ color: "var(--red-t)" }}>{prueba.error}</div>}
          {prueba.resultados?.length === 0 && !prueba.error && <div style={{ color: "var(--tx3)" }}>Sin resultados</div>}
          {prueba.resultados?.map((p, i) => (
            <div key={p.url} className="fila">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen externa de Coto */}
              {p.imagen && <img src={p.imagen} alt="" width={36} height={36} style={{ objectFit: "contain", borderRadius: 4, background: "#fff" }} />}
              <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                <a href={p.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{i === 0 ? "⭐ " : ""}{p.nombre}</a>
                <div style={{ color: "var(--tx3)" }}>{p.precio ? pesos(p.precio) : ""}{p.promo ? ` · ${p.promo}` : ""}</div>
              </div>
              <button style={{ fontSize: 11 }} onClick={() => { set("cotoUrl", p.url); set("cotoNombre", p.nombre); }}>📌 Fijar</button>
            </div>
          ))}
        </div>
      )}
      <Campo label="Producto fijado (si está, no se busca)">
        {f.cotoUrl ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <a href={f.cotoUrl} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, color: "var(--tx2)", fontSize: 12 }}>📌 {f.cotoNombre || f.cotoUrl}</a>
            <button style={{ fontSize: 11 }} onClick={() => { set("cotoUrl", ""); set("cotoNombre", ""); }}>Quitar</button>
          </div>
        ) : (
          <input type="text" value={f.cotoUrl} onChange={e => set("cotoUrl", e.target.value)} placeholder="Pegá el link del producto en coto.com.ar (opcional)" />
        )}
      </Campo>
      {f.criterio === "mas_barato" && f.cotoUrl && <div style={{ fontSize: 11, color: "var(--tx3)" }}>Con “la más barata” se compara siempre y el fijado no se usa.</div>}
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={f.opcional} onChange={e => set("opcional", e.target.checked)} />
        Solo si hay (si no aparece, no lo marco como faltante)
      </label>
      <Campo label="Notas"><input type="text" value={f.notas} onChange={e => set("notas", e.target.value)} /></Campo>
      {error && <div style={{ color: "var(--red-t)" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        {item.id && <button onClick={borrar}>Borrar</button>}
        <button className="primary" onClick={guardar} disabled={guardando} style={{ flex: 1, padding: 12 }}>{guardando ? "Guardando…" : "Guardar"}</button>
      </div>
    </div>
  );
}
