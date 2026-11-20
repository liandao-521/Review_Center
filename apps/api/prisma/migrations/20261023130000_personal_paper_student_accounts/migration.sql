-- Each login now represents exactly one student. Keep the oldest student
-- attached to each existing account and discard additional test profiles.
INSERT INTO "Student" ("id", "name", "accountId", "createdAt")
SELECT 'student-' || account."id", account."displayName", account."id", CURRENT_TIMESTAMP
FROM "Account" AS account
WHERE NOT EXISTS (SELECT 1 FROM "Student" AS student WHERE student."accountId" = account."id");

DELETE FROM "Student" AS student
WHERE EXISTS (
  SELECT 1 FROM "Student" AS earlier
  WHERE earlier."accountId" = student."accountId"
    AND (earlier."createdAt" < student."createdAt"
      OR (earlier."createdAt" = student."createdAt" AND earlier."id" < student."id"))
);

CREATE UNIQUE INDEX "Student_accountId_key" ON "Student"("accountId");

ALTER TABLE "Paper" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'CLASSROOM';
ALTER TABLE "Paper" ADD COLUMN "ownerAccountId" TEXT REFERENCES "Account"("id") ON DELETE CASCADE;
ALTER TABLE "Paper" ADD COLUMN "originId" TEXT;
CREATE INDEX "Paper_scope_ownerAccountId_idx" ON "Paper"("scope", "ownerAccountId");
CREATE UNIQUE INDEX "Paper_classroomId_originId_key" ON "Paper"("classroomId", "originId");

ALTER TABLE "Question" ADD COLUMN "originId" TEXT;
CREATE UNIQUE INDEX "Question_paperId_originId_key" ON "Question"("paperId", "originId");

UPDATE "Session" SET "role" = 'student' WHERE "role" = 'family';
