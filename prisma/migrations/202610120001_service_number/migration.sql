-- Preserve legacy phone registrations; new candidates are identified by code.
ALTER TABLE "Candidate" ALTER COLUMN "phone" DROP NOT NULL;
