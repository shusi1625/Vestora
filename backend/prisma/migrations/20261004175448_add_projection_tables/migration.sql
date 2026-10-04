-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'CANCELED', 'SOLD');

-- CreateTable
CREATE TABLE "streams" (
    "stream_id" BIGINT NOT NULL,
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "current_owner" TEXT,
    "token" TEXT NOT NULL,
    "deposited_amount" TEXT NOT NULL,
    "withdrawn_amount" TEXT NOT NULL DEFAULT '0',
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "cancelable" BOOLEAN NOT NULL,
    "canceled_at" TIMESTAMP(3),
    "created_tx_hash" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streams_pkey" PRIMARY KEY ("stream_id")
);

-- CreateTable
CREATE TABLE "listings" (
    "stream_id" BIGINT NOT NULL,
    "seller" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL,
    "listed_at" TIMESTAMP(3) NOT NULL,
    "sold_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "buyer" TEXT,
    "listing_tx_hash" TEXT NOT NULL,
    "bought_tx_hash" TEXT,
    "canceled_tx_hash" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("stream_id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "stream_id" BIGINT NOT NULL,
    "recipient" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "log_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "stream_id" BIGINT NOT NULL,
    "seller" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "traded_at" TIMESTAMP(3) NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "log_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "streams_sender_idx" ON "streams"("sender");

-- CreateIndex
CREATE INDEX "streams_recipient_idx" ON "streams"("recipient");

-- CreateIndex
CREATE INDEX "streams_current_owner_idx" ON "streams"("current_owner");

-- CreateIndex
CREATE INDEX "listings_seller_idx" ON "listings"("seller");

-- CreateIndex
CREATE INDEX "listings_buyer_idx" ON "listings"("buyer");

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- CreateIndex
CREATE INDEX "claims_stream_id_idx" ON "claims"("stream_id");

-- CreateIndex
CREATE INDEX "claims_recipient_idx" ON "claims"("recipient");

-- CreateIndex
CREATE UNIQUE INDEX "claims_tx_hash_log_index_key" ON "claims"("tx_hash", "log_index");

-- CreateIndex
CREATE INDEX "trades_stream_id_idx" ON "trades"("stream_id");

-- CreateIndex
CREATE INDEX "trades_seller_idx" ON "trades"("seller");

-- CreateIndex
CREATE INDEX "trades_buyer_idx" ON "trades"("buyer");

-- CreateIndex
CREATE UNIQUE INDEX "trades_tx_hash_log_index_key" ON "trades"("tx_hash", "log_index");
