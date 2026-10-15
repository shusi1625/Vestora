ALTER TABLE "sync_state" ADD COLUMN "latest_indexed_block_timestamp" TIMESTAMP(3);
ALTER TABLE "stream_events" ADD COLUMN "first_projected_at" TIMESTAMP(3);
CREATE TABLE "projection_state" (
  "id" TEXT NOT NULL,
  "latest_projected_block" BIGINT NOT NULL,
  "latest_projected_block_timestamp" TIMESTAMP(3) NOT NULL,
  "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projection_state_pkey" PRIMARY KEY ("id")
);
