-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL DEFAULT 'sepolia',
    "chain_id" INTEGER NOT NULL,
    "latest_indexed_block" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexed_events" (
    "id" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "transaction_hash" TEXT NOT NULL,
    "log_index" INTEGER NOT NULL,
    "contract_address" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "payload" JSONB,
    "block_timestamp" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indexed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "indexed_events_chain_id_block_number_idx" ON "indexed_events"("chain_id", "block_number");

-- CreateIndex
CREATE INDEX "indexed_events_event_name_idx" ON "indexed_events"("event_name");

-- CreateIndex
CREATE UNIQUE INDEX "indexed_events_transaction_hash_log_index_key" ON "indexed_events"("transaction_hash", "log_index");
