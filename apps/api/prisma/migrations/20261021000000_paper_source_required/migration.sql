-- Convert legacy free-text sources into managed Paper rows before making the relation required.
INSERT INTO "Paper" ("id", "title", "subject", "grade", "originalName", "fileName", "createdAt")
SELECT
    'legacy-source-' || lower(hex(randomblob(16))),
    trim("sourceTitle"),
    "subject",
    "grade",
    '',
    'legacy-source-' || lower(hex(randomblob(16))) || '.meta',
    CURRENT_TIMESTAMP
FROM "Question" q
WHERE q."paperId" IS NULL
  AND q."sourceTitle" IS NOT NULL
  AND trim(q."sourceTitle") <> ''
  AND NOT EXISTS (
      SELECT 1 FROM "Paper" p
      WHERE lower(trim(p."title")) = lower(trim(q."sourceTitle"))
        AND p."subject" = q."subject"
        AND ifnull(p."grade", '') = ifnull(q."grade", '')
  )
GROUP BY trim(q."sourceTitle"), q."subject", q."grade";

UPDATE "Question"
SET "paperId" = (
    SELECT p."id" FROM "Paper" p
    WHERE lower(trim(p."title")) = lower(trim("Question"."sourceTitle"))
      AND p."subject" = "Question"."subject"
      AND ifnull(p."grade", '') = ifnull("Question"."grade", '')
    ORDER BY p."createdAt", p."id"
    LIMIT 1
)
WHERE "paperId" IS NULL
  AND "sourceTitle" IS NOT NULL
  AND trim("sourceTitle") <> '';

INSERT INTO "Paper" ("id", "title", "subject", "grade", "originalName", "fileName", "createdAt")
SELECT 'legacy-missing-source', '待补来源', '其他', NULL, '', 'legacy-missing-source.meta', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Question" WHERE "paperId" IS NULL);

UPDATE "Question" SET "paperId" = 'legacy-missing-source' WHERE "paperId" IS NULL;

-- Prisma's SQLite table rebuild makes paperId required and changes deletion to RESTRICT.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Paper" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "grade" TEXT,
    "originalName" TEXT,
    "fileName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Paper" ("createdAt", "fileName", "grade", "id", "originalName", "subject", "title")
SELECT "createdAt", "fileName", "grade", "id", "originalName", "subject", "title" FROM "Paper";
DROP TABLE "Paper";
ALTER TABLE "new_Paper" RENAME TO "Paper";
CREATE UNIQUE INDEX "Paper_fileName_key" ON "Paper"("fileName");
UPDATE "Paper" SET "originalName" = NULL, "fileName" = NULL WHERE "id" LIKE 'legacy-source-%' OR "id" = 'legacy-missing-source';

CREATE TABLE "new_Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "questionType" TEXT,
    "grade" TEXT,
    "content" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "explanation" TEXT NOT NULL DEFAULT '',
    "paperId" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "sourceTitle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Question_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("answer", "content", "createdAt", "explanation", "grade", "id", "pageNumber", "paperId", "questionType", "sourceTitle", "subject", "updatedAt")
SELECT "answer", "content", "createdAt", "explanation", "grade", "id", "pageNumber", "paperId", "questionType", "sourceTitle", "subject", "updatedAt" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
CREATE INDEX "Question_subject_grade_idx" ON "Question"("subject", "grade");
CREATE INDEX "Question_questionType_idx" ON "Question"("questionType");
CREATE INDEX "Question_paperId_idx" ON "Question"("paperId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
