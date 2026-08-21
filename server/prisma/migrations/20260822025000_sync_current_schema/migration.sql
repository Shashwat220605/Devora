-- Keep this migration safe for the already-updated production database.
-- It is intentionally idempotent because the GitHub user columns were
-- added manually before this migration was committed.

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "githubUsername" TEXT,
ADD COLUMN IF NOT EXISTS "githubTokenEnc" TEXT;

CREATE TABLE IF NOT EXISTS "ProjectFile" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFile_projectId_path_key"
ON "ProjectFile"("projectId", "path");

CREATE INDEX IF NOT EXISTS "ProjectFile_projectId_idx"
ON "ProjectFile"("projectId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ProjectFile_projectId_fkey'
    ) THEN
        ALTER TABLE "ProjectFile"
        ADD CONSTRAINT "ProjectFile_projectId_fkey"
        FOREIGN KEY ("projectId")
        REFERENCES "Project"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE;
    END IF;
END $$;
