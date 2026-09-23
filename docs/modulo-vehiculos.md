# Módulo de Vehículos — Especificación v1

> Documento de contexto y especificación para Claude Code.
> Concentra la discusión de producto previa y las decisiones técnicas tomadas.
> Ubicación sugerida en el repo: `docs/modulo-vehiculos.md`
> Referenciarlo desde `CLAUDE.md` para que quede como contexto permanente.

---

## 1. Origen y contexto de la idea

### 1.1 La visión grande

La idea madre es un **software de gestión personal modular**, pensado como una
especie de "CRM para personas", inspirado en el modelo de Odoo: un núcleo con
módulos que se activan según lo que cada persona necesita.

**Slogan de trabajo:** *delegar la gestión diaria para enfocarse en lo que
realmente importa.*

**Modelo de negocio previsto:** freemium modular. Un núcleo estándar gratuito,
y se paga por módulos adicionales o por customización.

**Módulos contemplados en la visión completa:**

- Vehículos
- Negocio / trabajo
- Fitness y entrenamiento
- Nutrición
- Bienestar general
- Finanzas personales
- Hábitos
- Relaciones sociales
- Rincón creativo

Por encima de todos, una **capa transversal de asistente con IA**. Esa capa
—no los módulos en sí— es el verdadero diferencial contra Notion o una planilla
de Excel. Un módulo suelto lo replica cualquiera; la integración entre módulos
más el asistente que los lee todos, no.

### 1.2 Relación con el Tablero de Vida

El Tablero de Vida existente deja de ser una herramienta solo personal y pasa a
ser el **producto base**. El módulo de vehículos se construye como un apartado
que se enchufa ahí.

Implicancia de diseño importante: aunque la v1 sea solo vehículos, **el modelo
de datos tiene que nacer pensado como módulo**, con usuario y entidad separados
desde el día uno, para que después se integre sin reescribir nada.

### 1.3 Por qué vehículos es el primer módulo

De toda la lista, vehículos es el único que **se vende solo**. Cumple tres
condiciones que hacen que una herramienta así sobreviva:

1. **Dolor concreto y reconocible.** "Se me venció el service", "no sé cuánto
   gasté en el auto este año", "¿cuándo cambié el aceite?".
2. **El costo de carga es menor que el valor que devuelve.** Cargar un dato
   toma 15 segundos; lo que ahorra en plata, tiempo y energía es
   desproporcionadamente mayor.
3. **No depende de los otros ocho módulos para valer.** Funciona aislado.

Además, cada módulo puede ser una puerta de entrada distinta al producto:
alguien entra por vehículos, otro por finanzas, y una vez adentro lo engancha la
integración entre módulos.

Por contraste: fitness depende de sincronizar datos externos, y varios de los
otros módulos tienen un costo de carga manual mayor al valor que devuelven.

### 1.4 Criterio de validación

**Antes de pensar en desarrollo comercial, esto se prueba sobre uno mismo.**

La pregunta a responder no es "¿funciona el código?" sino **"¿lo sigo usando a
los dos o tres meses?"**. Si a los dos meses se dejó de cargar, el módulo falló,
por más prolijo que esté.

Riesgo real del proyecto hoy: no es que alguien copie la idea —una hipótesis sin
validar no se copia—, es construir algo que ni el propio autor termina usando.
La inversión se mantiene chica hasta que el uso propio valide.

**Regla derivada:** todo lo que se pueda cortar de la v1, se corta. La versión
uno tiene que estar usable en días, no en meses.

---

## 2. Objetivo de la v1

Registrar, con el mínimo esfuerzo posible, la vida de uno o más vehículos, y
que el sistema avise proactivamente antes de que algo venza.

Tres capacidades, todas obligatorias en la v1:

1. **Cargas de combustible + cálculo de rendimiento**
2. **Recordatorios automáticos** (service, cambio de aceite, VTV, neumáticos,
   seguro)
3. **Historial completo del vehículo** consultable

---

## 3. Decisiones tomadas

| Decisión | Definición | Motivo |
|---|---|---|
| Plataforma | PWA (web instalable en el celular) | Una sola base de código, sin tiendas de apps |
| Alcance de vehículos | Multi-vehículo desde el arranque | Si el modelo de datos nace bien, es casi gratis |
| Canal de avisos | **Telegram** en la v1, WhatsApp después | Ver 3.1 |
| Carga de datos | **Voz (por el bot) + formulario corto como respaldo** | Ver 3.2 |
| OCR de tickets | **Fuera de alcance** | Ver 3.2 |
| Infraestructura | Capa gratuita | Ver 3.3 |

