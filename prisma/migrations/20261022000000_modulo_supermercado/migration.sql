-- CreateTable
CREATE TABLE "super_items" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "busquedas" TEXT[],
    "criterio" TEXT NOT NULL DEFAULT 'primero',
    "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unidad" TEXT NOT NULL DEFAULT 'un',
    "opcional" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "coto_url" TEXT,
    "coto_nombre" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_corridas" (
    "id" TEXT NOT NULL,
    "modo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "total" DOUBLE PRECISION,
    "detalle" JSONB NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_corridas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "super_corridas_created_at_idx" ON "super_corridas"("created_at");
