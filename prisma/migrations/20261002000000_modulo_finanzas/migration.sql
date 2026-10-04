-- CreateEnum
CREATE TYPE "FinTipo" AS ENUM ('gasto', 'ingreso', 'ahorro');

-- CreateEnum
CREATE TYPE "FinFijoVariable" AS ENUM ('fijo', 'variable');

-- CreateEnum
CREATE TYPE "FinNaturaleza" AS ENUM ('esencial', 'discrecional');

-- CreateEnum
CREATE TYPE "FinMoneda" AS ENUM ('ARS', 'USD');

-- CreateEnum
CREATE TYPE "FinEstadoMes" AS ENUM ('abierto', 'cerrado');

-- CreateEnum
CREATE TYPE "FinFrecuencia" AS ENUM ('mensual', 'bimestral', 'trimestral', 'anual');

-- CreateEnum
CREATE TYPE "FinMedioPago" AS ENUM ('efectivo', 'debito', 'transferencia', 'billetera', 'tarjeta_credito');

-- CreateEnum
CREATE TYPE "FinOrigenItem" AS ENUM ('manual', 'clon', 'cuotas', 'modulo_vehiculos', 'onboarding');

-- CreateEnum
CREATE TYPE "FinOrigenRegistro" AS ENUM ('app_voz', 'app_rapida', 'app_formulario', 'revision', 'cuotas', 'modulo_vehiculos');

-- CreateEnum
CREATE TYPE "FinTipoMeta" AS ENUM ('fondo_emergencia', 'meta');

-- CreateEnum
CREATE TYPE "FinTipoCuenta" AS ENUM ('banco', 'billetera', 'efectivo', 'broker', 'cripto', 'otro');

-- CreateEnum
CREATE TYPE "FinTipoRevision" AS ENUM ('apertura', 'quincenal', 'cierre');

-- CreateEnum
CREATE TYPE "FinModoRevision" AS ENUM ('completo', 'expres');

-- CreateEnum
CREATE TYPE "FinEstadoRevision" AS ENUM ('pendiente', 'en_curso', 'completa', 'salteada');

-- CreateEnum
CREATE TYPE "FinEstadoGuia" AS ENUM ('pendiente', 'vista', 'completada', 'descartada');

