-- CreateTable
CREATE TABLE "TrilhaOverride" (
    "id" TEXT NOT NULL,
    "trilhaId" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "youtubeId" TEXT NOT NULL,
    "titulo" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrilhaOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrilhaOverride_trilhaId_moduloId_key" ON "TrilhaOverride"("trilhaId", "moduloId");
