# Módulo de Finanzas Personales — Especificación v1

> Documento de contexto y especificación para Claude Code.
> Concentra la discusión de producto y las decisiones de diseño tomadas.
> Ubicación sugerida en el repo: `docs/modulo-finanzas.md`
> Referenciarlo desde `CLAUDE.md` junto a `docs/modulo-vehiculos.md`.

---

## 1. Contexto

Segundo módulo del **Tablero de Vida**, después de Vehículos. Misma lógica de producto:
nace de un dolor propio (llevar las finanzas da pereza, pero es importantísimo), se valida
usándolo uno mismo durante 2–3 meses y recién después se piensa en otros usuarios.

**Canales:**
- **La app (PWA) es el único lugar de uso.** Toda carga, revisión, edición y análisis
  pasa por la app. Nada se opera por comandos.
- **Telegram es solo para avisos.** Cada aviso trae un botón que abre la app directo en la
  pantalla correspondiente (deep link). No se carga ni se responde nada desde Telegram.

**Reutiliza del módulo de vehículos:** servicio de transcripción de voz, parser con IA,
scheduler de recordatorios, channel adapter de Telegram y la base de la PWA.

**Objetivo de la v1:** que llevar las finanzas sea **sistémico y de bajísima fricción**:
un presupuesto mensual que se arma solo a partir del mes anterior, una revisión quincenal
de menos de 5 minutos, carga por voz dentro de la app, guías de adopción en pantalla, y un
dashboard con estadísticas y resumen con IA.

---

## 2. Principios

### 2.1 Buenas prácticas de finanzas personales adoptadas

1. **Presupuesto antes que registro contable.** Cada mes arranca con un plan por
   categoría; lo real se compara contra ese plan (presupuesto base cero / YNAB).
2. **Ahorro primero.** El ahorro se asigna al abrir el mes, no es lo que sobra.
3. **Gastos verdaderos prorrateados.** Gastos anuales o infrecuentes (seguro, patente,
   suscripciones anuales, VTV) se prevén como monto mensual.
4. **Presupuesto flexible.** Si una categoría se pasa, se reasigna desde otra.
5. **Contexto argentino.** Tarjeta imputada al mes de pago del resumen, cuotas como
   compromiso futuro visible, ajuste por inflación al clonar el mes, doble moneda nativa.
6. **Indicador principal: tasa de ahorro.**

### 2.2 Principios de UX (aplican a todas las pantallas)

1. **Cero comandos, cero memoria.** La app siempre muestra cuál es el próximo paso.
   El usuario nunca tiene que recordar qué hacer ni cómo.
2. **Pocos toques.** Meta: cargar un gasto en **≤ 3 toques** o un dictado + 1 toque.
3. **Prellenar todo lo posible.** Mes anterior, último tipo de cambio, última tarjeta,
   categoría más probable, saldos anteriores. El usuario confirma; no tipea.
4. **Nunca bloquear.** Categoría, fecha y medio de pago son opcionales al cargar. Lo
   incompleto va a una bandeja para completar después.
5. **Deshacer en lugar de confirmar.** Las acciones destructivas o rápidas no piden
   "¿Estás seguro?": se ejecutan y muestran un aviso con `Deshacer` por unos segundos.
6. **Edición en el lugar.** Tocar un monto, una categoría o una fecha la edita ahí mismo,
   sin navegar a un formulario aparte.
7. **Gestos con alternativa visible.** Todo gesto (deslizar, mantener) tiene también un
   botón visible. Los gestos son atajos, nunca la única forma.
8. **Tono amable y sin culpa.** Nada de rojos alarmantes ni mensajes de reproche. Pasarse
   de una categoría se comunica como información con una salida ("Podés cubrirlo desde X").
9. **Mobile first, con pulgar.** Acciones principales abajo, al alcance del pulgar.
   Objetivos táctiles de al menos 44 px.
10. **Celebrar el avance.** Completar una revisión, cerrar un mes o llegar a un hito de
    una meta tiene una devolución breve y positiva.

---

## 3. Conceptos clave

### 3.1 Presupuesto vs. Registro

- **Ítem de presupuesto** (`fin_presupuesto_items`): lo que *debería* pasar en el mes.
  Ej.: "Luz — $X", "Súper — $Y", "Ahorro — USD Z". Se clonan del mes anterior.
- **Registro** (`fin_registros`): lo que *efectivamente* pasó. Es la unidad base.

Un registro puede vincularse a un ítem de presupuesto ("pagué la luz" confirma el ítem
"Luz") o existir suelto. Varios registros pueden vincularse al mismo ítem (varias compras
de súper contra el ítem "Súper").

### 3.2 El registro puede ser individual o agrupado