-- CreateTable
CREATE TABLE "fin_categorias" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "FinTipo" NOT NULL,
    "fijo_variable_default" "FinFijoVariable" NOT NULL DEFAULT 'variable',
    "naturaleza_default" "FinNaturaleza" NOT NULL DEFAULT 'esencial',
    "icono" TEXT,
    "color" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_meses" (
    "id" TEXT NOT NULL,
    "anio_mes" CHAR(7) NOT NULL,
    "tipo_cambio" DECIMAL(12,4),
    "fuente_tc" TEXT,
    "ajuste_inflacion_pct" DECIMAL(6,2),
    "estado" "FinEstadoMes" NOT NULL DEFAULT 'abierto',
    "cerrado_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_meses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_presupuesto_items" (
    "id" TEXT NOT NULL,
    "mes_id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "incluye" TEXT,
    "monto_original" DECIMAL(14,2) NOT NULL,
    "moneda_original" "FinMoneda" NOT NULL DEFAULT 'ARS',
    "monto_ars" DECIMAL(14,2),
    "monto_usd" DECIMAL(14,2),
    "frecuencia" "FinFrecuencia" NOT NULL DEFAULT 'mensual',
    "monto_previsto_mensual" DECIMAL(14,2),
    "recurrente" BOOLEAN NOT NULL DEFAULT true,
    "fijo_variable" "FinFijoVariable" NOT NULL DEFAULT 'variable',
    "naturaleza" "FinNaturaleza" NOT NULL DEFAULT 'esencial',
    "dia_vencimiento" INTEGER,
    "medio_pago" "FinMedioPago",
    "tarjeta_id" TEXT,
    "origen" "FinOrigenItem" NOT NULL DEFAULT 'manual',
    "item_origen_id" TEXT,
    "plan_cuotas_id" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_presupuesto_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_registros" (
    "id" TEXT NOT NULL,
    "mes_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "FinTipo" NOT NULL DEFAULT 'gasto',
    "categoria_id" TEXT,
    "presupuesto_item_id" TEXT,
    "descripcion" TEXT,
    "incluye" TEXT,
    "monto_original" DECIMAL(14,2) NOT NULL,
    "moneda_original" "FinMoneda" NOT NULL DEFAULT 'ARS',
    "monto_ars" DECIMAL(14,2),
    "monto_usd" DECIMAL(14,2),
    "tc_propio" DECIMAL(12,4),
    "es_aproximado" BOOLEAN NOT NULL DEFAULT false,
    "fijo_variable" "FinFijoVariable",
    "naturaleza" "FinNaturaleza",
    "medio_pago" "FinMedioPago",
    "tarjeta_id" TEXT,
    "plan_cuotas_id" TEXT,
    "cuota_numero" INTEGER,
    "compartido" BOOLEAN NOT NULL DEFAULT false,
    "nota_compartido" TEXT,
    "meta_id" TEXT,
    "origen" "FinOrigenRegistro" NOT NULL DEFAULT 'app_formulario',
    "origen_ref_id" TEXT,
    "transcripcion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_registros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_tarjetas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dia_cierre" INTEGER NOT NULL,
    "dia_vencimiento" INTEGER,
    "moneda_principal" "FinMoneda" NOT NULL DEFAULT 'ARS',
    "es_default" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_tarjetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_planes_cuotas" (
    "id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria_id" TEXT,
    "tarjeta_id" TEXT,
    "monto_cuota" DECIMAL(14,2) NOT NULL,
    "moneda" "FinMoneda" NOT NULL DEFAULT 'ARS',
    "cuotas_total" INTEGER NOT NULL,
    "mes_primera_cuota" CHAR(7) NOT NULL,
    "registro_origen_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_planes_cuotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_metas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "FinTipoMeta" NOT NULL DEFAULT 'meta',
    "icono" TEXT,
    "monto_objetivo" DECIMAL(14,2),
    "moneda" "FinMoneda",
    "meses_cobertura" INTEGER,
    "fecha_objetivo" DATE,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_metas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_aportes_meta" (
    "id" TEXT NOT NULL,
    "meta_id" TEXT NOT NULL,
    "mes_id" TEXT NOT NULL,
    "registro_id" TEXT,
    "monto_original" DECIMAL(14,2) NOT NULL,
    "moneda_original" "FinMoneda" NOT NULL DEFAULT 'ARS',
    "monto_ars" DECIMAL(14,2),
    "monto_usd" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_aportes_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_cuentas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "FinTipoCuenta" NOT NULL DEFAULT 'banco',
    "moneda" "FinMoneda" NOT NULL DEFAULT 'ARS',
    "icono" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_patrimonio_snapshots" (
    "id" TEXT NOT NULL,
    "mes_id" TEXT NOT NULL,
    "cuenta_id" TEXT NOT NULL,
    "saldo_original" DECIMAL(14,2) NOT NULL,
    "moneda_original" "FinMoneda" NOT NULL DEFAULT 'ARS',
    "saldo_ars" DECIMAL(14,2),
    "saldo_usd" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_patrimonio_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_revisiones" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "FinTipoRevision" NOT NULL,
    "modo" "FinModoRevision" NOT NULL DEFAULT 'completo',
    "estado" "FinEstadoRevision" NOT NULL DEFAULT 'pendiente',
    "paso_actual" INTEGER NOT NULL DEFAULT 0,
    "duracion_seg" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_revisiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_resumenes_ia" (
    "id" TEXT NOT NULL,
    "periodo_desde" DATE NOT NULL,
    "periodo_hasta" DATE NOT NULL,
    "contenido" TEXT NOT NULL,
    "metricas_input" JSONB NOT NULL,
    "generado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desactualizado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_resumenes_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_guias_estado" (
    "id" TEXT NOT NULL,
    "guia_id" TEXT NOT NULL,
    "estado" "FinEstadoGuia" NOT NULL DEFAULT 'pendiente',
    "vista_at" TIMESTAMP(3),
    "veces_mostrada" INTEGER NOT NULL DEFAULT 0,
    "veces_descartada" INTEGER NOT NULL DEFAULT 0,
    "ultima_vez_mostrada" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_guias_estado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_preferencias" (
    "id" TEXT NOT NULL DEFAULT 'user',
    "dias_revision" INTEGER[] DEFAULT ARRAY[15, 0]::INTEGER[],
    "ajuste_inflacion_default" DECIMAL(6,2),
    "mostrar_guias" BOOLEAN NOT NULL DEFAULT true,
    "avisos_telegram" JSONB NOT NULL DEFAULT '{}',
    "onboarding_paso" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_preferencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fin_meses_anio_mes_key" ON "fin_meses"("anio_mes");

-- CreateIndex
CREATE INDEX "fin_presupuesto_items_mes_id_categoria_id_idx" ON "fin_presupuesto_items"("mes_id", "categoria_id");

-- CreateIndex
CREATE INDEX "fin_registros_mes_id_tipo_idx" ON "fin_registros"("mes_id", "tipo");

-- CreateIndex
CREATE INDEX "fin_registros_fecha_idx" ON "fin_registros"("fecha");

-- CreateIndex
CREATE INDEX "fin_registros_categoria_id_idx" ON "fin_registros"("categoria_id");

-- CreateIndex
CREATE INDEX "fin_registros_origen_origen_ref_id_idx" ON "fin_registros"("origen", "origen_ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "fin_planes_cuotas_registro_origen_id_key" ON "fin_planes_cuotas"("registro_origen_id");

-- CreateIndex
CREATE INDEX "fin_aportes_meta_meta_id_mes_id_idx" ON "fin_aportes_meta"("meta_id", "mes_id");

-- CreateIndex
CREATE UNIQUE INDEX "fin_patrimonio_snapshots_mes_id_cuenta_id_key" ON "fin_patrimonio_snapshots"("mes_id", "cuenta_id");

-- CreateIndex
CREATE INDEX "fin_revisiones_fecha_tipo_idx" ON "fin_revisiones"("fecha", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "fin_resumenes_ia_periodo_desde_periodo_hasta_key" ON "fin_resumenes_ia"("periodo_desde", "periodo_hasta");

-- CreateIndex
CREATE UNIQUE INDEX "fin_guias_estado_guia_id_key" ON "fin_guias_estado"("guia_id");

-- AddForeignKey
ALTER TABLE "fin_presupuesto_items" ADD CONSTRAINT "fin_presupuesto_items_mes_id_fkey" FOREIGN KEY ("mes_id") REFERENCES "fin_meses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_presupuesto_items" ADD CONSTRAINT "fin_presupuesto_items_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "fin_categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_presupuesto_items" ADD CONSTRAINT "fin_presupuesto_items_tarjeta_id_fkey" FOREIGN KEY ("tarjeta_id") REFERENCES "fin_tarjetas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_presupuesto_items" ADD CONSTRAINT "fin_presupuesto_items_item_origen_id_fkey" FOREIGN KEY ("item_origen_id") REFERENCES "fin_presupuesto_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_presupuesto_items" ADD CONSTRAINT "fin_presupuesto_items_plan_cuotas_id_fkey" FOREIGN KEY ("plan_cuotas_id") REFERENCES "fin_planes_cuotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_registros" ADD CONSTRAINT "fin_registros_mes_id_fkey" FOREIGN KEY ("mes_id") REFERENCES "fin_meses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_registros" ADD CONSTRAINT "fin_registros_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "fin_categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_registros" ADD CONSTRAINT "fin_registros_presupuesto_item_id_fkey" FOREIGN KEY ("presupuesto_item_id") REFERENCES "fin_presupuesto_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_registros" ADD CONSTRAINT "fin_registros_tarjeta_id_fkey" FOREIGN KEY ("tarjeta_id") REFERENCES "fin_tarjetas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_registros" ADD CONSTRAINT "fin_registros_plan_cuotas_id_fkey" FOREIGN KEY ("plan_cuotas_id") REFERENCES "fin_planes_cuotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_registros" ADD CONSTRAINT "fin_registros_meta_id_fkey" FOREIGN KEY ("meta_id") REFERENCES "fin_metas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_planes_cuotas" ADD CONSTRAINT "fin_planes_cuotas_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "fin_categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_planes_cuotas" ADD CONSTRAINT "fin_planes_cuotas_tarjeta_id_fkey" FOREIGN KEY ("tarjeta_id") REFERENCES "fin_tarjetas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_planes_cuotas" ADD CONSTRAINT "fin_planes_cuotas_registro_origen_id_fkey" FOREIGN KEY ("registro_origen_id") REFERENCES "fin_registros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_aportes_meta" ADD CONSTRAINT "fin_aportes_meta_meta_id_fkey" FOREIGN KEY ("meta_id") REFERENCES "fin_metas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_aportes_meta" ADD CONSTRAINT "fin_aportes_meta_mes_id_fkey" FOREIGN KEY ("mes_id") REFERENCES "fin_meses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_aportes_meta" ADD CONSTRAINT "fin_aportes_meta_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "fin_registros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_patrimonio_snapshots" ADD CONSTRAINT "fin_patrimonio_snapshots_mes_id_fkey" FOREIGN KEY ("mes_id") REFERENCES "fin_meses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_patrimonio_snapshots" ADD CONSTRAINT "fin_patrimonio_snapshots_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "fin_cuentas"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Categorías iniciales (editables desde la app)
INSERT INTO "fin_categorias" ("id", "nombre", "tipo", "fijo_variable_default", "naturaleza_default", "icono", "color", "orden", "updated_at") VALUES
  ('fincat_vivienda',      'Vivienda',                'gasto',   'fijo',     'esencial',     '🏠', 'indigo',  1,  CURRENT_TIMESTAMP),
  ('fincat_servicios',     'Servicios',               'gasto',   'fijo',     'esencial',     '💡', 'amber',   2,  CURRENT_TIMESTAMP),
  ('fincat_super',         'Súper y almacén',         'gasto',   'variable', 'esencial',     '🛒', 'emerald', 3,  CURRENT_TIMESTAMP),
  ('fincat_mascotas',      'Mascotas',                'gasto',   'variable', 'esencial',     '🐾', 'orange',  4,  CURRENT_TIMESTAMP),
  ('fincat_auto',          'Auto',                    'gasto',   'variable', 'esencial',     '🚗', 'sky',     5,  CURRENT_TIMESTAMP),
  ('fincat_transporte',    'Transporte',              'gasto',   'variable', 'esencial',     '🚌', 'cyan',    6,  CURRENT_TIMESTAMP),
  ('fincat_salud',         'Salud',                   'gasto',   'fijo',     'esencial',     '🩺', 'rose',    7,  CURRENT_TIMESTAMP),
  ('fincat_suscripciones', 'Suscripciones',           'gasto',   'fijo',     'discrecional', '📺', 'violet',  8,  CURRENT_TIMESTAMP),
  ('fincat_salidas',       'Salidas y delivery',      'gasto',   'variable', 'discrecional', '🍕', 'pink',    9,  CURRENT_TIMESTAMP),
  ('fincat_ropa',          'Ropa y cuidado personal', 'gasto',   'variable', 'discrecional', '👕', 'fuchsia', 10, CURRENT_TIMESTAMP),
  ('fincat_educacion',     'Educación',               'gasto',   'fijo',     'esencial',     '📚', 'blue',    11, CURRENT_TIMESTAMP),
  ('fincat_trabajo',       'Trabajo y herramientas',  'gasto',   'variable', 'esencial',     '💼', 'slate',   12, CURRENT_TIMESTAMP),
  ('fincat_regalos',       'Regalos',                 'gasto',   'variable', 'discrecional', '🎁', 'red',     13, CURRENT_TIMESTAMP),
  ('fincat_varios',        'Varios',                  'gasto',   'variable', 'discrecional', '📦', 'stone',   14, CURRENT_TIMESTAMP),
  ('fincat_honorarios',    'Honorarios/sueldo',       'ingreso', 'fijo',     'esencial',     '💰', 'green',   1,  CURRENT_TIMESTAMP),
  ('fincat_otros_ingresos','Otros ingresos',          'ingreso', 'variable', 'esencial',     '➕', 'teal',    2,  CURRENT_TIMESTAMP),
  ('fincat_ahorro',        'Ahorro',                  'ahorro',  'fijo',     'esencial',     '🐷', 'lime',    1,  CURRENT_TIMESTAMP);

-- Preferencias por defecto (fila única)
INSERT INTO "fin_preferencias" ("id", "updated_at") VALUES ('user', CURRENT_TIMESTAMP);
