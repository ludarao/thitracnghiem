-- Identity is the normalized initials+phone code, not phone alone.
-- Preserve all existing candidate IDs, attempts and legacy information.
DROP INDEX IF EXISTS "Candidate_phone_key";
CREATE INDEX "Candidate_phone_idx" ON "Candidate"("phone");
