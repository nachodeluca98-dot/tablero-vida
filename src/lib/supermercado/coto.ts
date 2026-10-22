// Búsqueda de productos en Coto Digital (coto.com.ar).
// El sitio usa Constructor.io como buscador: la "lupa" llama a esta misma API con una key pública.
// Lo usa tanto la app (probar búsquedas) como el script que arma el carrito (scripts/coto-carrito.ts),
// por eso no importa nada de "@/…".

export const COTO_SITE = process.env.COTO_SITE_URL || "https://www.coto.com.ar";
const API = process.env.COTO_SEARCH_API || "https://ac.cnstrc.com/search";
const API_KEY = process.env.COTO_CONSTRUCTOR_KEY || "key_r6xzz4IAoTWcipni";
const CLIENT_ID = "cio-fe-web-coto";
export const COTO_SUCURSAL = process.env.COTO_SUCURSAL_ID || "200";

export type ProductoCoto = {
  nombre: string;
  url: string;
  precio: number | null; // precio de góndola, con la promo vigente si la hay
  promo: string | null;
  imagen: string | null;
};

export type ItemLista = {
  id: string;
  nombre: string;
  busquedas: string[];
  criterio: string; // "primero" | "mas_barato"
  cantidad: number;
  unidad: string; // "un" | "kg"
  opcional: boolean;
  cotoUrl: string | null;
  cotoNombre: string | null;
};

export type Eleccion = {
  producto: ProductoCoto | null;
  motivo: "fijado" | "busqueda" | "mas_barato" | "sin_resultados";
  busqueda?: string;
};

function slug(s: string) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// `formatPrice` es el precio por unidad de medida (kilo, litro…), no el del producto:
// el de góndola es `listPrice` de la sucursal, o el `discountPrice` de la promo vigente.
function precio(data: any): number | null {
  const precios: any[] = data.price || [];
  const mio = precios.find(p => String(p.store) === COTO_SUCURSAL) || precios[0];
  const lista = Number(mio?.listPrice ?? data.product_list_price);
  if (!lista) return null;
  let mejor = lista;
  for (const d of data.discounts || []) {
    const m = String(d.discountPrice ?? "").replace(/,/g, "").match(/[\d.]+/);
    const promo = m ? Number(m[0]) : NaN;
    if (promo >= 0.2 * lista && promo < mejor) mejor = promo; // descarta valores absurdos
  }
  return mejor;
}

function aProducto(r: any): ProductoCoto | null {
  const data = r.data || {};
  const nombre = String(r.value || data.sku_display_name || "").replace(/\s+/g, " ").trim();
  const disp: string[] | undefined = data.store_availability;
  if (!nombre || (disp && !disp.map(String).includes(COTO_SUCURSAL))) return null;
  const pdp = String(data.url || "").replace("format=json", "").replace(/[?&]$/, "");
  if (!pdp) return null;
  const d = (data.discounts || []).find((x: any) => x.discountText || x.takingText);
  return {
    nombre,
    url: `${COTO_SITE}/productos/${slug(nombre)}/${pdp.replace(/^\//, "")}`,
    precio: precio(data),
    promo: d ? String(d.discountText || d.takingText).trim() : null,
    imagen: data.product_large_image_url || data.image_url || null,
  };
}

export async function buscarCoto(q: string, limite = 5): Promise<ProductoCoto[]> {
  const params = new URLSearchParams({
    key: API_KEY,
    c: CLIENT_ID,
    section: "Products",
    num_results_per_page: String(Math.max(limite * 2, 6)),
    "filters[store_availability]": COTO_SUCURSAL,
  });
  const res = await fetch(`${API}/${encodeURIComponent(q.trim())}?${params}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Buscador de Coto respondió ${res.status}`);
  const json: any = await res.json();
  const resultados: any[] = json?.response?.results || [];
  return resultados.map(aProducto).filter((p): p is ProductoCoto => !!p).slice(0, limite);
}

// Decide qué producto de Coto corresponde a un ítem de la lista
export async function elegirProducto(item: ItemLista, buscar = buscarCoto): Promise<Eleccion> {
  if (item.criterio !== "mas_barato" && item.cotoUrl) {
    return { producto: { nombre: item.cotoNombre || item.nombre, url: item.cotoUrl, precio: null, promo: null, imagen: null }, motivo: "fijado" };
  }
  const busquedas = item.busquedas.length ? item.busquedas : [item.nombre];
  if (item.criterio === "mas_barato") {
    const primeros: { p: ProductoCoto; q: string }[] = [];
    for (const q of busquedas) {
      const [p] = await buscar(q, 1);
      if (p) primeros.push({ p, q });
    }
    if (!primeros.length) return { producto: null, motivo: "sin_resultados" };
    const conPrecio = primeros.filter(x => x.p.precio != null);
    const mejor = (conPrecio.length ? conPrecio : primeros).sort((a, b) => (a.p.precio ?? 0) - (b.p.precio ?? 0))[0];
    return { producto: mejor.p, motivo: "mas_barato", busqueda: mejor.q };
  }
  for (const q of busquedas) {
    const [p] = await buscar(q, 1);
    if (p) return { producto: p, motivo: "busqueda", busqueda: q };
  }
  return { producto: null, motivo: "sin_resultados" };
}