A nivel base de datos **todo registro es individual**, pero puede representar un gasto
suelto ("nafta 40 lucas") o uno agrupado ("súper de la quincena 180 lucas"). El campo
**`incluye`** (texto libre, opcional) aclara qué engloba ("Coto + verdulería + piedras de
los gatos"). La categoría es opcional al cargar y se puede asignar o cambiar después.

### 3.3 Mes de imputación

- Efectivo, débito, transferencia, billetera virtual → mes de la fecha del gasto.
- **Tarjeta de crédito → mes en que se paga el resumen**, calculado con el día de cierre
  de la tarjeta (`fin_tarjetas.dia_cierre`):
  - consumo con fecha ≤ día de cierre → se paga el mes siguiente;
  - consumo con fecha > día de cierre → se paga dentro de dos meses.
- La app muestra el mes calculado en la tarjeta del registro ("Se paga en noviembre") y se
  puede cambiar con un toque.

### 3.4 Cuotas

Una compra en N cuotas crea un **plan de cuotas** (`fin_planes_cuotas`) que genera un ítem
de presupuesto fijo en cada mes futuro afectado (`origen = 'cuotas'`). Al pagarse el
resumen, cada cuota se confirma como registro real.

**Deuda en cuotas comprometida** = suma de cuotas futuras aún no pagadas.

### 3.5 Doble moneda

- Cada registro, ítem, aporte y snapshot guarda `monto_original`, `moneda_original`
  (`ARS` | `USD`) **y siempre ambos equivalentes**: `monto_ars` y `monto_usd`.
- Cada mes tiene un **tipo de cambio** (`fin_meses.tipo_cambio`, ARS por 1 USD) que carga
  el usuario y puede editar en cualquier momento. Campo `fuente_tc` libre (MEP, oficial,
  el de su cobro).
- Un registro puede tener **tipo de cambio propio** (`tc_propio`) para cuando se convirtió
  plata a un valor concreto. Ese registro no se recalcula.
- **Al editar el TC del mes** se recalculan los equivalentes de ese mes que no tengan
  `tc_propio`.
- Los ingresos funcionan igual (un cobro en USD entra nativo en USD).
- **Visualización:** todo monto se muestra en **dos columnas: ARS | USD**, sin toggle.
  En pantallas angostas, ambas columnas van en la misma fila, alineadas a la derecha, con
  la moneda original resaltada y la convertida en un tono secundario.

---

## 4. Modelo de datos

Convenciones: todas las tablas llevan `id` (uuid), `user_id`, `created_at`, `updated_at`.
Montos en `numeric(14,2)`. Tipo de cambio en `numeric(12,4)`. Prefijo `fin_`.

### `fin_categorias`
| campo | tipo | notas |
|---|---|---|
| nombre | text | |
| tipo | enum | `gasto` \| `ingreso` \| `ahorro` |
| fijo_variable_default | enum | `fijo` \| `variable` |
| naturaleza_default | enum | `esencial` \| `discrecional` |
| icono | text | emoji |
| color | text | token de color |
| orden | int | |
| activa | bool | |

Categorías iniciales sugeridas (editables):
- **Gastos:** Vivienda, Servicios, Súper y almacén, Mascotas, Auto, Transporte, Salud,
  Suscripciones, Salidas y delivery, Ropa y cuidado personal, Educación, Trabajo y
  herramientas, Regalos, Varios.
- **Ingresos:** Honorarios/sueldo, Otros ingresos.
- **Ahorro:** Ahorro (vinculable a metas).

### `fin_meses`
| campo | tipo | notas |
|---|---|---|
| anio_mes | char(7) | `2026-10`, único por usuario |
| tipo_cambio | numeric | ARS por 1 USD; nullable hasta que se cargue |
| fuente_tc | text | libre |
| ajuste_inflacion_pct | numeric | % aplicado al clonar; nullable |
| estado | enum | `abierto` \| `cerrado` |
| cerrado_at | timestamptz | |

### `fin_presupuesto_items`
| campo | tipo | notas |
|---|---|---|
| mes_id | fk | |
| categoria_id | fk | |
| concepto | text | "Luz", "Súper", "Seguro auto" |
| incluye | text | nullable |
| monto_original / moneda_original | | |
| monto_ars / monto_usd | | equivalentes |
| frecuencia | enum | `mensual` \| `bimestral` \| `trimestral` \| `anual` |
| monto_previsto_mensual | numeric | prorrateo para frecuencias no mensuales |
| recurrente | bool | se clona al mes siguiente |
| fijo_variable | enum | |
| naturaleza | enum | `esencial` \| `discrecional` |
| dia_vencimiento | int | nullable, para avisos |
| medio_pago | enum | ver registros |
| tarjeta_id | fk | nullable |
| origen | enum | `manual` \| `clon` \| `cuotas` \| `modulo_vehiculos` \| `onboarding` |
| item_origen_id | fk | ítem del mes anterior del que se clonó |
| plan_cuotas_id | fk | nullable |
| activo | bool | `false` = quitado este mes |

### `fin_registros` (unidad base)
| campo | tipo | notas |
|---|---|---|
| mes_id | fk | mes de imputación |
| fecha | date | fecha real; default = día de carga |
| tipo | enum | `gasto` \| `ingreso` \| `ahorro` |
| categoria_id | fk | **nullable** = sin clasificar |
| presupuesto_item_id | fk | nullable |
| descripcion | text | |
| incluye | text | nullable |
| monto_original / moneda_original | | |
| monto_ars / monto_usd | | equivalentes |
| tc_propio | numeric | nullable |
| es_aproximado | bool | "unos 180" |
| fijo_variable | enum | hereda del ítem o categoría |
| naturaleza | enum | hereda del ítem o categoría |
| medio_pago | enum | `efectivo` \| `debito` \| `transferencia` \| `billetera` \| `tarjeta_credito` |
| tarjeta_id | fk | nullable |
| plan_cuotas_id / cuota_numero | | nullable |
| compartido | bool | check interno |
| nota_compartido | text | aclaración libre. Sin cálculo de split en v1 |
| meta_id | fk | nullable; para registros de tipo `ahorro` |
| origen | enum | `app_voz` \| `app_rapida` \| `app_formulario` \| `revision` \| `cuotas` \| `modulo_vehiculos` |
| origen_ref_id | uuid | id en el módulo de origen (deduplicación) |
| transcripcion | text | texto dictado original, si vino por voz |

### `fin_tarjetas`
nombre, dia_cierre, dia_vencimiento, moneda_principal, es_default, activa.

### `fin_planes_cuotas`
descripcion, categoria_id, tarjeta_id, monto_cuota, moneda, cuotas_total,
mes_primera_cuota (char(7)), registro_origen_id.

### `fin_metas`
| campo | tipo | notas |
|---|---|---|
| nombre | text | |
| tipo | enum | `fondo_emergencia` \| `meta` |
| icono | text | emoji |
| monto_objetivo / moneda | | para `meta` |
| meses_cobertura | int | para `fondo_emergencia` (default 6, rango sugerido 3–6) |
| fecha_objetivo | date | nullable |
| activa | bool | |

**Fondo de emergencia:** objetivo dinámico = `meses_cobertura × promedio mensual de gastos
esenciales de los últimos 3 meses cerrados`. Indicador: **meses cubiertos** = saldo
acumulado / ese promedio.

### `fin_aportes_meta`
meta_id, mes_id, registro_id (nullable), monto_original, moneda_original, monto_ars,
monto_usd. Permite ver **cuánto se aportó en cada mes**. Admite negativos (retiros).

### `fin_cuentas`
nombre, tipo (`banco` \| `billetera` \| `efectivo` \| `broker` \| `cripto` \| `otro`),
moneda, icono, activa, orden.

### `fin_patrimonio_snapshots`
mes_id, cuenta_id, saldo_original, moneda_original, saldo_ars, saldo_usd.

### `fin_revisiones`
fecha, tipo (`apertura` \| `quincenal` \| `cierre`), modo (`completo` \| `expres`),
estado (`pendiente` \| `en_curso` \| `completa` \| `salteada`), paso_actual,
duracion_seg. Permite **retomar una revisión donde se dejó** y medir adopción.

### `fin_resumenes_ia`
periodo_desde, periodo_hasta, contenido (markdown), metricas_input (jsonb), generado_at,
desactualizado (bool; se marca si cambian registros del período).

### `fin_guias_estado` (adopción)
guia_id (text, del catálogo en código), estado (`pendiente` \| `vista` \| `completada` \|
`descartada`), vista_at, veces_mostrada. Ver sección 7.

### `fin_preferencias`
dias_revision (default 15 y último día), ajuste_inflacion_default, tarjeta_default_id,
mostrar_guias (bool), avisos_telegram (bool por tipo).

---

## 5. Estructura de la app

### 5.1 Navegación

Barra inferior con 4 secciones y un botón central de carga:

| Inicio | Movimientos | **＋ Cargar** | Estadísticas | Más |
|---|---|---|---|---|

- **＋ Cargar** está siempre visible, en todas las pantallas del módulo.
- **Más** agrupa: Presupuesto del mes, Metas, Patrimonio, Configuración, Guías.

### 5.2 Inicio: "qué tengo que hacer y cómo voy"

De arriba hacia abajo:

1. **Tarjeta "Tu próximo paso"** (una sola, la más importante). Prioridad:
   1. Revisión pendiente (quincenal, cierre o apertura) → `Empezar` / `Retomar`.
   2. Tipo de cambio del mes sin cargar → campo inline para cargarlo ahí mismo.
   3. Movimientos sin clasificar → `Clasificar (N)`.
   4. Guía contextual sugerida (ver sección 7).
   5. Si no hay nada pendiente: mensaje positivo ("Todo al día") y la próxima fecha de
      revisión.
2. **Resumen del mes:** ingresos, gastos, ahorro, saldo libre, tasa de ahorro (ARS | USD).
   Barra de avance del mes: cuánto del presupuesto se usó vs. cuánto del mes pasó.
3. **Categorías del mes:** las 5 con más movimiento, con barra presupuesto vs. real.
   `Ver todas` lleva a Presupuesto del mes.
4. **Metas:** mini tarjetas con progreso; el fondo de emergencia muestra meses cubiertos.
5. **Últimos movimientos** (5), con `Ver todos`.

Tocar cualquier número o barra lleva al detalle filtrado correspondiente.

---

## 6. Journeys del usuario

Para cada journey: objetivo, pasos y meta de eficiencia.

### 6.1 Primer uso (onboarding)

**Objetivo:** tener el primer presupuesto armado y ver valor en ≤ 5 minutos.
**Formato:** asistente a pantalla completa, de a un paso, con barra de progreso, `Saltear`
en todo paso no esencial y retomable si se cierra.

1. **Bienvenida:** una pantalla, qué hace el módulo en 3 frases y `Empezar`.
2. **Moneda e ingreso:** "¿En qué moneda cobrás?" (chips ARS / USD / ambas) y monto
   aproximado del ingreso mensual (teclado numérico grande). Se puede saltear.
3. **Tipo de cambio:** un campo, con texto de ayuda breve ("Usá el que te sirva de
   referencia: MEP, oficial o el de tu cobro. Lo podés cambiar cuando quieras").
4. **Gastos fijos desde plantilla:** grilla de chips con recurrentes comunes (alquiler,
   expensas, luz, gas, agua, internet, celular, prepaga, streaming, gimnasio, seguro auto,
   patente, alimento mascotas…). Se tocan los que aplican y después se completa el monto de
   cada uno en una lista con teclado numérico que salta al siguiente al confirmar.
   `Agregar otro` al final.
5. **Variables estimados:** las categorías variables más comunes (súper, salidas,
   transporte, mascotas) con un monto mensual estimado. Se puede saltear; se aprende con el
   uso.
6. **Ahorro primero:** "¿Cuánto querés separar por mes?" con sugerencia calculada (saldo
   libre estimado) y opción de crear el fondo de emergencia con un toque.
7. **Tarjetas (opcional):** nombre y día de cierre. Explicación de una línea de por qué se
   pide.
8. **Listo:** muestra el presupuesto armado, con una animación breve, y lleva a Inicio con
   la primera guía activa (cómo cargar un gasto).

Cuentas para patrimonio y metas adicionales **no se piden en el onboarding**: se proponen
más adelante con guías contextuales (sección 7).

### 6.2 Cargar un gasto (el journey más frecuente)

**Meta:** dictado + 1 toque, o ≤ 3 toques sin voz.

Al tocar **＋ Cargar** se abre una hoja inferior con tres opciones:

- **🎙 Dictar** (botón grande, principal).
- **⌨️ Rápido** (teclado numérico).
- **Atajos:** los 4 conceptos más usados del mes ("Súper", "Nafta"…) para cargar con un
  toque + monto.

**Por voz:**
1. Tocar el micrófono una vez para empezar y otra para terminar (no hace falta mantener
   apretado). Se muestra la onda de audio y un texto de ejemplo ("Ej.: súper 180 lucas,
   delivery 25 con la visa").
2. Se transcribe y parsea. Se muestran los registros entendidos como **tarjetas
   editables**: monto (con ARS | USD), descripción, y **chips** para categoría, medio de
   pago, mes de imputación, aproximado, compartido e incluye.
3. Tocar un chip abre un selector compacto en el lugar (no una pantalla nueva).
   Categorías en grilla de íconos, con las más usadas primero.
4. Para corregir, se puede **volver a dictar** sobre la lista ("el segundo eran 50 y va en
   delivery") o editar tocando.
5. Deslizar una tarjeta (o botón 🗑) la quita, con `Deshacer`.
6. `Guardar todo` (un toque). Aviso breve: "3 movimientos guardados · Deshacer".

**Rápido sin voz:**
1. Teclado numérico grande ya abierto con el foco en el monto. Chip ARS / USD al lado.
2. Grilla de categorías debajo (las más usadas arriba). Tocar una categoría **guarda**.
3. Lo demás (descripción, medio, fecha, incluye) se puede agregar opcionalmente desde
   `Más detalles` antes de guardar o tocando el movimiento después.

**Reglas al guardar:**
- Si coincide con un ítem del presupuesto, se vincula. Si es un fijo ya confirmado, se
  avisa posible duplicado con opciones `Es otro` / `Ya estaba`.
- Sin categoría → va a la bandeja "Sin clasificar". No se insiste.
- Medio tarjeta sin especificar → tarjeta default.
- Cuotas → crea el plan de cuotas y lo muestra en la tarjeta ("6 cuotas de $X, hasta
  abril").

### 6.3 Revisión quincenal

**Meta:** ≤ 5 minutos completa, ≤ 1 minuto en modo exprés.
**Entrada:** aviso de Telegram con botón `Abrir revisión` → deep link a la revisión, o la
tarjeta "Tu próximo paso" en Inicio.
**Formato:** asistente de 3 pasos con barra de progreso, retomable.

Al inicio: `Revisión completa` o `⚡ Exprés (solo fijos, 1 minuto)`.

1. **Fijos y cuotas pendientes:** lista tipo checklist de ítems fijos sin registro real.
   - Tocar el ítem = pagado con el monto previsto (se tilda con animación).
   - Tocar el monto = editarlo en el lugar.
   - Botón `No aplica` por ítem.
   - Atajo arriba: `Marcar todos como pagados`.
2. **Variables:** "¿Qué gastaste en estas semanas?" con el micrófono grande y el mismo
   flujo de tarjetas editables que en 6.2. Debajo, las categorías variables con lo
   cargado hasta ahora, para que el usuario vea qué le falta ("Salidas: $0 cargado").
   `No tengo más` avanza.
3. **Así vas:** resumen del mes vs. presupuesto, tasa de ahorro, y si hay categorías
   pasadas, una sugerencia de reasignación con un toque ("Cubrir $X desde Ropa").
   Cierre con devolución positiva y la fecha de la próxima revisión.

### 6.4 Cierre de mes y apertura del siguiente

**Meta:** ≤ 7 minutos para ambos, encadenados en un solo asistente.
**Entrada:** aviso del último día del mes → deep link, o "Tu próximo paso".

**Cierre:**
1. Fijos y cuotas pendientes (igual que 6.3 paso 1).
2. Última carga de variables (igual que 6.3 paso 2, saltable).
3. **Patrimonio:** una tarjeta por cuenta con el saldo anterior prellenado. Tocar = igual;
   tocar el monto = editar. `Todos igual` arriba. Si no hay cuentas, se ofrece crearlas
   (guía) o saltear.
4. **Aportes a metas:** prellenado con lo asignado en la apertura. Confirmar o ajustar.
5. **El mes en una mirada:** resumen con IA del mes (sección 9), tasa de ahorro, progreso
   de metas, con devolución positiva si hubo avance.

**Apertura del mes siguiente (continúa en el mismo asistente):**
1. **Tipo de cambio:** prellenado con el del mes anterior. `Mantener` o editar.
2. **Ajuste por inflación:** "¿Actualizamos los montos en pesos?" con un control de % y
   **vista previa** del impacto ("Tus fijos en pesos pasan de $X a $Y"). Opciones
   `Aplicar` / `No ajustar`.
3. **Revisar presupuesto:** lista de ítems clonados agrupados por categoría.
   - Deslizar a la derecha = mantener; a la izquierda = quitar (con botones visibles
     equivalentes).
   - Tocar el monto = editar en el lugar.
   - Cuotas del mes aparecen marcadas y no se pueden quitar (solo informativas).
   - Atajos: `Dejar todo como está` y `➕ Agregar ítem`.
4. **Ahorro primero:** monto a separar y a qué meta, prellenado con el mes anterior.
5. **Listo:** presupuesto del mes con saldo libre previsto.

Un mes cerrado se puede reabrir desde Presupuesto del mes.

### 6.5 Clasificar pendientes

**Entrada:** "Tu próximo paso" o el filtro en Movimientos.
Pantalla de a un movimiento, con monto y descripción grandes y la grilla de categorías
debajo (sugerida primero, destacada). Tocar una categoría la asigna y pasa al siguiente.
`Saltear` y `Listo` siempre visibles. Contador "3 de 8".

### 6.6 Movimientos

- Lista agrupada por día, con ícono de categoría, descripción, ARS | USD, y marcas
  discretas para aproximado, compartido y cuotas.
- **Buscador** arriba y **filtros como chips** horizontales: período, categoría, tipo,
  medio de pago, tarjeta, sin clasificar, aproximados, compartidos.
- Tocar un movimiento abre su detalle en hoja inferior, todo editable en el lugar:
  incluye, check de compartido + nota, mes de imputación, tipo de cambio propio,
  transcripción original.
- Deslizar = eliminar con `Deshacer`.

### 6.7 Presupuesto del mes

- Ítems agrupados por categoría, con previsto vs. real y barra de avance.
- Edición en el lugar de montos; agregar, quitar y mover monto entre categorías
  (`Reasignar`: elegir origen, destino y monto con un deslizador).
- Selector de mes arriba para ver meses anteriores.

### 6.8 Metas y fondo de emergencia

- Tarjeta por meta: progreso, monto aportado vs. objetivo, fecha estimada de llegada al
  ritmo actual.
- Detalle: **composición de aportes por mes** (barras) e historial.
- `Aportar` abre el teclado numérico con la meta preseleccionada.
- Fondo de emergencia: meses cubiertos de forma visual (ej.: 6 casilleros, se llenan),
  objetivo dinámico explicado en una línea.

### 6.9 Patrimonio

- Total en ARS | USD y su evolución mensual.
- Lista de cuentas con saldo del último cierre. Editable en el lugar.
- Se alimenta principalmente desde el cierre de mes (6.4).

---

## 7. Adopción: guías en pantalla

El sistema de guías reemplaza a cualquier manual. Tres formatos:

### 7.1 Formatos

1. **Marcas de primera vez:** un globo que señala un elemento la primera vez que se entra
   a una pantalla ("Tocá un monto para editarlo"). **Máximo uno por pantalla**, se cierra
   con un toque, no vuelve a aparecer.
2. **Estados vacíos que enseñan:** cuando una sección no tiene datos, en lugar de un
   espacio en blanco muestra qué va ahí, por qué sirve y un botón de acción
   ("Todavía no tenés metas. Una buena primera meta es un fondo de emergencia →
   `Crearlo`").
3. **Tarjetas de guía contextuales:** aparecen en "Tu próximo paso" cuando se cumple una
   condición. Cada una tiene una acción concreta y `Ahora no` / `No mostrar más`.

Además, en **Más → Guías** quedan todas las guías disponibles para releer, como tarjetas
cortas.

### 7.2 Catálogo inicial de guías contextuales

| guía | se muestra cuando | acción |
|---|---|---|
| Probá dictar | después del onboarding, si aún no usó la voz | abrir el micrófono |
| Cargá varios de una | usó la voz 2 veces con un solo gasto | ejemplo de dictado múltiple |
| Agrupar con "incluye" | cargó varios gastos chicos de la misma categoría el mismo día | explicar el campo |
| Tu primera revisión | primer día de revisión | abrir la revisión |
| Modo exprés | salteó una revisión | abrir revisión exprés |
| Fondo de emergencia | primer mes cerrado sin metas | crear el fondo |
| Seguí tu patrimonio | segundo mes cerrado sin cuentas | crear cuentas |
| Tarjetas y resúmenes | cargó un gasto con tarjeta sin tarjetas configuradas | configurar tarjeta |
| Gastos anuales | agrega un ítem tipo seguro, patente o suscripción anual | explicar prorrateo |
| Reasignar | una categoría superó el 100% | abrir reasignar |
| Mirá tus estadísticas | primer mes cerrado | abrir estadísticas |
| Tu racha | 3 revisiones seguidas completas | celebración |

Reglas: **una sola guía contextual visible a la vez**, como máximo una nueva por día,
nunca durante un asistente en curso. Si se descarta 2 veces, no vuelve. El usuario puede
apagar todas las guías desde Configuración.

### 7.3 Racha y hitos

- **Racha de revisiones:** cantidad de revisiones seguidas completas (las exprés cuentan).
  Se muestra discretamente en Inicio. Perder la racha no se comunica como fracaso.
- **Hitos:** primer mes cerrado, 3 meses seguidos, cada mes de fondo de emergencia
  cubierto, meta alcanzada. Devolución breve y positiva.

---

## 8. Avisos por Telegram

Telegram **solo avisa**. Cada mensaje es corto, con un botón que abre la app en la
pantalla exacta (deep link a la ruta de la PWA). No se procesa ninguna respuesta.

| aviso | disparador | botón → pantalla |
|---|---|---|
| Revisión quincenal | día 15 | `Abrir revisión` → 6.3 |
| Cierre de mes | último día del mes | `Cerrar el mes` → 6.4 |
| Recordatorio | revisión pendiente a las 24 h | `Retomar` → revisión en el paso donde quedó |
| Tipo de cambio | día 2 sin TC cargado | `Cargar TC` → Inicio |
| Categoría al 80% | real ≥ 80% del presupuesto | `Ver categoría` → presupuesto filtrado |
| Categoría superada | real ≥ 100% | `Reasignar` → 6.7 con la categoría preseleccionada |
| Vencimiento | 2 días antes del vencimiento de un fijo sin pagar | `Marcar pagado` → 6.3 paso 1 |
| Fin de cuotas | mes de la última cuota de un plan | `Ver cuotas` → estadísticas |
| Reenganche | 2 revisiones seguidas salteadas | `Revisión exprés` → 6.3 en modo exprés |

Reglas: máximo 2 avisos proactivos por día (se agrupan si hay más), cada tipo de aviso se
puede apagar desde Configuración, tono amable y sin culpa. Las alertas de categoría se
envían una vez por umbral por mes.

Mientras la app está abierta, los mismos avisos aparecen como tarjeta en "Tu próximo paso".

---

## 9. Resumen con IA

Se genera al cerrar cada mes y **a pedido para cualquier período** desde Estadísticas
(usa el mismo filtro de período).

**Input:** métricas agregadas del período: totales por categoría, presupuesto vs. real,
evolución vs. períodos anteriores, gastos discrecionales chicos y frecuentes, recurrentes
sin cambios en ≥ 3 meses, progreso de metas, fondo de emergencia, patrimonio, deuda en
cuotas. Todo en ARS y USD.

**Output (breve, rioplatense, sin sermones), presentado como tarjetas, no como un texto
largo:**
1. **Lo principal:** 2–3 líneas, incluye tasa de ahorro.
2. **Desvíos** relevantes vs. presupuesto.
3. **Gastos hormiga** detectados (muchos gastos chicos discrecionales que suman).
4. **Suscripciones a revisar** (recurrentes estables que conviene validar).
5. **Metas:** progreso y meses cubiertos del fondo de emergencia.
6. **Una recomendación concreta**, con botón de acción cuando aplique (ej.: `Revisar
   suscripciones` lleva a Movimientos filtrado).

Para la evolución, priorizar USD como medida de poder de compra (en ARS la inflación
distorsiona la comparación entre meses), mostrando ambas.

Cache: el resumen de un período se guarda; si cambian registros de ese período se muestra
`Actualizar resumen`.

---

## 10. Estadísticas (dashboard)

- **Selector de período fijo arriba** (chips: Mes, Trimestre, Año, Personalizado) con
  flechas para moverse entre períodos. **Aplica a todos los widgets y al resumen IA.**
- Todos los montos en ARS | USD.
- **Tocar cualquier barra, porción o número lleva a Movimientos filtrado** por ese período
  y esa dimensión.

Widgets, en este orden:
1. **KPIs:** ingresos, gastos, ahorro, **tasa de ahorro** (con variación vs. período anterior).
2. **Resumen IA del período** (sección 9).
3. **Gastos por categoría:** barras horizontales ordenadas + tabla ARS | USD.
4. **Evolución mensual** de ingresos, gastos y ahorro.
5. **Presupuesto vs. real** por categoría.
6. **Fijo vs. variable** y **esencial vs. discrecional**.
7. **Deuda en cuotas comprometida** y calendario de liberación.
8. **Metas:** progreso y **composición de aportes por mes** (barras apiladas).
9. **Fondo de emergencia:** meses cubiertos y aportes por mes.
10. **Patrimonio:** evolución total y por cuenta.

Cada widget sin datos muestra un estado vacío que enseña (7.1).

---

## 11. Voz dentro de la app

- Grabación con `MediaRecorder` desde la PWA y envío al **servicio de transcripción
  existente** del módulo de vehículos.
- Mientras transcribe: indicador de progreso y el texto de ejemplo visible.
- Si el permiso de micrófono está denegado: mensaje claro con cómo habilitarlo y el modo
  Rápido como alternativa inmediata.
- Si la transcripción o el parseo fallan: se muestra el texto transcripto editable y se
  ofrece reintentar o cargarlo como un movimiento sin clasificar. Nunca se pierde lo dictado.

### Prompt base de parseo

Se pasa como contexto: categorías activas, ítems de presupuesto del mes, tarjetas, metas,
fecha actual, tipo de cambio del mes y, en modo corrección, la lista actual.

```
Sos un parser de gastos personales para un usuario argentino que habla en español
rioplatense informal. Recibís una transcripción de voz y devolvés SOLO JSON válido, sin
texto adicional ni backticks.

Interpretación de montos:
- "lucas" o "mil" = miles ("180 lucas" = 180000). "palo" = millón.
- "verdes", "dólares", "usd", "u$s" → moneda USD. Si no se aclara, ARS.
- "unos", "más o menos", "aprox", "tipo" → es_aproximado = true.

Otras señales:
- "en N cuotas" → cuotas_total = N.
- "con la visa/master/<nombre de tarjeta>" → medio_pago = tarjeta_credito, tarjeta = nombre.
- "débito", "transferí", "efectivo", "mercado pago" → medio correspondiente.
- "a medias", "compartido", "lo pagamos entre", "la mitad era de" → compartido = true y
  nota_compartido con la aclaración textual.
- Si un gasto agrupa varias cosas ("súper: coto y verdulería"), un solo registro con
  incluye = "Coto + verdulería".
- "cobré", "me pagaron", "entró" → tipo ingreso. "ahorré", "separé", "puse en el fondo" →
  tipo ahorro (y meta si se menciona).
- Asigná la categoría más probable de la lista dada. Si no hay una razonable, null.
- Si coincide con un ítem de presupuesto del mes, devolvé su presupuesto_item_id.
- Fechas relativas ("ayer", "el finde") → resolvé contra la fecha actual. Si no se dice, null.

Modo corrección: si recibís "lista_actual" y un dictado de corrección ("el segundo eran 50",
"sacá el tercero", "el súper va en mascotas"), devolvé la lista completa actualizada.

Formato de salida:
{
  "registros": [
    {
      "tipo": "gasto|ingreso|ahorro",
      "descripcion": "string",
      "incluye": "string|null",
      "monto": number,
      "moneda": "ARS|USD",
      "es_aproximado": boolean,
      "categoria_id": "uuid|null",
      "presupuesto_item_id": "uuid|null",
      "medio_pago": "efectivo|debito|transferencia|billetera|tarjeta_credito|null",
      "tarjeta": "string|null",
      "cuotas_total": number|null,
      "compartido": boolean,
      "nota_compartido": "string|null",
      "meta": "string|null",
      "fecha": "YYYY-MM-DD|null"
    }
  ]
}

Ante ambigüedad, elegí la interpretación más probable y dejá en null lo que no sepas:
el usuario corrige en pantalla.
```

---

## 12. Integración con el módulo de vehículos

- Todo gasto cargado en Vehículos genera un registro en Finanzas con
  `origen = 'modulo_vehiculos'`, categoría Auto y `origen_ref_id`.
- **Deduplicación:** si el usuario carga en Finanzas un gasto que ya existe desde Vehículos
  (fecha cercana, mismo monto y categoría), la tarjeta del registro avisa posible
  duplicado con `Es otro` / `Ya estaba`.
- Gastos anuales del auto (seguro, patente, VTV) → ítems con frecuencia no mensual y
  prorrateo mensual.

---

## 13. Requisitos de UI transversales

- **Teclado numérico propio** para montos (grande, con separador de miles en vivo y
  atajos `+1.000` / `+10.000`), en lugar del teclado del sistema.
- Montos formateados en `es-AR` (`$ 180.000`, `US$ 120`).
- **Tema claro y oscuro.**
- Feedback háptico breve al guardar y al tildar, donde el dispositivo lo permita.
- Carga **optimista**: la interfaz se actualiza al instante y sincroniza en segundo plano;
  si falla, se avisa y se reintenta.
- Funciona sin conexión para cargar: los movimientos quedan en cola y se sincronizan al
  volver la conexión (la transcripción de voz se procesa cuando hay conexión).
- Accesibilidad: contraste AA, etiquetas en todos los controles, nada comunicado solo por
  color.
- Animaciones cortas (≤ 250 ms) y con respeto a "reducir movimiento".

---

## 14. Fuera de alcance de la v1

- Operar desde Telegram (solo avisos).
- Importar resumen de tarjeta, CSV o movimientos de banco / Mercado Pago (candidato fuerte
  para la v2).
- OCR de tickets.
- Conexión bancaria automática.
- Tipo de cambio automático por API (en v1 es manual; dejar la interfaz preparada).
- Cálculo de split en gastos compartidos (en v1 es check + nota) y cuentas compartidas
  entre usuarios.
- Cotización automática de inversiones.
- WhatsApp como canal.
- Presupuesto anual.

---

## 15. Orden de construcción sugerido

1. **Schema** (`fin_*`) + seed de categorías y catálogo de guías.
2. **Navegación + Inicio** con "Tu próximo paso".
3. **Carga** (voz con tarjetas editables, modo Rápido y atajos). ← punto de validación
   principal.
4. **Onboarding** con plantilla de fijos.
5. **Movimientos** y **Clasificar pendientes**.
6. **Presupuesto del mes** con reasignación.
7. **Revisión quincenal** (completa y exprés).
8. **Cierre y apertura de mes** con patrimonio, metas e inflación.
9. **Avisos por Telegram** con deep links.
10. **Estadísticas** con filtro de período.
11. **Resumen IA.**
12. **Guías contextuales**, racha e hitos.
13. Integración con Vehículos.

---

## 16. Criterios de validación (uso propio, 2–3 meses)

**Adopción**
- ≥ 80% de las revisiones realizadas (completas o exprés).
- Al menos el 50% de las cargas por voz.

**Eficiencia**
- Cargar un gasto: dictado + 1 toque, o ≤ 3 toques sin voz.
- Revisión quincenal completa ≤ 5 minutos; exprés ≤ 1 minuto.
- Cierre + apertura ≤ 7 minutos.
- Onboarding completo ≤ 5 minutos.

**Calidad del dato**
- ≤ 10% de movimientos sin clasificar al cierre del mes.
- ≥ 85% de los registros dictados guardados sin corrección.

**Valor**
- El resumen IA aporta al menos un hallazgo accionable por mes.
