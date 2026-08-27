ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" text;
UPDATE "account" SET "issuer" = 'local:credential' WHERE "issuer" IS NULL AND "provider_id" = 'credential';