### 3.1 Por qué Telegram y no WhatsApp

WhatsApp era la preferencia original —es el centro de comunicación diario del
usuario— pero para que un sistema mande mensajes automáticos hace falta la API
oficial de Meta, que exige:

- verificación de negocio,
- plantillas de mensaje aprobadas previamente para escribir fuera de la ventana
  de 24 horas,
- un número dedicado, que **no puede ser el mismo que se usa en la app de
  WhatsApp**.

Semanas de trámite antes de escribir una línea útil. Telegram da un bot
funcionando en minutos, gratis y sin aprobaciones.

**El canal no está cerrado para siempre:** WhatsApp queda en el backlog para
cuando el módulo esté validado. La arquitectura debe abstraer el canal de
notificación para que cambiarlo sea reemplazar un adaptador, no reescribir la
lógica.

### 3.2 Por qué el bot es también el canal de carga

Insight central de la arquitectura: **si el bot ya existe para avisar, también
sirve para cargar.**

El usuario manda un audio o un texto al bot:

> "cargué 30 litros, 45 lucas, 87.400 kilómetros"

El bot lo transcribe, lo parsea, lo registra y responde confirmando, con el
rendimiento calculado al toque.

Consecuencia: **la PWA no es para cargar, es para ver.** Historial, gráficos,
próximos vencimientos. Eso simplifica enormemente la web, que deja de necesitar
formularios complejos, manejo de estado offline y todo lo que suele hundir estos
proyectos.

El formulario corto queda como respaldo, para cuando no se pueda mandar audio o
el parseo falle.

**OCR de tickets queda afuera de la v1.** Es la función con más trabajo de
implementación y la que más se equivoca. Voz + formulario cubren el 90% del caso
a una fracción del esfuerzo.

### 3.3 Infraestructura

Arrancar en capa gratuita. Consideraciones:

- **Bases gratuitas tipo Supabase o Neon se pausan solas** tras una semana sin
  actividad, lo cual es un problema real en una app de uso esporádico. Evaluar
  Cloudflare (D1) que no tiene ese comportamiento, o aceptar la latencia del
  despertar.
- **El único costo inevitable** es la transcripción de audio y el parseo con IA.
  Con volumen personal, hablamos de 1 o 2 USD por mes.
- Pagar entre 5 y 10 USD por mes compra: nada se pausa, backups, y cron
  confiable para los recordatorios.

**Regla:** gratis hasta que se use tres meses seguidos. Si sobrevivió, se paga.

---

## 4. Arquitectura

Tres componentes:

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Bot Telegram   │────▶│   Backend/API    │◀────│   PWA (web)    │
│ carga por voz   │     │  parseo + reglas │     │ historial +    │
│ + avisos salida │     │  + scheduler     │     │ gráficos       │
└─────────────────┘     └────────┬─────────┘     └────────────────┘
                                 │
                            ┌────▼─────┐
                            │    DB    │
                            └──────────┘
