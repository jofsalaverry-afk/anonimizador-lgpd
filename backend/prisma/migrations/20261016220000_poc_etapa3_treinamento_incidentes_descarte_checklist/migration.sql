-- CreateEnum
CREATE TYPE "TipoRegistroIncidente" AS ENUM ('REAL', 'SIMULADO');

-- AlterEnum
ALTER TYPE "TipoAlerta" ADD VALUE 'RETENCAO_VENCIDA';

-- AlterTable
ALTER TABLE "Incidente" ADD COLUMN     "severidade" "Criticidade",
ADD COLUMN     "tipoRegistro" "TipoRegistroIncidente" NOT NULL DEFAULT 'REAL';

-- AlterTable
ALTER TABLE "ItemChecklist" ADD COLUMN     "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "organizacaoId" TEXT,
ADD COLUMN     "prazo" TIMESTAMP(3),
ADD COLUMN     "responsavelId" TEXT;

-- CreateTable
CREATE TABLE "ProgressoTreinamento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "trilhaId" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "concluidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressoTreinamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificadoTreinamento" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "trilhaId" TEXT NOT NULL,
    "trilhaTitulo" TEXT NOT NULL,
    "nomeUsuario" TEXT NOT NULL,
    "nomeOrganizacao" TEXT NOT NULL,
    "cargaHorariaMin" INTEGER NOT NULL,
    "concluidoEm" TIMESTAMP(3) NOT NULL,
    "emitidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificadoTreinamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvidenciaIncidente" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "incidenteId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "responsavelId" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvidenciaIncidente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroDescarte" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "tratamentoId" TEXT NOT NULL,
    "dataDescarte" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER,
    "metodo" TEXT NOT NULL,
    "responsavelId" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroDescarte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgressoTreinamento_organizacaoId_trilhaId_idx" ON "ProgressoTreinamento"("organizacaoId", "trilhaId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressoTreinamento_usuarioId_trilhaId_moduloId_key" ON "ProgressoTreinamento"("usuarioId", "trilhaId", "moduloId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoTreinamento_codigo_key" ON "CertificadoTreinamento"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoTreinamento_usuarioId_trilhaId_key" ON "CertificadoTreinamento"("usuarioId", "trilhaId");

-- CreateIndex
CREATE INDEX "ProvidenciaIncidente_incidenteId_idx" ON "ProvidenciaIncidente"("incidenteId");

-- CreateIndex
CREATE INDEX "RegistroDescarte_organizacaoId_tratamentoId_idx" ON "RegistroDescarte"("organizacaoId", "tratamentoId");

-- CreateIndex
CREATE INDEX "ItemChecklist_organizacaoId_idx" ON "ItemChecklist"("organizacaoId");

-- AddForeignKey
ALTER TABLE "ItemChecklist" ADD CONSTRAINT "ItemChecklist_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemChecklist" ADD CONSTRAINT "ItemChecklist_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressoTreinamento" ADD CONSTRAINT "ProgressoTreinamento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressoTreinamento" ADD CONSTRAINT "ProgressoTreinamento_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificadoTreinamento" ADD CONSTRAINT "CertificadoTreinamento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificadoTreinamento" ADD CONSTRAINT "CertificadoTreinamento_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvidenciaIncidente" ADD CONSTRAINT "ProvidenciaIncidente_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvidenciaIncidente" ADD CONSTRAINT "ProvidenciaIncidente_incidenteId_fkey" FOREIGN KEY ("incidenteId") REFERENCES "Incidente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvidenciaIncidente" ADD CONSTRAINT "ProvidenciaIncidente_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroDescarte" ADD CONSTRAINT "RegistroDescarte_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroDescarte" ADD CONSTRAINT "RegistroDescarte_tratamentoId_fkey" FOREIGN KEY ("tratamentoId") REFERENCES "Tratamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroDescarte" ADD CONSTRAINT "RegistroDescarte_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

