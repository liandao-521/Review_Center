-- CreateTable
CREATE TABLE "Classroom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "Classroom" ("id", "name", "createdAt") VALUES ('default-class', '默认班级', CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL DEFAULT 'family',
    "displayName" TEXT NOT NULL DEFAULT '家庭账号',
    "passwordHash" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "classroomId" TEXT NOT NULL DEFAULT 'default-class',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("createdAt", "id", "passwordHash", "updatedAt") SELECT "createdAt", "id", "passwordHash", "updatedAt" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");
CREATE TABLE "new_Paper" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "grade" TEXT,
    "originalName" TEXT,
    "fileName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classroomId" TEXT NOT NULL DEFAULT 'default-class',
    "createdById" TEXT NOT NULL DEFAULT 'family',
    CONSTRAINT "Paper_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Paper_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Paper" ("createdAt", "fileName", "grade", "id", "originalName", "subject", "title") SELECT "createdAt", "fileName", "grade", "id", "originalName", "subject", "title" FROM "Paper";
DROP TABLE "Paper";
ALTER TABLE "new_Paper" RENAME TO "Paper";
CREATE UNIQUE INDEX "Paper_fileName_key" ON "Paper"("fileName");
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
    "majorNumber" INTEGER,
    "minorNumber" INTEGER,
    "sourceTitle" TEXT,
    "createdById" TEXT NOT NULL DEFAULT 'family',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Question_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Question_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("answer", "content", "createdAt", "explanation", "grade", "id", "majorNumber", "minorNumber", "pageNumber", "paperId", "questionType", "sourceTitle", "subject", "updatedAt") SELECT "answer", "content", "createdAt", "explanation", "grade", "id", "majorNumber", "minorNumber", "pageNumber", "paperId", "questionType", "sourceTitle", "subject", "updatedAt" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
CREATE INDEX "Question_subject_grade_idx" ON "Question"("subject", "grade");
CREATE INDEX "Question_questionType_idx" ON "Question"("questionType");
CREATE INDEX "Question_paperId_idx" ON "Question"("paperId");
CREATE UNIQUE INDEX "Question_paperId_majorNumber_minorNumber_key" ON "Question"("paperId", "majorNumber", "minorNumber");
CREATE TABLE "new_Session" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL DEFAULT 'family',
    "accountId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("createdAt", "expiresAt", "tokenHash") SELECT "createdAt", "expiresAt", "tokenHash" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE TABLE "new_Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "accountId" TEXT NOT NULL DEFAULT 'family',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Student_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Student" ("createdAt", "id", "name") SELECT "createdAt", "id", "name" FROM "Student";
DROP TABLE "Student";
ALTER TABLE "new_Student" RENAME TO "Student";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
