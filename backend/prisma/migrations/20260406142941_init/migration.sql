-- CreateTable
CREATE TABLE "Camara" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "plano" TEXT NOT NULL DEFAULT 'basico',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoAcesso" TIMESTAMP(3),

    CONSTRAINT "Camara_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "camaraId" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "qtdDadosMascarados" INTEGER NOT NULL DEFAULT 0,
    "dadosJson" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Camara_cnpj_key" ON "Camara"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Camara_email_key" ON "Camara"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_camaraId_fkey" FOREIGN KEY ("camaraId") REFERENCES "Camara"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
