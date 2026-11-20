CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "PracticeAttempt" ADD COLUMN "studentId" TEXT REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PracticeAttempt_studentId_questionId_idx" ON "PracticeAttempt"("studentId", "questionId");

CREATE TABLE "QuestionMastery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuestionMastery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionMastery_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QuestionMastery_studentId_questionId_key" ON "QuestionMastery"("studentId", "questionId");
CREATE INDEX "QuestionMastery_questionId_idx" ON "QuestionMastery"("questionId");
