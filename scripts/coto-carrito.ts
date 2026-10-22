// Arma el carrito de Coto Digital con la lista habitual de /supermercado.
// Corre en GitHub Actions los miércoles (.github/workflows/coto-carrito.yml); NUNCA confirma la compra.
//
// 1. Trae la lista activa de la app (APP_URL/api/supermercado/items?activos=1)
// 2. Elige cada producto con el buscador de Coto (src/lib/supermercado/coto.ts)
// 3. Entra a coto.com.ar con tu usuario y suma cada producto al carrito (sin vaciarlo)
// 4. Reporta a la app, que guarda la corrida y avisa por Telegram
//
// Modos (env MODO):
//   carrito      (default) lo de arriba
//   solo_buscar  pasos 1, 2 y 4: muestra qué elegiría, sin abrir el navegador
//   diagnostico  entra, abre el primer producto y guarda sus botones/inputs en las capturas, para ajustar SELECTORES
//
// Uso local: APP_URL=… CRON_SECRET=… COTO_USUARIO=… COTO_PASSWORD=… npx tsx scripts/coto-carrito.ts

import fs from "node:fs";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright-core";
import { COTO_SITE, elegirProducto, type ItemLista } from "../src/lib/supermercado/coto";
import type { DetalleCorrida } from "../src/lib/supermercado/corrida";

const MODO = process.env.MODO || "carrito";
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET || "";
const USUARIO = process.env.COTO_USUARIO || "";
const PASSWORD = process.env.COTO_PASSWORD || "";
const CAPTURAS = process.env.CAPTURAS_DIR || "capturas";
const LOGIN_URL = process.env.COTO_LOGIN_URL || ""; // si la entrada por el botón "Ingresar" no funciona