```

**Importante:** el bot y el scheduler de recordatorios **no pueden vivir dentro
de la PWA**. Necesitan un proceso de servidor con webhook público y una tarea
programada que corra a diario. Es un componente nuevo sí o sí, independientemente
de que el front se integre al Tablero de Vida existente.

Piezas:

- **Webhook del bot:** recibe mensajes y audios de Telegram.
- **Transcripción:** audio → texto.
- **Parser IA:** texto → objeto estructurado (ver sección 6).
- **Motor de reglas:** calcula próximos vencimientos por kilometraje y por fecha.
- **Scheduler:** corre una vez por día, evalúa vencimientos próximos, dispara
  avisos por el adaptador de canal.
- **Adaptador de canal:** interfaz única de notificación. Implementación
  Telegram hoy; WhatsApp o mail después, sin tocar el resto.

---

## 5. Modelo de datos

Diseñado como módulo dentro de una plataforma multi-módulo. Nombres orientativos.

### `users`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| nombre | text | |
| telegram_chat_id | text | Vincula la cuenta con el bot |
| timezone | text | Default `America/Argentina/Buenos_Aires` |
| created_at | timestamptz | |

### `vehicles`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users |
| alias | text | Cómo lo nombra el usuario al hablarle al bot ("el Gol", "la camioneta") |
| marca | text | |
| modelo | text | |
| anio | int | |
| patente | text | |
| km_actual | int | Denormalizado, se actualiza con cada evento |
| km_actual_fecha | date | Para estimar km entre cargas |
| activo | bool | Permite archivar un vehículo vendido sin perder historial |

El campo `alias` es clave: permite que el bot resuelva a qué vehículo se refiere
un mensaje sin preguntar. Si el usuario tiene un solo vehículo activo, se asume
ése por defecto.

### `fuel_logs`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| vehicle_id | uuid | FK |
| fecha | date | |
| litros | numeric | |
| monto_total | numeric | |
| precio_litro | numeric | Calculado si no se informa |
| odometro | int | Km al momento de cargar |
| tanque_lleno | bool | Necesario para calcular rendimiento correctamente |
| estacion | text | Opcional |
| notas | text | |
| fuente | enum | `voz` / `formulario` |
| raw_input | text | Texto original, para depurar el parser |

### `maintenance_events`
Todo lo que le pasó al vehículo: service, cambio de aceite, neumáticos,
reparaciones, VTV rendida, patente pagada.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| vehicle_id | uuid | FK |
| tipo | enum | `service`, `aceite`, `neumaticos`, `vtv`, `seguro`, `patente`, `reparacion`, `otro` |
| fecha | date | |
| odometro | int | |
| monto | numeric | Opcional |
| taller | text | Opcional |
| descripcion | text | |
| vence_fecha | date | Si aplica (VTV, seguro) |
| vence_odometro | int | Si aplica (aceite, service) |
| fuente | enum | |
| raw_input | text | |

### `maintenance_rules`
Intervalos estándar. Pre-cargables por modelo de fábrica, editables por el
usuario.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| vehicle_id | uuid | FK (null = regla global por defecto) |
| tipo | enum | Mismo enum que maintenance_events |
| cada_km | int | Nullable |
| cada_meses | int | Nullable |
| aviso_km_antes | int | Default 500 |
| aviso_dias_antes | int | Default 15 |
| activa | bool | |

Reglas por defecto sugeridas (editables):

| Tipo | Cada km | Cada meses |
|---|---|---|
| Aceite y filtro | 10.000 | 12 |
| Service general | 15.000 | 12 |
| Rotación de neumáticos | 10.000 | — |
| VTV | — | 12 |
| Seguro | — | 12 |
| Patente | — | 3 |

### `reminders`
Avisos ya disparados, para no repetir y para llevar registro.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| vehicle_id | uuid | FK |
| rule_id | uuid | FK |
| tipo | enum | |
| enviado_at | timestamptz | |
| canal | enum | `telegram`, `whatsapp`, `mail` |
| estado | enum | `enviado`, `reconocido`, `pospuesto` |

---

## 6. Lógica del bot

### 6.1 Flujo

1. Llega mensaje (texto o audio) al webhook.
2. Si es audio → transcribir.
3. Pasar el texto al parser IA con el contexto del usuario (vehículos activos,
   último odómetro conocido, fecha actual).
4. El parser devuelve JSON estructurado.
5. Si la confianza es alta → guardar y confirmar con el dato calculado.
6. Si falta un campo crítico o hay ambigüedad → **preguntar una sola cosa**, no
   abrir un cuestionario.
7. Guardar siempre el `raw_input` para poder mejorar el parser después.

### 6.2 Respuesta del bot

La confirmación tiene que **devolver valor inmediato**, no solo decir "guardado":

> ✅ Registrado: 30 L, $45.000, 87.400 km
> ⛽ Rendimiento desde la última carga: 11,2 km/L
> 🔧 Próximo cambio de aceite: en 1.100 km

Ese cierre es lo que hace que cargar el dato no se sienta como una tarea.

### 6.3 Prompt de parseo (base a iterar)

```
Sos un parser de registros de vehículos. Recibís un mensaje en español
rioplatense, informal, posiblemente transcrito de un audio y con errores.

Contexto:
- Fecha de hoy: {fecha}
- Vehículos del usuario: {lista con alias, marca, modelo, último odómetro}
- Último odómetro registrado: {km} del {fecha}

Devolvé SOLO un JSON válido, sin markdown, sin explicación, con esta forma:

{
  "tipo": "carga_combustible" | "mantenimiento" | "consulta" | "desconocido",
  "vehiculo_alias": string | null,
  "confianza": number,          // 0 a 1
  "falta": [string],            // campos críticos ausentes
  "datos": { ... }              // según tipo
}

Para "carga_combustible", datos:
  { "litros": number|null, "monto_total": number|null,
    "precio_litro": number|null, "odometro": number|null,
    "tanque_lleno": boolean|null, "estacion": string|null, "fecha": "YYYY-MM-DD" }

Para "mantenimiento", datos:
  { "subtipo": "service"|"aceite"|"neumaticos"|"vtv"|"seguro"|"patente"|"reparacion"|"otro",
    "monto": number|null, "odometro": number|null, "taller": string|null,
    "descripcion": string, "fecha": "YYYY-MM-DD" }

Reglas de interpretación:
- "lucas", "mil", "k" = miles de pesos. "45 lucas" = 45000.
- "palo" = millón.
- Los números transcritos pueden venir con puntos o comas inconsistentes.
- Si el odómetro informado es MENOR al último registrado, marcá confianza baja
  y agregá "odometro" en "falta": probablemente se escuchó mal.
- Si no menciona vehículo y el usuario tiene uno solo activo, asumilo.
- Si no menciona fecha, asumí hoy.
- Nunca inventes un valor. Si no está, va null.
```

### 6.4 Comandos útiles del bot

- `/estado` — resumen: km actual, próximos vencimientos, rendimiento promedio
- `/vehiculos` — lista y permite cambiar el vehículo por defecto
- `/ultimo` — muestra el último registro y permite corregirlo o borrarlo

El comando de corrección importa: si equivocarse es caro, se deja de cargar.

---

## 7. Motor de recordatorios

Corre una vez por día.

Para cada vehículo activo y cada regla activa:

1. Buscar el último evento de ese tipo.
2. Calcular el próximo vencimiento por km y por fecha, lo que ocurra primero.
3. Para el vencimiento por km, **estimar el kilometraje actual** proyectando el
   promedio diario de los últimos registros. El odómetro real solo se conoce
   cuando el usuario carga algo.
4. Si entra en la ventana de aviso y no se envió un recordatorio por esa misma
   regla en los últimos N días → disparar.

Contenido del aviso: qué vence, cuándo o en cuántos km, y qué hacer. Con opción
de responder "ya lo hice" para registrarlo desde el mismo mensaje.

---

## 8. PWA — alcance v1

Solo lectura y visualización. Nada de formularios complejos.

- **Inicio:** tarjetas por vehículo con km actual y próximos vencimientos
  ordenados por urgencia.
- **Detalle de vehículo:** historial unificado de cargas y mantenimientos en
  línea de tiempo.
- **Rendimiento:** gráfico de km/L en el tiempo y costo por kilómetro.
- **Gastos:** total por período y desglose por tipo (combustible, service,
  reparaciones, impuestos).
- **Formulario de carga manual:** 4 campos, como respaldo del bot.
- **Configuración:** vehículos, alias, reglas de mantenimiento.

---

## 9. Fuera de alcance de la v1

Anotado para que no se cuele:

- OCR de tickets y facturas
- WhatsApp como canal
- Integración con otros módulos del Tablero de Vida
- Multi-usuario compartiendo un mismo vehículo
- Exportación de reportes
- Precarga automática de intervalos por modelo desde una base externa
- Cualquier cosa relacionada con monetización

---

## 10. Backlog posterior

Por orden tentativo de valor:

1. Migrar el canal de avisos a WhatsApp una vez validado el uso
2. Precarga de intervalos de fábrica por marca y modelo
3. OCR de tickets como atajo de carga
4. Alertas de rendimiento anómalo (caída de km/L = posible problema mecánico)
5. Costo total de propiedad y proyección anual
6. Integración con el módulo de finanzas del Tablero de Vida
7. Compartir vehículo entre usuarios

---

## 11. Primer paso sugerido para Claude Code

En orden, para tener algo usable rápido:

1. Esquema de base de datos y migraciones
2. Webhook del bot + transcripción + parser, con confirmación de vuelta
3. Motor de reglas y scheduler de recordatorios
4. PWA de lectura

El punto 2 es el corazón. Si eso funciona bien y se usa todos los días, el resto
se justifica solo. Si no se usa, no hay pantalla que lo salve.
