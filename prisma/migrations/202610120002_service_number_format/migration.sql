-- Preserve every attempt when both legacy six-digit and formatted codes exist.
-- Only numeric six-digit codes from v1.2 are affected; phone-based legacy codes remain unchanged.
UPDATE "Attempt" AS attempt
SET "candidateId" = canonical."id"
FROM "Candidate" AS legacy
JOIN "Candidate" AS canonical
  ON canonical."code" = substr(legacy."code", 1, 3) || '-' || substr(legacy."code", 4, 3)
WHERE legacy."code" ~ '^[0-9]{6}$'
  AND attempt."candidateId" = legacy."id";

-- Rename codes without a canonical counterpart, keeping their candidate ID and history.
UPDATE "Candidate" AS legacy
SET "code" = substr(legacy."code", 1, 3) || '-' || substr(legacy."code", 4, 3),
    "info" = legacy."info" || jsonb_build_object(
      'serviceNumber', substr(legacy."code", 1, 3) || '-' || substr(legacy."code", 4, 3),
      'candidateCode', substr(legacy."code", 1, 3) || '-' || substr(legacy."code", 4, 3)
    )
WHERE legacy."code" ~ '^[0-9]{6}$'
  AND NOT EXISTS (
    SELECT 1 FROM "Candidate" AS canonical
    WHERE canonical."code" = substr(legacy."code", 1, 3) || '-' || substr(legacy."code", 4, 3)
  );
