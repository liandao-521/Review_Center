ALTER TABLE "Account" ADD COLUMN "isClassAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "QuestionEditorAssignment" (
    "questionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionEditorAssignment_pkey" PRIMARY KEY ("questionId", "accountId"),
    CONSTRAINT "QuestionEditorAssignment_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionEditorAssignment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "QuestionEditorAssignment_accountId_idx" ON "QuestionEditorAssignment"("accountId");
