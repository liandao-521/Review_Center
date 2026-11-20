UPDATE "Account" SET "displayName" = (
  SELECT "name" FROM "Student" WHERE "Student"."accountId" = "Account"."id"
) WHERE EXISTS (SELECT 1 FROM "Student" WHERE "Student"."accountId" = "Account"."id");
