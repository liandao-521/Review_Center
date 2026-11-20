ALTER TABLE "Question" ADD COLUMN "questionType" TEXT;
CREATE INDEX "Question_questionType_idx" ON "Question"("questionType");
