-- CreateTable
CREATE TABLE "LogAuditoria" (
    "id" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userType" TEXT,
    "camaraId" TEXT,
    "metodo" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "statusCode" INTEGER,
    "durMs" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "body" JSONB,

    CONSTRAINT "LogAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogAuditoria_camaraId_criadoEm_idx" ON "LogAuditoria"("camaraId", "criadoEm");

-- CreateIndex
CREATE INDEX "LogAuditoria_userId_criadoEm_idx" ON "LogAuditoria"("userId", "criadoEm");

-- CreateIndex
CREATE INDEX "LogAuditoria_rota_criadoEm_idx" ON "LogAuditoria"("rota", "criadoEm");
