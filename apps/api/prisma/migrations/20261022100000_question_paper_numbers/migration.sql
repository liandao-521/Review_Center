ALTER TABLE "Question" ADD COLUMN "majorNumber" INTEGER;
ALTER TABLE "Question" ADD COLUMN "minorNumber" INTEGER;
CREATE UNIQUE INDEX "Question_paperId_majorNumber_minorNumber_key" ON "Question"("paperId", "majorNumber", "minorNumber");
