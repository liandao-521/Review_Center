CREATE TABLE "StudentQuestion" (
    "studentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentQuestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("studentId", "questionId")
);
CREATE INDEX "StudentQuestion_questionId_idx" ON "StudentQuestion"("questionId");
INSERT INTO "StudentQuestion" ("studentId", "questionId", "createdAt")
SELECT "studentId", "questionId", MIN("createdAt")
FROM "PracticeAttempt"
WHERE "studentId" IS NOT NULL AND "isCorrect" = 0
GROUP BY "studentId", "questionId";
