-- CreateTable
CREATE TABLE "DsarOtp" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titularNome" TEXT NOT NULL,
    "titularCpf" TEXT,
    "tipoDireito" "TipoDireito" NOT NULL,
    "descricao" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DsarOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DsarOtp_email_codigo_usado_idx" ON "DsarOtp"("email", "codigo", "usado");

-- CreateIndex
CREATE INDEX "DsarOtp_expiresAt_idx" ON "DsarOtp"("expiresAt");
