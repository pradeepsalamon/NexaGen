-- Self-registration Terms of Service + Privacy Policy acceptance (LEGAL_TERMS_VERSION). Additive; existing rows stay null.
ALTER TABLE "users" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
