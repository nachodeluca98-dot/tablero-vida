-- CreateTable
CREATE TABLE "ReflexionDiaria" (
    "id" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "paso" INTEGER NOT NULL DEFAULT 0,
    "animo" INTEGER,
    "mejor" TEXT,
    "frustracion" TEXT,
    "mejorar" TEXT,
    "gratitud" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReflexionDiaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReflexionDiaria_fecha_key" ON "ReflexionDiaria"("fecha");
