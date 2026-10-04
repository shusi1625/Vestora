-- CreateTable
CREATE TABLE "stream_events" (
    "id" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "contract_address" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "block_number" BIGINT NOT NULL,
    "block_hash" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "log_index" INTEGER NOT NULL,
    "stream_id" BIGINT,
    "payload" JSONB NOT NULL,
    "block_timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stream_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stream_events_chain_id_block_number_idx" ON "stream_events"("chain_id", "block_number");

-- CreateIndex
CREATE INDEX "stream_events_event_name_idx" ON "stream_events"("event_name");

-- CreateIndex
CREATE INDEX "stream_events_stream_id_idx" ON "stream_events"("stream_id");

-- CreateIndex
CREATE UNIQUE INDEX "stream_events_tx_hash_log_index_key" ON "stream_events"("tx_hash", "log_index");
