# Módulo Supermercado — compra semanal en Coto Digital

## Qué hace
Los miércoles a las 8:07 (Argentina) un workflow de GitHub Actions entra a coto.com.ar con la cuenta del usuario
y **suma** al carrito los productos activos de la lista de `/supermercado`. **Nunca confirma la compra**: el usuario
revisa el carrito en la app de Coto y paga. Al terminar se manda un resumen por Telegram (qué se agregó, qué falta,
total aproximado).

## Decisiones
- **Coto no tiene API pública.** El sitio nuevo (coto.com.ar, Angular) busca con Constructor.io usando una key pública
  (`ac.cnstrc.com/search`, cliente `cio-fe-web-coto`, filtro por sucursal). Se usa esa API para **elegir** productos,
  desde la app (botón "Probar") y desde el script. El **carrito** se arma con Playwright manejando el sitio, porque los
  endpoints del carrito no son públicos.
- **Dónde corre:** GitHub Actions y no Vercel, porque un navegador completo no entra en los límites de las funciones
  serverless. El script lee la lista y reporta a la app por HTTP (`Bearer CRON_SECRET`), así que Actions no necesita
  la base.
- **Sumar, no vaciar:** el carrito no se vacía. Si un producto ya está con la cantidad pedida o más, se deja como está
  (`ya_estaba`), así correrlo dos veces no duplica.
- **Elección de producto** (`src/lib/supermercado/coto.ts` → `elegirProducto`):
  - con producto **fijado** (`cotoUrl`) se usa directo;
  - `criterio = "primero"`: el primer resultado de la primera búsqueda que devuelva algo (las búsquedas son alternativas
    en orden, ej. "pan doble integral mi mago" y después "… noly");
  - `criterio = "mas_barato"`: el primer resultado de cada búsqueda, y se queda con el más barato (ej. leche proteica
    La Serenísima vs. Tres Niñas). Ignora el fijado.
  - `opcional`: si no aparece, no cuenta como faltante (ej. pan de masa madre "si hay").
  - Desde la última corrida se puede **📌 Fijar** el producto que eligió la búsqueda, para usar siempre ese.
- **Precio:** `listPrice` de la sucursal, o el `discountPrice` de la promo vigente. Ojo: `formatPrice` es el precio por
  kilo o litro, no el del producto.
- **Cantidades:** se escribe en el input si es editable; si no, se aprieta "+" hasta llegar. En kg se lee el valor que
  muestra el sitio (acepta "500 g", "1,5 kg"). Si no se puede leer, el ítem queda con la nota "revisá la cantidad".
- **Repo público:** las capturas de cada paso (muestran nombre, dirección y carrito) se suben a los artifacts **solo**
  cifradas en `.7z` con `CAPTURAS_CLAVE`. El diagnóstico va adentro del .7z, no al log.

## Puesta en marcha
1. Deploy (la migración `20261022000000_modulo_supermercado` crea `super_items` y `super_corridas`).
2. En `/supermercado` → "Cargar mi lista habitual" (`src/lib/supermercado/lista-inicial.ts`) y ajustar.
3. Secrets del repo en GitHub (Settings → Secrets and variables → Actions): `APP_URL`, `CRON_SECRET` (el mismo de
   Vercel), `COTO_USUARIO`, `COTO_PASSWORD` y, si se quieren capturas, `CAPTURAS_CLAVE`. Variable opcional
   `COTO_SUCURSAL_ID` (default 200).
4. Actions → "Carrito de Coto" → Run workflow:
   - `solo_buscar`: muestra por Telegram qué elegiría, sin abrir el navegador;
   - `diagnostico`: entra, abre el primer producto y guarda todos sus botones e inputs en las capturas;
   - `carrito`: la corrida real (lo mismo que el cron de los miércoles).

## Si Coto cambia el sitio
Lo que depende del HTML está en `SELECTORES`, arriba de `scripts/coto-carrito.ts`. Con una corrida `diagnostico` y las
capturas se ve qué cambió. Si el botón "Ingresar" no lleva al login, se puede definir `COTO_LOGIN_URL` en el workflow.

## Pendiente
- Importar la lista desde el Excel del usuario.
- Agregar productos sueltos para "este miércoles" desde el bot de Telegram.
- Registrar el gasto en Finanzas cuando se confirma la compra.
