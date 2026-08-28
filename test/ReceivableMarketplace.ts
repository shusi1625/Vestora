import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

describe("ReceivableMarketplace", async function () {
    const { viem, networkHelpers } = await network.create();
    const [sender, recipient, anotherUser] = await viem.getWalletClients();

    async function createListedStream() {
        const stream = await viem.deployContract("ReceivableStream");
        const token = await viem.deployContract("MockUSDC");
        const marketplace = await viem.deployContract("ReceivableMarketplace", [
            stream.address,
            token.address,
        ]);

        const amount = 1_000_000n;
        const price = 400_000n;

        const now = BigInt(await networkHelpers.time.latest());
        const startTime = now + 100n;
        const endTime = now + 1100n;

        await token.write.mint([sender.account.address, amount]);
        await token.write.approve([stream.address, amount]);

        await stream.write.createStream([
            recipient.account.address,
            token.address,
            amount,
            startTime,
            endTime,
            false,
        ]);

        await stream.write.approve(
            [marketplace.address, 1n],
            { account: recipient.account },
        );

        await marketplace.write.list(
            [1n, price],
            { account: recipient.account },
        );

        return { stream, token, marketplace, amount, price, startTime, endTime };
    }

    function vestedAt(
        amount: bigint,
        startTime: bigint,
        endTime: bigint,
        currentTime: bigint,
    ) {
        if (currentTime <= startTime) {
            return 0n;
        }

        if (currentTime >= endTime) {
            return amount;
        }

        return (amount * (currentTime - startTime)) / (endTime - startTime);
    }

    //1. constructor에 전달된 주소가 올바르게 저장되는지 확인
    it("stores marketplace constructor addresses", async function () {
        const stream = await viem.deployContract("ReceivableStream");
        const token = await viem.deployContract("MockUSDC");

        const marketplace = await viem.deployContract("ReceivableMarketplace", [
            stream.address,
            token.address,
        ]);

        assert.equal(
            (await marketplace.read.receivableNft()).toLowerCase(),
            stream.address.toLowerCase(),
        );

        assert.equal(
            (await marketplace.read.paymentToken()).toLowerCase(),
            token.address.toLowerCase(),
        );
    });

    //2. constructor에 전달된 주소가 0인 경우 실패 확인
    it("rejects marketplace deployment with zero addresses", async function () {
        const stream = await viem.deployContract("ReceivableStream");
        const token = await viem.deployContract("MockUSDC");
        const zeroAddress = "0x0000000000000000000000000000000000000000";

        await assert.rejects(
            viem.deployContract("ReceivableMarketplace", [
                zeroAddress,
                token.address,
            ]),
        );

        await assert.rejects(
            viem.deployContract("ReceivableMarketplace", [
                stream.address,
                zeroAddress,
            ]),
        );
    });

    //3. NFT 소유자의 stream listing 동작 확인
    it("lets the NFT owner list a receivable", async function () {
        const { marketplace, price } = await createListedStream();

        const listing = await marketplace.read.getListing([1n]);

        assert.equal(
            listing.seller.toLowerCase(),
            recipient.account.address.toLowerCase(),
        );
        assert.equal(listing.price, price);
    });

    //4. NFT 소유자가 아닌 사용자의 stream listing 실패 확인
    it("rejects listing from a non-owner", async function () {
        const stream = await viem.deployContract("ReceivableStream");
        const token = await viem.deployContract("MockUSDC");
        const marketplace = await viem.deployContract("ReceivableMarketplace", [
            stream.address,
            token.address,
        ]);

        const amount = 1_000_000n;
        const now = BigInt(await networkHelpers.time.latest());

        await token.write.mint([sender.account.address, amount]);
        await token.write.approve([stream.address, amount]);

        await stream.write.createStream([
            recipient.account.address,
            token.address,
            amount,
            now + 100n,
            now + 1100n,
            false,
        ]);

        await assert.rejects(
            marketplace.write.list(
                [1n, 400_000n],
                { account: anotherUser.account },
            ),
        );
    });

    //5. 이미 listing된 stream listing 실패 확인
    it("rejects listing an already listed receivable", async function () {
        const { marketplace, price } = await createListedStream();

        await assert.rejects(
            marketplace.write.list(
                [1n, price],
                { account: recipient.account },
            ),
        );
    });

    //6. 가격이 0인 경우 listing 실패 확인
    it("rejects listing with zero price", async function () {
        const stream = await viem.deployContract("ReceivableStream");
        const token = await viem.deployContract("MockUSDC");
        const marketplace = await viem.deployContract("ReceivableMarketplace", [
            stream.address,
            token.address,
        ]);

        const amount = 1_000_000n;
        const now = BigInt(await networkHelpers.time.latest());

        await token.write.mint([sender.account.address, amount]);
        await token.write.approve([stream.address, amount]);

        await stream.write.createStream([
            recipient.account.address,
            token.address,
            amount,
            now + 100n,
            now + 1100n,
            false,
        ]);

        await stream.write.approve(
            [marketplace.address, 1n],
            { account: recipient.account },
        );

        await assert.rejects(
            marketplace.write.list(
                [1n, 0n],
                { account: recipient.account },
            ),
        );
    });

    //7. NFT approve 없이 listing 실패 확인
    it("rejects listing without marketplace approval", async function () {
        const stream = await viem.deployContract("ReceivableStream");
        const token = await viem.deployContract("MockUSDC");
        const marketplace = await viem.deployContract("ReceivableMarketplace", [
            stream.address,
            token.address,
        ]);

        const amount = 1_000_000n;
        const now = BigInt(await networkHelpers.time.latest());

        await token.write.mint([sender.account.address, amount]);
        await token.write.approve([stream.address, amount]);

        await stream.write.createStream([
            recipient.account.address,
            token.address,
            amount,
            now + 100n,
            now + 1100n,
            false,
        ]);

        await assert.rejects(
            marketplace.write.list(
                [1n, 400_000n],
                { account: recipient.account },
            ),
        );
    });

    //8. seller의 listing cancel 동작 확인
    it("lets the seller cancel a listing", async function () {
        const { marketplace } = await createListedStream();

        await marketplace.write.cancelListing(
            [1n],
            { account: recipient.account },
        );

        const listing = await marketplace.read.getListing([1n]);

        assert.equal(
            listing.seller,
            "0x0000000000000000000000000000000000000000",
        );
        assert.equal(listing.price, 0n);
    });

    //9. seller가 아닌 사용자의 listing cancel 실패 확인
    it("rejects canceling a listing from a non-seller", async function () {
        const { marketplace } = await createListedStream();

        await assert.rejects(
            marketplace.write.cancelListing(
                [1n],
                { account: anotherUser.account },
            ),
        );
    });

    //10. listing되지 않은 stream cancel 실패 확인
    it("rejects canceling an unlisted receivable", async function () {
        const stream = await viem.deployContract("ReceivableStream");
        const token = await viem.deployContract("MockUSDC");
        const marketplace = await viem.deployContract("ReceivableMarketplace", [
            stream.address,
            token.address,
        ]);

        await assert.rejects(
            marketplace.write.cancelListing(
                [1n],
                { account: recipient.account },
            ),
        );
    });

    //11. buy 동작 확인
    it("lets a buyer purchase a listed receivable", async function () {
        const { stream, token, marketplace, price } = await createListedStream();

        await token.write.mint([anotherUser.account.address, price]);
        await token.write.approve(
            [marketplace.address, price],
            { account: anotherUser.account },
        );

        await marketplace.write.buy(
            [1n],
            { account: anotherUser.account },
        );

        assert.equal(
            (await stream.read.ownerOf([1n])).toLowerCase(),
            anotherUser.account.address.toLowerCase(),
        );

        assert.equal(
            await token.read.balanceOf([recipient.account.address]),
            price,
        );

        const listing = await marketplace.read.getListing([1n]) as {
            seller: `0x${string}`;
            price: bigint;
        };

        assert.equal(
            listing.seller,
            "0x0000000000000000000000000000000000000000",
        );
        assert.equal(listing.price, 0n);
    });

    //12. listing되지 않은 stream 구매 실패
    it("rejects buying an unlisted receivable", async function () {
        const stream = await viem.deployContract("ReceivableStream");
        const token = await viem.deployContract("MockUSDC");
        const marketplace = await viem.deployContract("ReceivableMarketplace", [
            stream.address,
            token.address,
        ]);

        await assert.rejects(
            marketplace.write.buy(
                [1n],
                { account: anotherUser.account },
            ),
        );
    });

    //13. approve 없이 구매 실패
    it("rejects buying without payment token approval", async function () {
        const { token, marketplace, price } = await createListedStream();

        await token.write.mint([anotherUser.account.address, price]);

        await assert.rejects(
            marketplace.write.buy(
                [1n],
                { account: anotherUser.account },
            ),
        );
    });

    //14. seller가 approve를 취소한 경우 구매 실패
    it("rejects buying when the marketplace approval is revoked", async function () {
        const { stream, token, marketplace, price } = await createListedStream();

        await stream.write.approve(
            ["0x0000000000000000000000000000000000000000", 1n],
            { account: recipient.account },
        );

        await token.write.mint([anotherUser.account.address, price]);
        await token.write.approve(
            [marketplace.address, price],
            { account: anotherUser.account },
        );

        await assert.rejects(
            marketplace.write.buy(
                [1n],
                { account: anotherUser.account },
            ),
        );

        assert.equal(
            (await stream.read.ownerOf([1n])).toLowerCase(),
            recipient.account.address.toLowerCase(),
        );

        assert.equal(
            await token.read.balanceOf([anotherUser.account.address]),
            price,
        );

        const listing = await marketplace.read.getListing([1n]) as {
            seller: `0x${string}`;
            price: bigint;
        };

        assert.equal(
            listing.seller.toLowerCase(),
            recipient.account.address.toLowerCase(),
        );
        assert.equal(listing.price, price);
    });

    //15. seller가 NFT를 소유하지 않은 경우 구매 실패
    it("rejects buying when the seller no longer owns the NFT", async function () {
        const { stream, token, marketplace, price } = await createListedStream();

        await stream.write.transferFrom(
            [recipient.account.address, sender.account.address, 1n],
            { account: recipient.account },
        );

        await token.write.mint([anotherUser.account.address, price]);
        await token.write.approve(
            [marketplace.address, price],
            { account: anotherUser.account },
        );

        await assert.rejects(
            marketplace.write.buy(
                [1n],
                { account: anotherUser.account },
            ),
        );
    });

    //16. buyer의 잔액이 부족한 경우 구매 실패
    it("rejects buying when buyer balance is insufficient", async function () {
        const { stream, token, marketplace, price } = await createListedStream();

        await token.write.mint([anotherUser.account.address, price - 1n]);
        await token.write.approve(
            [marketplace.address, price],
            { account: anotherUser.account },
        );

        await assert.rejects(
            marketplace.write.buy(
                [1n],
                { account: anotherUser.account },
            ),
        );

        assert.equal(
            (await stream.read.ownerOf([1n])).toLowerCase(),
            recipient.account.address.toLowerCase(),
        );

        const listing = await marketplace.read.getListing([1n]) as {
            seller: `0x${string}`;
            price: bigint;
        };

        assert.equal(
            listing.seller.toLowerCase(),
            recipient.account.address.toLowerCase(),
        );
        assert.equal(listing.price, price);
    });

    //17. 구매 후 buyer claim 동작 확인
    it("lets the buyer claim the receivable after purchase", async function () {
        const { stream, token, marketplace, price, amount, startTime, endTime } =
            await createListedStream();

        await token.write.mint([anotherUser.account.address, price]);
        await token.write.approve(
            [marketplace.address, price],
            { account: anotherUser.account },
        );

        await marketplace.write.buy(
            [1n],
            { account: anotherUser.account },
        );

        assert.equal(
            (await stream.read.ownerOf([1n])).toLowerCase(),
            anotherUser.account.address.toLowerCase(),
        );

        const claimTime = startTime + (endTime - startTime) / 2n;

        await networkHelpers.time.increaseTo(Number(claimTime));

        await stream.write.claim(
            [1n],
            { account: anotherUser.account },
        );

        const claimedAt = BigInt(await networkHelpers.time.latest());
        const expectedClaim = vestedAt(amount, startTime, endTime, claimedAt);

        assert.equal(
            await token.read.balanceOf([anotherUser.account.address]),
            expectedClaim,
        );
    });
});