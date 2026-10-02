"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import CargaSheet, { type Preset } from "@/components/vehiculos/CargaSheet";
import { Sheet, TIPO_LABEL, Toast, type ToastData, api, guardarLocal, km, leerLocal } from "@/components/vehiculos/comun";
import { AltaVehiculo, Bienvenida, EstadoInicialForm, PrimerosPasos } from "@/components/vehiculos/Onboarding";
import { Ajustes, Gastos, Historial, Pendientes, Resumen } from "@/components/vehiculos/Secciones";

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "historial", label: "Historial" },
  { key: "gastos", label: "Gastos" },
  { key: "ajustes", label: "Ajustes" },
] as const;
type Tab = (typeof TABS)[number]["key"];

// Tipos que se cargan desde el formulario de estado inicial
const DESDE_ESTADO = new Set(["aceite", "service", "vtv", "correa", "neumaticos"]);

export default function Vehiculos() {
  const [lista, setLista] = useState<any[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [det, setDet] = useState<any>(null);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("resumen");
  const [carga, setCarga] = useState<{ abierto: boolean; preset: Preset | null }>({ abierto: false, preset: null });
  const [alta, setAlta] = useState(false);
  const [estado, setEstado] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const cargarLista = useCallback(async () => {
    const l = await api("/api/vehiculos");
    setLista(l);
    setSelId(id => (id && l.some((v: any) => v.id === id) ? id : l.find((v: any) => v.activo)?.id ?? l[0]?.id ?? null));
  }, []);
  const cargarDetalle = useCallback(async () => {
    if (!selId) { setDet(null); return; }
    setDet(await api(`/api/vehiculos/${selId}`));
  }, [selId]);
  const cargarPendientes = useCallback(async () => { setPendientes(await api("/api/vehiculos/pendientes")); }, []);

  useEffect(() => {
    cargarLista().catch(() => setLista([]));
    cargarPendientes().catch(() => {});
    const t = leerLocal("vh-tab");
    if (t && TABS.some(x => x.key === t)) setTab(t as Tab);
  }, [cargarLista, cargarPendientes]);
  useEffect(() => { cargarDetalle().catch(() => {}); }, [cargarDetalle]);

  const refrescar = useCallback(async () => {
    await Promise.all([cargarLista(), cargarDetalle(), cargarPendientes()]).catch(() => {});
  }, [cargarLista, cargarDetalle, cargarPendientes]);

  const cambiarTab = (t: Tab) => { setTab(t); guardarLocal("vh-tab", t); };
  const cerrarToast = useCallback(() => setToast(null), []);
  const cerrarCarga = useCallback(() => setCarga(c => ({ ...c, abierto: false })), []);
  const abrirCarga = (preset: Preset | null = null) => setCarga({ abierto: true, preset });

  const historial = useMemo(() => {
    if (!det) return [];
    const c = det.vehiculo.cargas.map((x: any) => ({ ...x, kind: "carga", monto: x.montoTotal }));
    const m = det.vehiculo.mantenimientos.map((x: any) => ({ ...x, kind: "mantenimiento" }));
    return [...c, ...m].sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha) || +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [det]);

  const gastoMes = useMemo(() => {
    const d = new Date();
    const desde = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    return historial.filter(h => h.monto && +new Date(h.fecha) >= desde).reduce((s, h) => s + h.monto, 0);
  }, [historial]);

  const costoKm = useMemo(() => {
    const odos = historial.filter(h => h.odometro != null).map(h => h.odometro);
    if (odos.length < 2) return null;
    const recorrido = Math.max(...odos) - Math.min(...odos);
    return recorrido > 0 ? historial.reduce((s, h) => s + (h.monto ?? 0), 0) / recorrido : null;
  }, [historial]);

  async function onGuardado(resp: any, vid: string) {
    setCarga(c => ({ ...c, abierto: false }));
    setSelId(vid);
    await refrescar();
    const titulo = resp.kind === "carga"
      ? `✓ ${Number(resp.litros).toLocaleString("es-AR")} L registrados`
      : `✓ Guardado: ${TIPO_LABEL[resp.tipo] ?? "registro"}`;
    setToast({
      titulo,
      lineas: resp.feedback,
      deshacer: async () => {
        await api(`/api/vehiculos/${vid}/registros?kind=${resp.kind}&rid=${resp.id}`, "DELETE");
        await refrescar();
      },
    });
  }

  async function borrar(h: any) {
    if (!confirm("¿Borrar este registro?")) return;
    await api(`/api/vehiculos/${selId}/registros?kind=${h.kind}&rid=${h.id}`, "DELETE");
    await refrescar();
    setToast({ titulo: "Registro borrado" });
  }

  async function patchVehiculo(data: any) {
    await api(`/api/vehiculos/${selId}`, "PATCH", data);
    await refrescar();
  }

  function cargarUltimo(tipo: string) {
    if (DESDE_ESTADO.has(tipo)) setEstado(true);
    else abrirCarga({ opcion: "mantenimiento", tipo, manual: true });
  }

  function irASeguro() {
    cambiarTab("ajustes");
    setTimeout(() => document.getElementById("vh-seguro")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }

  if (!lista) return <div style={{ color: "var(--tx3)", padding: 20 }}>Cargando...</div>;

  const activos = lista.filter(x => x.activo);
  const v = det?.vehiculo && det.vehiculo.id === selId ? det.vehiculo : null;
  const sinDatos = det ? new Set<string>(det.vencimientos.filter((x: any) => x.estado === "sin_datos").map((x: any) => x.tipo)) : null;

  return (
    <div className="vh-page" style={{ maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Vehículos</h1>
        {lista.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setAlta(true)} style={{ fontSize: 12 }}>+ Vehículo</button>
            {activos.length > 0 && <button className="primary vh-solo-desktop" onClick={() => abrirCarga()}>＋ Cargar</button>}
          </div>
        )}
      </div>

      {lista.length === 0 && <Bienvenida onEmpezar={() => setAlta(true)} />}

      {lista.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {lista.length > 1 && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
              {lista.map(x => {
                const suyos = pendientes.filter(p => p.vehiculoId === x.id);
                const urgente = suyos.some(p => p.nivel === "urgente");
                return (
                  <button key={x.id} className={`vh-chip ${x.id === selId ? "on" : ""}`} onClick={() => setSelId(x.id)} style={{ opacity: x.activo ? 1 : 0.5 }}>
                    {x.porDefecto ? "⭐ " : ""}{x.alias}
                    {suyos.length > 0 && (
                      <span style={{ marginLeft: 6, borderRadius: 999, padding: "0 6px", fontSize: 10, fontWeight: 700,
                        background: urgente ? "var(--red)" : "var(--amb)", color: "#000" }}>{suyos.length}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {v && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{v.alias}{!v.activo && <span style={{ fontSize: 12, color: "var(--tx3)" }}> · archivado</span>}</div>
                  <div style={{ fontSize: 12, color: "var(--tx3)" }}>
                    {[v.marca, v.modelo, v.anio].filter(Boolean).join(" ") || (
                      <button onClick={() => cambiarTab("ajustes")} style={{ border: "none", background: "none", padding: 0, color: "var(--tx3)", fontSize: 12, textDecoration: "underline" }}>+ marca y modelo</button>
                    )}{v.patente ? ` · ${v.patente}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{km(det.kmHoy)}</div>
                  <div style={{ fontSize: 10, color: "var(--tx3)" }}>km{det.kmHoy !== v.kmActual ? " estimados" : ""}</div>
                </div>
              </div>

              {activos.length > 0 && (
                <Pendientes items={pendientes.filter(x => x.vehiculoId === v.id)} variosVehiculos={false} onListo={refrescar} onToast={setToast} />
              )}

              <PrimerosPasos det={det} onEstado={() => setEstado(true)} onCarga={() => abrirCarga({ opcion: "carga" })} />

              <div className="vh-tabs" role="tablist">
                {TABS.map(t => (
                  <button key={t.key} role="tab" aria-selected={tab === t.key} className={`vh-tab ${tab === t.key ? "on" : ""}`} onClick={() => cambiarTab(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "resumen" && <Resumen det={det} gastoMes={gastoMes} costoKm={costoKm} onCargarUltimo={cargarUltimo} onSeguro={irASeguro} />}
              {tab === "historial" && <Historial historial={historial} onBorrar={borrar} />}
              {tab === "gastos" && <Gastos historial={historial} />}
              {tab === "ajustes" && <Ajustes v={v} onPatch={patchVehiculo} onEstado={() => setEstado(true)} />}
            </>
          )}
        </div>
      )}

      {activos.length > 0 && !carga.abierto && !alta && !estado && (
        <button className="vh-fab vh-solo-mobile" onClick={() => abrirCarga()} aria-label="Cargar">＋ Cargar</button>
      )}

      <CargaSheet abierto={carga.abierto} onCerrar={cerrarCarga} vehiculos={activos} vehiculoId={v?.activo ? selId : activos[0]?.id ?? null}
        preset={carga.preset} onGuardado={onGuardado} />

      <AltaVehiculo
        abierto={alta}
        onCerrar={() => { setAlta(false); refrescar(); }}
        onCreado={id => { setSelId(id); cambiarTab("resumen"); cargarLista(); }}
        onEstadoGuardado={refrescar}
        onPrimeraCarga={() => { setAlta(false); refrescar(); abrirCarga({ opcion: "carga" }); }}
      />

      <Sheet abierto={estado && !!v} onCerrar={() => setEstado(false)} titulo={`¿Cómo está ${v?.alias ?? ""} hoy?`}>
        {v && (
          <EstadoInicialForm vehiculo={v} sinDatos={sinDatos}
            onGuardado={async () => { setEstado(false); await refrescar(); setToast({ titulo: "✓ Estado guardado", lineas: ["Ya calculé tus próximos vencimientos."] }); }}
            onSaltear={() => setEstado(false)} textoSaltear="Cancelar" />
        )}
      </Sheet>

      <Toast data={toast} onCerrar={cerrarToast} />
    </div>
  );
}
