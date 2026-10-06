"use client";
// Gráficos del módulo en SVG/HTML sin librerías.
// Paleta validada para el fondo oscuro (#111114): orden fijo, nunca ciclado. Ver skill dataviz.
// Specs: barras ≤ 24px con 4px redondeados en la punta y base recta; líneas 2px; grilla hairline;
// leyenda con ≥ 2 series; el texto nunca usa el color de la serie; hover/tap con detalle; vista de tabla.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export const SERIE = { ahorro: "#3987e5", gastos: "#d95926", ingresos: "#199e70" } as const;
export const CATEGORICO = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const GRILLA = "#26262d";
const SUPERFICIE = "#111114";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const mesCorto = (am: string) => `${MESES_CORTOS[Number(am.slice(5, 7)) - 1]}${am.slice(5, 7) === "01" ? " " + am.slice(2, 4) : ""}`;

// Valor compacto para ejes: 1,2 M · 450 k · 980
export function compacto(n: number, prefijo = "") {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${(a / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M` : a >= 1e3 ? `${Math.round(a / 1e3).toLocaleString("es-AR")} k` : Math.round(a).toLocaleString("es-AR");
  return `${n < 0 ? "−" : ""}${prefijo}${s}`;
}

function ticks(max: number) {
  if (max <= 0) return [0];
  const paso0 = max / 4;
  const pot = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= paso0) ?? paso0;
  const out: number[] = [];
  for (let v = 0; v <= max + paso * 0.001; v += paso) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + paso);
  return out;
}

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, ancho };
}

export function Leyenda({ items }: { items: { nombre: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "var(--tx2)", marginBottom: 8 }}>
      {items.map((i) => (
        <span key={i.nombre} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: i.color }} />
          {i.nombre}
        </span>
      ))}
    </div>
  );
}

// Tabla equivalente (accesibilidad: nada depende solo del color ni del gráfico)
export function TablaDatos({ columnas, filas }: { columnas: string[]; filas: (string | number)[][] }) {
  return (
    <div style={{ overflowX: "auto", marginTop: 8 }}>
      <table>
        <thead><tr>{columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i}>{f.map((v, j) => <td key={j} style={{ textAlign: j ? "right" : "left", fontVariantNumeric: "tabular-nums" }}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function ConTabla({ children, tabla }: { children: React.ReactNode; tabla: React.ReactNode }) {
  const [ver, setVer] = useState(false);
  return (
    <>
      {ver ? tabla : children}
      <button type="button" className="fin-link" onClick={() => setVer(!ver)} style={{ fontSize: 12 }}>{ver ? "Ver gráfico" : "Ver tabla"}</button>
    </>
  );
}

// ─── Barras horizontales (una serie, ordenadas) ─────────────────

export function BarrasH({ filas, color = SERIE.ahorro }: {
  filas: { clave: string; etiqueta: string; icono?: string | null; valor: number; texto: string; secundario?: string; href?: string }[];
  color?: string;
}) {
  const max = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {filas.map((f) => {
        const contenido = (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, marginBottom: 4 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.icono} {f.etiqueta}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                <strong>{f.texto}</strong>{f.secundario && <span style={{ color: "var(--tx3)", fontSize: 12 }}> {f.secundario}</span>}
              </span>
            </div>
            <div style={{ height: 12, background: GRILLA, borderRadius: "0 4px 4px 0" }}>
              <div style={{ width: `${Math.max(1, (f.valor / max) * 100)}%`, height: "100%", background: color, borderRadius: "0 4px 4px 0" }} />
            </div>
          </>
        );
        return f.href ? (
          <Link key={f.clave} href={f.href} style={{ color: "inherit", textDecoration: "none", display: "block", minHeight: 44 }}>{contenido}</Link>
        ) : (
          <div key={f.clave}>{contenido}</div>
        );
      })}
    </div>
  );
}

// ─── Columnas (agrupadas o apiladas) con detalle al tocar ───────

export function Columnas({ etiquetas, series, apilado, formato, formatoDetalle, detalle, alto = 200, onTocar }: {
  etiquetas: string[];
  series: { nombre: string; color: string; valores: number[] }[];
  apilado?: boolean;
  formato: (n: number) => string; // eje (compacto)
  formatoDetalle?: (n: number) => string; // valores completos en el detalle (por defecto, el del eje)
  detalle?: (i: number) => string[]; // líneas extra del detalle (p. ej. el equivalente en pesos)
  alto?: number;
  onTocar?: (i: number) => void;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const IZQ = 44, ABAJO = 22, ARRIBA = 8;
  const n = etiquetas.length;
  const altoPlot = alto - ABAJO - ARRIBA;
  const anchoPlot = ancho - IZQ - 4;
  const banda = anchoPlot / Math.max(1, n);
  const totales = etiquetas.map((_, i) => (apilado ? series.reduce((t, s) => t + Math.max(0, s.valores[i] ?? 0), 0) : Math.max(0, ...series.map((s) => s.valores[i] ?? 0))));
  const tk = ticks(Math.max(...totales, 0));
  const max = tk[tk.length - 1] || 1;
  const y = (v: number) => ARRIBA + altoPlot - (v / max) * altoPlot;
  const GAP = 2;
  const anchoBarra = apilado ? Math.min(24, banda * 0.6) : Math.min(24, (banda * 0.8 - GAP * (series.length - 1)) / series.length);

  // Columna con 4px redondeados arriba y base recta
  const barra = (x: number, y0: number, y1: number, w: number, color: string, key: string, redondear = true) => {
    const h = y0 - y1;
    if (h <= 0.5) return null;
    const r = redondear ? Math.min(4, w / 2, h) : 0;
    const d = `M${x},${y0} L${x},${y1 + r} Q${x},${y1} ${x + r},${y1} L${x + w - r},${y1} Q${x + w},${y1} ${x + w},${y1 + r} L${x + w},${y0} Z`;
    return <path key={key} d={d} fill={color} />;
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Leyenda items={series} />
      <svg width={ancho} height={alto} role="img" aria-label={`Gráfico de ${series.map((s) => s.nombre).join(", ")} por mes`} onMouseLeave={() => setActivo(null)}>
        {tk.map((v) => (
          <g key={v}>
            <line x1={IZQ} x2={ancho - 4} y1={y(v)} y2={y(v)} stroke={GRILLA} strokeWidth={1} />
            <text x={IZQ - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--tx3)">{formato(v)}</text>
          </g>
        ))}
        {etiquetas.map((et, i) => {
          const x0 = IZQ + banda * i;
          let acumulado = 0;
          return (
            <g key={et + i}>
              {apilado
                ? series.map((s, j) => {
                    const v = Math.max(0, s.valores[i] ?? 0);
                    const ya = y(acumulado), yb = y(acumulado + v);
                    acumulado += v;
                    const esUltima = series.slice(j + 1).every((o) => !(o.valores[i] > 0));
                    // 2px de superficie entre segmentos
                    return barra(x0 + (banda - anchoBarra) / 2, ya - (j && v ? GAP / 2 : 0), yb + (esUltima ? 0 : GAP / 2), anchoBarra, s.color, s.nombre, esUltima);
                  })
                : series.map((s, j) => {
                    const v = Math.max(0, s.valores[i] ?? 0);
                    const grupo = series.length * anchoBarra + GAP * (series.length - 1);
                    return barra(x0 + (banda - grupo) / 2 + j * (anchoBarra + GAP), y(0), y(v), anchoBarra, s.color, s.nombre);
                  })}
              <text x={x0 + banda / 2} y={alto - 6} textAnchor="middle" fontSize={10} fill={activo === i ? "var(--tx)" : "var(--tx3)"}>{et}</text>
              {/* Zona táctil de toda la banda (más grande que la barra) */}
              <rect
                x={x0} y={0} width={banda} height={alto} fill={activo === i ? "rgba(255,255,255,.04)" : "transparent"}
                onMouseEnter={() => setActivo(i)} onClick={() => { setActivo(i); onTocar?.(i); }}
                style={{ cursor: onTocar ? "pointer" : "default" }}
              />
            </g>
          );
        })}
        <line x1={IZQ} x2={ancho - 4} y1={y(0)} y2={y(0)} stroke="var(--tx3)" strokeWidth={1} />
      </svg>
      {activo != null && (
        <div
          role="status"
          style={{
            position: "absolute", top: 28, left: Math.min(Math.max(0, IZQ + banda * activo + banda / 2 - 80), ancho - 170), width: 170, pointerEvents: "none",
            background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: 8, padding: "8px 10px", fontSize: 12, boxShadow: "0 6px 20px rgba(0,0,0,.4)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{etiquetas[activo]}</div>
          {series.map((s) => (
            <div key={s.nombre} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
              <span style={{ flex: 1, color: "var(--tx2)" }}>{s.nombre}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{(formatoDetalle ?? formato)(s.valores[activo] ?? 0)}</span>
            </div>
          ))}
          {detalle?.(activo).map((l) => <div key={l} style={{ color: "var(--tx3)", marginTop: 2 }}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── Línea con área (una serie) ─────────────────────────────────

export function Linea({ etiquetas, valores, color = SERIE.ahorro, formato, formatoDetalle, detalle, alto = 180 }: {
  etiquetas: string[];
  valores: number[];
  color?: string;
  formato: (n: number) => string;
  formatoDetalle?: (n: number) => string;
  detalle?: (i: number) => string[];
  alto?: number;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const IZQ = 44, ABAJO = 22, ARRIBA = 14, DER = 12;
  const n = valores.length;
  const tk = ticks(Math.max(...valores, 0));
  const max = tk[tk.length - 1] || 1;
  const x = (i: number) => IZQ + (n <= 1 ? (ancho - IZQ - DER) / 2 : (i * (ancho - IZQ - DER)) / (n - 1));
  const y = (v: number) => ARRIBA + (alto - ABAJO - ARRIBA) - (Math.max(0, v) / max) * (alto - ABAJO - ARRIBA);
  const d = valores.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = `${d} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const cada = Math.max(1, Math.ceil(n / Math.floor((ancho - IZQ) / 44)));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <svg
        width={ancho} height={alto} role="img" aria-label="Evolución" onMouseLeave={() => setActivo(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - IZQ) / Math.max(1, ancho - IZQ - DER)) * (n - 1));
          setActivo(Math.max(0, Math.min(n - 1, i)));
        }}
        onClick={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - IZQ) / Math.max(1, ancho - IZQ - DER)) * (n - 1));
          setActivo(Math.max(0, Math.min(n - 1, i)));
        }}
      >
        {tk.map((v) => (
          <g key={v}>
            <line x1={IZQ} x2={ancho - DER} y1={y(v)} y2={y(v)} stroke={GRILLA} strokeWidth={1} />
            <text x={IZQ - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--tx3)">{formato(v)}</text>
          </g>
        ))}
        {etiquetas.map((et, i) => (i % cada === 0 || i === n - 1 ? <text key={et + i} x={x(i)} y={alto - 6} textAnchor="middle" fontSize={10} fill="var(--tx3)">{et}</text> : null))}
        {n > 1 && <path d={area} fill={color} opacity={0.1} />}
        {n > 1 && <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {activo != null && <line x1={x(activo)} x2={x(activo)} y1={ARRIBA} y2={y(0)} stroke="var(--tx3)" strokeWidth={1} />}
        {/* Punto final (o el activo) con anillo de superficie */}
        {[activo ?? n - 1].map((i) => (
          <circle key={i} cx={x(i)} cy={y(valores[i] ?? 0)} r={5} fill={color} stroke={SUPERFICIE} strokeWidth={2} />
        ))}
      </svg>
      {activo != null && (
        <div role="status" style={{ position: "absolute", top: 0, left: Math.min(Math.max(0, x(activo) - 80), ancho - 170), width: 170, pointerEvents: "none", background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
          <div style={{ fontWeight: 600 }}>{etiquetas[activo]}</div>
          <div>{(formatoDetalle ?? formato)(valores[activo] ?? 0)}</div>
          {detalle?.(activo).map((l) => <div key={l} style={{ color: "var(--tx3)" }}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── Barra partida (dos partes de un total: fijo/variable, esencial/discrecional) ───

export function BarraPartida({ partes }: { partes: { nombre: string; valor: number; color: string; texto: string; href?: string }[] }) {
  const total = partes.reduce((t, p) => t + Math.max(0, p.valor), 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", gap: 2, height: 14, borderRadius: 4, overflow: "hidden", background: GRILLA }} role="img" aria-label={partes.map((p) => `${p.nombre} ${Math.round((p.valor / total) * 100)}%`).join(", ")}>
        {partes.map((p) => p.valor > 0 && <div key={p.nombre} style={{ width: `${(p.valor / total) * 100}%`, background: p.color }} />)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6, fontSize: 12 }}>
        {partes.map((p) => {
          const c = (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--tx2)" }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
              {p.nombre} <strong style={{ color: "var(--tx)" }}>{Math.round((p.valor / total) * 100)}%</strong>
              <span style={{ color: "var(--tx3)" }}>{p.texto}</span>
            </span>
          );
          return p.href ? <Link key={p.nombre} href={p.href} style={{ textDecoration: "none", minHeight: 32, display: "inline-flex" }}>{c}</Link> : <span key={p.nombre}>{c}</span>;
        })}
      </div>
    </div>
  );
}
