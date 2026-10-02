"use client";

export type CategoriaOpcion = { id: string; nombre: string; icono: string | null; tipo: string };

// Grilla de íconos, las más usadas primero (el orden ya viene del servidor) y la sugerida destacada.
export default function GrillaCategorias({
  categorias, tipo = "gasto", sugerida, onElegir, limite,
}: {
  categorias: CategoriaOpcion[];
  tipo?: string;
  sugerida?: string | null;
  onElegir: (id: string) => void;
  limite?: number;
}) {
  let lista = categorias.filter((c) => c.tipo === tipo);
  if (sugerida) lista = [...lista.filter((c) => c.id === sugerida), ...lista.filter((c) => c.id !== sugerida)];
  if (limite) lista = lista.slice(0, limite);
  return (
    <div className="fin-grilla-cats">
      {lista.map((c) => (
        <button key={c.id} type="button" className={`fin-cat ${c.id === sugerida ? "sugerida" : ""}`} onClick={() => onElegir(c.id)}>
          <span className="ico" aria-hidden>{c.icono}</span>
          {c.nombre}
        </button>
      ))}
    </div>
  );
}
