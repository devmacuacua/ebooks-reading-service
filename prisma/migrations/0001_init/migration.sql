CREATE TABLE "UserLibrary" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "userId"      TEXT         NOT NULL,
    "bookId"      TEXT         NOT NULL,
    "bookTitle"   TEXT         NOT NULL,
    "coverImage"  TEXT,
    "format"      TEXT,
    "fileKey"     TEXT,
    "totalPages"  INTEGER,
    "accessType"  TEXT         NOT NULL,
    "grantedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"   TIMESTAMP(3),

    CONSTRAINT "UserLibrary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserLibrary_userId_bookId_key" ON "UserLibrary"("userId", "bookId");

CREATE TABLE "ReadingSession" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "userId"      TEXT         NOT NULL,
    "libraryId"   UUID         NOT NULL,
    "bookId"      TEXT         NOT NULL,
    "currentPage" INTEGER      NOT NULL DEFAULT 0,
    "totalPages"  INTEGER,
    "progressPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deviceId"    TEXT         NOT NULL,
    "deviceName"  TEXT,
    "lastReadAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReadingSession_userId_bookId_deviceId_key" ON "ReadingSession"("userId", "bookId", "deviceId");

ALTER TABLE "ReadingSession"
    ADD CONSTRAINT "ReadingSession_libraryId_fkey"
    FOREIGN KEY ("libraryId") REFERENCES "UserLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReadingToken" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "userId"    TEXT         NOT NULL,
    "bookId"    TEXT         NOT NULL,
    "token"     TEXT         NOT NULL,
    "deviceId"  TEXT         NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReadingToken_token_key" ON "ReadingToken"("token");

CREATE TABLE "wishlist_items" (
    "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
    "userId"     TEXT          NOT NULL,
    "bookId"     TEXT          NOT NULL,
    "bookSlug"   TEXT,
    "bookTitle"  TEXT          NOT NULL,
    "coverImage" TEXT,
    "price"      DECIMAL(10,2),
    "addedAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wishlist_items_userId_bookId_key" ON "wishlist_items"("userId", "bookId");
CREATE INDEX "wishlist_items_userId_idx" ON "wishlist_items"("userId");
