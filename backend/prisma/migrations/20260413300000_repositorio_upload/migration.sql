-- Extende enum TipoDocRepo com categorias novas do repositorio.
ALTER TYPE "TipoDocRepo" ADD VALUE IF NOT EXISTS 'POLITICA_PRIVACIDADE';
ALTER TYPE "TipoDocRepo" ADD VALUE IF NOT EXISTS 'POLITICA_SEGURANCA';
ALTER TYPE "TipoDocRepo" ADD VALUE IF NOT EXISTS 'MODELO_DSAR';
ALTER TYPE "TipoDocRepo" ADD VALUE IF NOT EXISTS 'TERMO_USO';

-- Campos de arquivo binario em DocumentoRepositorio.
ALTER TABLE "DocumentoRepositorio"
  ADD COLUMN IF NOT EXISTS "descricao" TEXT,
  ADD COLUMN IF NOT EXISTS "arquivo" BYTEA,
  ADD COLUMN IF NOT EXISTS "mimetype" TEXT,
  ADD COLUMN IF NOT EXISTS "nomeArquivo" TEXT,
  ADD COLUMN IF NOT EXISTS "tamanhoBytes" INTEGER;