// Todo lo que depende del HTML de coto.com.ar está acá, para ajustarlo fácil si cambian el sitio
const SELECTORES = {
  cerrarCarteles: /^(aceptar|entendido|cerrar|continuar|ok|×|x)$/i,
  entrarLogin: /ingres(á|a|ar)|iniciar sesi[oó]n|mi cuenta/i,
  usuario: 'input[type="email"], input[name*="mail" i], input[name*="user" i], input[id*="mail" i], input[id*="user" i], input[autocomplete="username"]',
  password: 'input[type="password"]',
  enviarLogin: /^(ingres(á|a|ar)|iniciar sesi[oó]n|continuar|entrar)$/i,
  logueado: /cerrar sesi[oó]n|mi cuenta|hola,?\s/i,
  agregar: /agregar( al carrito)?|comprar/i,
  sumar: /^(\+|sumar|aumentar|más|agregar uno)$/i,
  cantidad: 'input[type="number"], input[inputmode="numeric"], input[inputmode="decimal"], input[aria-label*="cantidad" i], input[name*="cant" i]',
};

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function app(ruta: string, init?: RequestInit) {
  const res = await fetch(`${APP_URL}${ruta}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}`, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${ruta} respondió ${res.status}`);
  return res.json();
}

async function reportar(detalle: DetalleCorrida[], error?: string) {
  const modo = MODO === "solo_buscar" ? "solo_buscar" : "carrito";
  log("Reporte:", JSON.stringify({ modo, error, detalle }, null, 2));
  if (!APP_URL) return;
  try {
    await app("/api/supermercado/corridas", { method: "POST", body: JSON.stringify({ modo, detalle, error }) });
  } catch (e) {
    log("No pude mandar el reporte a la app:", e);
  }
}

async function captura(page: Page, nombre: string) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const base = path.join(CAPTURAS, nombre.replace(/[^a-z0-9-]+/gi, "_").slice(0, 60));
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  fs.writeFileSync(`${base}.html`, await page.content().catch(() => ""));
}

async function visible(l: Locator, timeout = 0): Promise<Locator | null> {
  const fin = Date.now() + timeout;
  do {
    const n = await l.count().catch(() => 0);
    for (let i = 0; i < n; i++) if (await l.nth(i).isVisible().catch(() => false)) return l.nth(i);
    if (Date.now() < fin) await new Promise(r => setTimeout(r, 300));
  } while (Date.now() < fin);
  return null;
}

async function cerrarCarteles(page: Page) {
  for (let i = 0; i < 3; i++) {
    const b = await visible(page.getByRole("button", { name: SELECTORES.cerrarCarteles }));
    if (!b) return;
    await b.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function esperarCarga(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
}

async function login(page: Page) {
  if (!USUARIO || !PASSWORD) throw new Error("Faltan COTO_USUARIO / COTO_PASSWORD");
  await page.goto(LOGIN_URL || COTO_SITE);
  await esperarCarga(page);
  await cerrarCarteles(page);
  let pass = await visible(page.locator(SELECTORES.password));
  if (!pass && !LOGIN_URL && await visible(page.getByText(SELECTORES.logueado))) {
    log("Ya había sesión iniciada");
    return;
  }
  if (!pass) {
    const entrar = await visible(page.getByRole("button", { name: SELECTORES.entrarLogin }), 5000)
      || await visible(page.getByRole("link", { name: SELECTORES.entrarLogin }));
    if (!entrar) { await captura(page, "login-sin-boton"); throw new Error("No encontré el botón para ingresar a Coto"); }
    await entrar.click();
    await esperarCarga(page);
    pass = await visible(page.locator(SELECTORES.password), 15000);
  }
  // Algunos logins piden primero el mail y después la contraseña
  const usuario = await visible(page.locator(SELECTORES.usuario), 5000) || await visible(page.locator('input[type="text"]'));
  if (!usuario) { await captura(page, "login-sin-usuario"); throw new Error("No encontré el campo de usuario en el login de Coto"); }
  await usuario.fill(USUARIO);
  if (!pass) {
    await usuario.press("Enter");
    pass = await visible(page.locator(SELECTORES.password), 15000);
  }
  if (!pass) { await captura(page, "login-sin-password"); throw new Error("No encontré el campo de contraseña en el login de Coto"); }
  await pass.fill(PASSWORD);
  const enviar = await visible(page.getByRole("button", { name: SELECTORES.enviarLogin }));
  if (enviar) await enviar.click(); else await pass.press("Enter");
  await esperarCarga(page);
  if (await visible(page.locator(SELECTORES.password), 3000)) {
    await captura(page, "login-fallido");
    throw new Error("Coto no aceptó el usuario/contraseña (sigue mostrando el login)");
  }
  if (!page.url().startsWith(COTO_SITE)) await page.goto(COTO_SITE);
  await esperarCarga(page);
  await cerrarCarteles(page);
  log("Login OK", (await visible(page.getByText(SELECTORES.logueado))) ? "(veo la sesión)" : "(no veo el nombre, sigo igual)");
  await captura(page, "00-login");
}

// "1", "1,5", "500 g", "1 kg" → número en la unidad del ítem
function leerCantidad(txt: string, unidad: string): number | null {
  const m = txt.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|un)?/i);
  if (!m) return null;
  let n = Number(m[1]);
  if (unidad === "kg" && m[2] && /^gr?$/i.test(m[2])) n /= 1000;
  return n;
}

async function cantidadActual(page: Page, unidad: string): Promise<{ n: number | null; input: Locator | null }> {
  const input = await visible(page.locator(SELECTORES.cantidad));
  if (input) return { n: leerCantidad(await input.inputValue().catch(() => ""), unidad), input };
  return { n: null, input: null };
}

// Escribe la cantidad en el input si se deja (muchos son de solo lectura y se manejan con +/-)
async function escribir(input: Locator, cantidad: number, unidad: string, enter = false) {
  if (!(await input.isEditable().catch(() => false))) return;
  const enGramos = unidad === "kg" && /\d\s*gr?\b/i.test(await input.inputValue().catch(() => ""));
  await input.fill(String(enGramos ? Math.round(cantidad * 1000) : cantidad), { timeout: 3000 }).catch(() => {});
  if (enter) await input.press("Enter", { timeout: 3000 }).catch(() => {});
}

async function agregar(page: Page, url: string, cantidad: number, unidad: string): Promise<{ estado: "agregado" | "ya_estaba"; nota?: string }> {
  await page.goto(url);
  await esperarCarga(page);
  await cerrarCarteles(page);
  const boton = await visible(page.getByRole("button", { name: SELECTORES.agregar }), 8000);
  const previo = await cantidadActual(page, unidad);
  const yaEstaba = !boton && previo.n != null && previo.n > 0;
  if (yaEstaba && previo.n! >= cantidad) return { estado: "ya_estaba" };
  if (!boton && !yaEstaba) throw new Error("no encontré el botón Agregar (¿sin stock?)");

  // Algunos productos dejan elegir la cantidad antes de agregar
  if (boton && previo.input && cantidad !== 1) {
    await escribir(previo.input, cantidad, unidad);
  }
  if (boton) {
    await boton.click();
    await page.waitForTimeout(1500);
  }

  // Llevar la cantidad al objetivo: primero escribiéndola, si no con el "+"
  let actual = await cantidadActual(page, unidad);
  if (actual.input && (actual.n ?? 0) < cantidad) {
    await escribir(actual.input, cantidad, unidad, true);
    await page.waitForTimeout(1200);
    actual = await cantidadActual(page, unidad);
  }
  // Si no se ve un número, en unidades se asume 1 recién agregado y se cuentan los "+"; en kg no se adivina el paso
  let final = actual.n ?? (unidad === "un" ? 1 : null);
  for (let clicks = 0; final != null && final < cantidad - 0.001 && clicks < 40; clicks++) {
    const mas = await visible(page.getByRole("button", { name: SELECTORES.sumar })) || await visible(page.locator('button:has-text("+")'));
    if (!mas) break;
    await mas.click();
    await page.waitForTimeout(700);
    actual = await cantidadActual(page, unidad);
    final = actual.n ?? (unidad === "un" ? final + 1 : null);
  }
  if (final == null) return { estado: "agregado", nota: "no pude leer la cantidad, revisala" };
  if (Math.abs(final - cantidad) > 0.01) return { estado: "agregado", nota: `quedó en ${final}${unidad === "kg" ? " kg" : ""} en vez de ${cantidad}, revisalo` };
  return { estado: yaEstaba ? "ya_estaba" : "agregado" };
}

async function diagnostico(page: Page, url: string) {
  await page.goto(url);
  await esperarCarga(page);
  await captura(page, "diagnostico-producto");
  const controles = await page.$$eval("button, a[role=button], input, select", els => els.map(e => ({
    tag: e.tagName, texto: (e.textContent || "").trim().slice(0, 60), aria: e.getAttribute("aria-label"),
    tipo: e.getAttribute("type"), nombre: e.getAttribute("name"), clase: (e.getAttribute("class") || "").slice(0, 80),
  })).filter(c => c.texto || c.aria || c.tag !== "BUTTON"));
  // Va al .7z cifrado y no al log, que en un repo público lo ve cualquiera
  fs.writeFileSync(path.join(CAPTURAS, "diagnostico-controles.json"), JSON.stringify(controles, null, 1));
  log(`Diagnóstico: ${controles.length} controles guardados en ${CAPTURAS}/diagnostico-controles.json`);
}

async function main() {
  if (!APP_URL) throw new Error("Falta APP_URL");
  const items: ItemLista[] = await app("/api/supermercado/items?activos=1");
  log(`Lista: ${items.length} productos`);
  const detalle: DetalleCorrida[] = [];
  const elegidos: { item: ItemLista; d: DetalleCorrida }[] = [];

  for (const item of items) {
    const base = { itemId: item.id, nombre: item.nombre, cantidad: item.cantidad, unidad: item.unidad, opcional: item.opcional };
    try {
      const e = await elegirProducto(item);
      if (!e.producto) { detalle.push({ ...base, estado: item.opcional ? "omitido" : "sin_resultados" }); continue; }
      const d: DetalleCorrida = { ...base, estado: "elegido", producto: e.producto.nombre, url: e.producto.url, precio: e.producto.precio, motivo: e.motivo };
      detalle.push(d);
      elegidos.push({ item, d });
      log(`${item.nombre} → ${e.producto.nombre} (${e.motivo}${e.busqueda ? `: "${e.busqueda}"` : ""}) ${e.producto.precio ?? ""}`);
    } catch (err) {
      detalle.push({ ...base, estado: "error", nota: `búsqueda: ${(err as Error).message}` });
    }
  }
  if (MODO === "solo_buscar") return reportar(detalle);

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== "0", executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ locale: "es-AR", viewport: { width: 1280, height: 900 } });
  try {
    await login(page);
    if (MODO === "diagnostico") {
      if (elegidos[0]) await diagnostico(page, elegidos[0].d.url!);
      return;
    }
    for (let i = 0; i < elegidos.length; i++) {
      const { item, d } = elegidos[i];
      try {
        const r = await agregar(page, d.url!, item.cantidad, item.unidad);
        d.estado = r.estado;
        if (r.nota) d.nota = r.nota;
        log(`✔ ${item.nombre}: ${r.estado}${r.nota ? ` (${r.nota})` : ""}`);
      } catch (err) {
        d.estado = "error";
        d.nota = (err as Error).message;
        log(`✘ ${item.nombre}: ${d.nota}`);
      }
      await captura(page, `${String(i + 1).padStart(2, "0")}-${item.nombre}`);
    }
    await reportar(detalle);
  } catch (err) {
    await captura(page, "error");
    await reportar(detalle.filter(d => d.estado !== "elegido"), (err as Error).message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch(async err => {
  console.error(err);
  await reportar([], (err as Error).message);
  process.exitCode = 1;
});
