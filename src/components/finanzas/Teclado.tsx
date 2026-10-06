"use client";
// Teclado numérico propio para montos (spec §13): grande, separador de miles en vivo y atajos +1.000 / +10.000.
// El valor es texto con coma decimal opcional ("180000", "25,5").

export function montoDeTexto(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return isFinite(n) && n > 0 ? n : null;
}

export function textoDeMonto(n: number | null | undefined): string {
  if (n == null) return "";
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

export function formatearTexto(v: string): string {
  if (!v) return "";
  const [ent, dec] = v.split(",");
  const conMiles = (ent || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec !== undefined ? `${conMiles},${dec}` : conMiles;
}

function vibrar() {
  try { navigator.vibrate?.(8); } catch {}
}

export default function Teclado({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  function tecla(k: string) {
    vibrar();
    if (k === "⌫") return onChange(valor.slice(0, -1));
    if (k === ",") return valor.includes(",") ? undefined : onChange((valor || "0") + ",");
    const [ent, dec] = valor.split(",");
    if (dec !== undefined && dec.length >= 2) return;
    if (dec === undefined && ent.length >= 12) return;
    onChange(valor === "0" ? k : valor + k);
  }
  function sumar(n: number) {
    vibrar();
    onChange(textoDeMonto((montoDeTexto(valor) ?? 0) + n));
  }
  return (
    <div className="fin-teclado" role="group" aria-label="Teclado numérico">
      <button type="button" className="atajo" onClick={() => sumar(1000)}>+1.000</button>
      <button type="button" className="atajo" onClick={() => sumar(10000)}>+10.000</button>
      <button type="button" className="atajo" onClick={() => sumar(100000)}>+100.000</button>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"].map((k) => (
        <button key={k} type="button" onClick={() => tecla(k)} aria-label={k === "⌫" ? "Borrar" : k === "," ? "Coma decimal" : k}>
          {k}
        </button>
      ))}
    </div>
  );
}
