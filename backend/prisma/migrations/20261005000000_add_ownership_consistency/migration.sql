ALTER TYPE "ListingStatus" ADD VALUE 'INVALIDATED';

ALTER TABLE "listings"
ADD COLUMN "invalidated_at" TIMESTAMP(3),
ADD COLUMN "invalidated_tx_hash" TEXT;

CREATE TABLE "ownership_reconciliations" (
    "id" TEXT NOT NULL,
    "stream_id" BIGINT NOT NULL,
    "projected_owner" TEXT,
    "onchain_owner" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ownership_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ownership_reconciliations_stream_id_idx" ON "ownership_reconciliations"("stream_id");
CREATE INDEX "ownership_reconciliations_matched_idx" ON "ownership_reconciliations"("matched");
