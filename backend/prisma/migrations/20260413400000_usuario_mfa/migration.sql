-- MFA TOTP (Google Authenticator) no model Usuario.
-- mfaSecret: base32 do speakeasy (20 bytes = 32 chars base32).
-- mfaAtivo: so fica true depois que o usuario confirma o primeiro codigo.
ALTER TABLE "Usuario"
  ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "mfaAtivo" BOOLEAN NOT NULL DEFAULT false;
