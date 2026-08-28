import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

describe("ReceivableStream", async function () {
    const { viem, networkHelpers } = await network.create();
    const [sender, recipient, anotherRecipient] = await viem.getWalletClients();

    //helper 함수
    async function createDefaultStream(
        stream: any,
        to = recipient.account.address, 
        cancelable = false,
    ) {
        const token = await viem.deployContract("MockUSDC");
        const amount = 1_000_000n;

        const now = BigInt(await networkHelpers.time.latest());
        const startTime = now + 100n;
        const endTime = now + 1100n;

        await token.write.mint([sender.account.address, amount]);
        await token.write.approve([stream.address, amount]);

        await stream.write.createStream([
            to,
            token.address,
            amount,
            startTime,
            endTime,
            cancelable,
        ]);

        return { token, amount, startTime, endTime };
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

    //0. ERC-721 metadata 확인
    it("has NFT metadata", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        assert.equal(await stream.read.name(), "Vestora Receivable");
        assert.equal(await stream.read.symbol(), "vRCV");
    });

    //1. mint 동작 확인
    it("mints a receivable NFT to the recipient", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await createDefaultStream(stream);

        assert.equal(
            (await stream.read.ownerOf([1n])).toLowerCase(),
            recipient.account.address.toLowerCase(),
        );
        assert.equal(await stream.read.nextStreamId(), 2n);
    });

    //2. 스트림 id 증가 확인
    it("increments stream ids for each created stream", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await createDefaultStream(stream, recipient.account.address);
        await createDefaultStream(stream, anotherRecipient.account.address);

        assert.equal(
            (await stream.read.ownerOf([1n])).toLowerCase(),
            recipient.account.address.toLowerCase(),
        );
        
        assert.equal(
            (await stream.read.ownerOf([2n])).toLowerCase(),
            anotherRecipient.account.address.toLowerCase(),
        );
        assert.equal(await stream.read.nextStreamId(), 3n);
    });

    //3. getStream 동작 확인
    it("stores stream data", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { token, amount, startTime, endTime } =
            await createDefaultStream(stream);

        const stored = await stream.read.getStream([1n]);

        assert.equal(stored.sender.toLowerCase(), sender.account.address.toLowerCase());
        assert.equal(stored.token.toLowerCase(), token.address.toLowerCase());
        assert.equal(stored.depositedAmount, amount);
        assert.equal(stored.startTime, startTime);
        assert.equal(stored.endTime, endTime);
        assert.equal(stored.cancelable, false);
        assert.equal(stored.canceled, false);
        assert.equal(stored.canceledAt, 0n);
    });

    //4. 토큰 예치 확인
    it("escrows the ERC-20 tokens in the stream contract", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { token, amount } = await createDefaultStream(stream);

        assert.equal(await token.read.balanceOf([stream.address]), amount);
        assert.equal(await token.read.balanceOf([sender.account.address]), 0n);
    });
    
    //5. invalid parameter 실패 확인
    it("rejects invalid stream parameters", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await assert.rejects(
            stream.write.createStream([
                "0x0000000000000000000000000000000000000000",
                sender.account.address,
                1_000_000n,
                1000n,
                2000n,
                false,
            ]),
        );

        await assert.rejects(
            stream.write.createStream([
                recipient.account.address,
                "0x0000000000000000000000000000000000000000",
                1_000_000n,
                1000n,
                2000n,
                false,
            ]),
        );

        await assert.rejects(
            stream.write.createStream([
                recipient.account.address,
                sender.account.address,
                0n,
                1000n,
                2000n,
                false,
            ]),
        );

        await assert.rejects(
            stream.write.createStream([
                recipient.account.address,
                sender.account.address,
                1_000_000n,
                2000n,
                1000n,
                false,
            ]),
        );
    });

    //6. approve 없으면 스트림 생성 실패 확인
    it("rejects stream creation without token approval", async function () {
        const stream = await viem.deployContract("ReceivableStream");
        const token = await viem.deployContract("MockUSDC");

        const amount = 1_000_000n;
        await token.write.mint([sender.account.address, amount]);

        await assert.rejects(
            stream.write.createStream([
                recipient.account.address,
                token.address,
                amount,
                1000n,
                2000n,
                false,
            ]),
        );
    });

    //7. sender 잔액 부족시 스트림 생성 실패 확인
    it("rejects stream creation when sender balance is insufficient", async function () {
        const stream = await viem.deployContract("ReceivableStream");
        const token = await viem.deployContract("MockUSDC");

        const amount = 1_000_000n;

        await token.write.approve([stream.address, amount]);

        await assert.rejects(
            stream.write.createStream([
                recipient.account.address,
                token.address,
                amount,
                1000n,
                2000n,
                false,
            ]),
        );
    });

    //8~10. 스트림 시작 전, 중, 후에 따른 vestedAmount, claimableAmount 확인
    it("returns zero vested amount before the stream starts", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await createDefaultStream(stream);

        assert.equal(await stream.read.vestedAmount([1n]), 0n);
        assert.equal(await stream.read.claimableAmount([1n]), 0n);
    });
    it("calculates vested amount while the stream is active", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { amount, startTime, endTime } = await createDefaultStream(stream);

        const currentTime = startTime + (endTime - startTime) / 2n;
        const expected = vestedAt(amount, startTime, endTime, currentTime);

        await networkHelpers.time.increaseTo(Number(currentTime));

        assert.equal(expected, amount / 2n);
        assert.equal(await stream.read.vestedAmount([1n]), expected);
        assert.equal(await stream.read.claimableAmount([1n]), expected);
    });
    it("returns the full amount after the stream ends", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { amount, endTime } = await createDefaultStream(stream);

        await networkHelpers.time.increaseTo(Number(endTime));

        assert.equal(await stream.read.vestedAmount([1n]), amount);
        assert.equal(await stream.read.claimableAmount([1n]), amount);
    });

    //11. NFT 소유자의 claim 동작 확인
    it("lets the NFT owner claim vested tokens", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { token, amount, startTime, endTime } = await createDefaultStream(stream);

        const currentTime = startTime + (endTime - startTime) / 2n;
        const expected = vestedAt(amount, startTime, endTime, currentTime);

        await networkHelpers.time.increaseTo(Number(currentTime));

        const claimable = await stream.read.claimableAmount([1n]);
        assert.equal(claimable, expected);

        await stream.write.claim([1n], { account: recipient.account });

        const claimedAt = BigInt(await networkHelpers.time.latest());
        const claimedAmount = vestedAt(amount, startTime, endTime, claimedAt);

        assert.equal(await token.read.balanceOf([recipient.account.address]), claimedAmount);

        const stored = await stream.read.getStream([1n]);
        assert.equal(stored.withdrawnAmount, claimedAmount);
    });

    //12. NFT 소유자가 아닌 경우 claim 실패 확인 
    it("rejects claim from a non-owner", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { amount, startTime, endTime } = await createDefaultStream(stream);

        const currentTime = startTime + (endTime - startTime) / 2n;
        const expected = vestedAt(amount, startTime, endTime, currentTime);

        await networkHelpers.time.increaseTo(Number(currentTime));

        assert.equal(await stream.read.claimableAmount([1n]), expected);

        await assert.rejects(
            stream.write.claim([1n]),
        );
    });

    //13. claimable amount이 0인 경우 claim 실패 확인
    it("rejects claim when nothing is vested", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await createDefaultStream(stream);

        await assert.rejects(
            stream.write.claim([1n], { account: recipient.account }),
        );
    });

    //14. 중복 claim으로 초과 지급 여부 확인
    it("only lets the owner claim newly vested tokens", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { token, amount, startTime, endTime } = await createDefaultStream(stream);

        const firstClaimTime = startTime + (endTime - startTime) / 2n;
        const firstClaimAmount = vestedAt(amount, startTime, endTime, firstClaimTime);

        await networkHelpers.time.increaseTo(Number(firstClaimTime));
        await stream.write.claim([1n], { account: recipient.account });

        const firstClaimedAt = BigInt(await networkHelpers.time.latest());
        const firstClaimedAmount = vestedAt(amount, startTime, endTime, firstClaimedAt);
        const firstBalance = await token.read.balanceOf([recipient.account.address]);
        assert.equal(firstClaimAmount, amount / 2n);
        assert.equal(firstBalance, firstClaimedAmount);

        await networkHelpers.time.increaseTo(Number(endTime));
        await stream.write.claim([1n], { account: recipient.account });

        assert.equal(await token.read.balanceOf([recipient.account.address]), amount);

        const stored = await stream.read.getStream([1n]);
        assert.equal(stored.withdrawnAmount, amount);
    });

    //15. NFT 이전 후 claim 동작 확인
    it("moves claim rights with the receivable NFT", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { token, amount, startTime, endTime } = await createDefaultStream(stream);

        await stream.write.transferFrom(
            [recipient.account.address, anotherRecipient.account.address, 1n],
            { account: recipient.account },
        );

        const claimTime = startTime + (endTime - startTime) / 2n;
        const claimAmount = vestedAt(amount, startTime, endTime, claimTime);

        await networkHelpers.time.increaseTo(Number(claimTime));

        await assert.rejects(
            stream.write.claim([1n], { account: recipient.account }),
        );

        await stream.write.claim([1n], { account: anotherRecipient.account });

        const claimedAt = BigInt(await networkHelpers.time.latest());
        const claimedAmount = vestedAt(amount, startTime, endTime, claimedAt);

        assert.equal(
            await token.read.balanceOf([anotherRecipient.account.address]),
            claimedAmount,
        );
    });

    //16. uncancelable stream의 cancel 동작 실패 확인
    it("rejects canceling an uncancelable stream", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await createDefaultStream(stream);

        await assert.rejects(
            stream.write.cancel([1n]),
        );
    });

    //17. sender가 아닌 경우 cancel 동작 실패 확인
    it("rejects cancel from a non-sender", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await createDefaultStream(stream, recipient.account.address, true);

        await assert.rejects(
            stream.write.cancel([1n], { account: recipient.account }),
        );
    });

    //18. cancel 시 unvested 금액 반환 여부 확인
    it("refunds unvested tokens to the sender when canceled", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { token, amount, startTime, endTime } =
            await createDefaultStream(stream, recipient.account.address, true);

        const cancelTime = startTime + (endTime - startTime) / 2n;

        await networkHelpers.time.increaseTo(Number(cancelTime));

        const senderBefore = await token.read.balanceOf([sender.account.address]);

        await stream.write.cancel([1n]);

        const stored = await stream.read.getStream([1n]);
        const expectedVested = vestedAt(
            amount,
            startTime,
            endTime,
            stored.canceledAt,
        );
        const expectedRefund = amount - expectedVested;

        const senderAfter = await token.read.balanceOf([sender.account.address]);

        assert.equal(senderAfter - senderBefore, expectedRefund);
        assert.equal(stored.canceled, true);
    });

    //19. 시작 전 cancel 시 sender가 전액 환불받는지 확인
    it("refunds the full amount when canceled before the stream starts", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { token, amount } =
            await createDefaultStream(stream, recipient.account.address, true);

        const senderBefore = await token.read.balanceOf([sender.account.address]);

        await stream.write.cancel([1n]);

        const stored = await stream.read.getStream([1n]);
        const senderAfter = await token.read.balanceOf([sender.account.address]);

        assert.equal(senderAfter - senderBefore, amount);
        assert.equal(await stream.read.vestedAmount([1n]), 0n);
        assert.equal(await stream.read.claimableAmount([1n]), 0n);
        assert.equal(stored.canceled, true);

        await assert.rejects(
            stream.write.claim([1n], { account: recipient.account }),
        );
    });

    //20. 종료 후 cancel 시 sender 환불이 0이고 NFT 소유자가 전액 claim 가능한지 확인
    it("refunds nothing when canceled after the stream fully vests", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { token, amount, endTime } =
            await createDefaultStream(stream, recipient.account.address, true);

        await networkHelpers.time.increaseTo(Number(endTime));

        const senderBefore = await token.read.balanceOf([sender.account.address]);

        await stream.write.cancel([1n]);

        const senderAfter = await token.read.balanceOf([sender.account.address]);

        assert.equal(senderAfter - senderBefore, 0n);
        assert.equal(await stream.read.vestedAmount([1n]), amount);
        assert.equal(await stream.read.claimableAmount([1n]), amount);

        await stream.write.claim([1n], { account: recipient.account });

        assert.equal(await token.read.balanceOf([recipient.account.address]), amount);
        assert.equal(await token.read.balanceOf([stream.address]), 0n);
    });

    //21. cancel 후 vestedAmount가 고정되는지 확인
    it("freezes vested amount after cancellation", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { amount, startTime, endTime } =
            await createDefaultStream(stream, recipient.account.address, true);

        const cancelTime = startTime + (endTime - startTime) / 2n;

        await networkHelpers.time.increaseTo(Number(cancelTime));
        await stream.write.cancel([1n]);

        const stored = await stream.read.getStream([1n]);
        const vestedAtCancel = vestedAt(
            amount,
            startTime,
            endTime,
            stored.canceledAt,
        );

        await networkHelpers.time.increaseTo(Number(endTime));

        assert.equal(await stream.read.vestedAmount([1n]), vestedAtCancel);
        assert.equal(await stream.read.claimableAmount([1n]), vestedAtCancel);
    });

    //22. cancel 후 NFT 소유자가 vested 금액 claim 가능 여부 확인
    it("lets the NFT owner claim vested tokens after cancellation", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { token, amount, startTime, endTime } =
            await createDefaultStream(stream, recipient.account.address, true);

        const cancelTime = startTime + (endTime - startTime) / 2n;

        await networkHelpers.time.increaseTo(Number(cancelTime));
        await stream.write.cancel([1n]);

        const canceledAt = BigInt(await networkHelpers.time.latest());
        const expectedClaim = vestedAt(amount, startTime, endTime, canceledAt);

        await stream.write.claim([1n], { account: recipient.account });

        assert.equal(
            await token.read.balanceOf([recipient.account.address]),
            expectedClaim,
        );

        const stored = await stream.read.getStream([1n]);
        assert.equal(stored.withdrawnAmount, expectedClaim);
    });

    //23. partial claim + cancel + final claim 정산 보존 확인
    it("preserves the deposited amount across partial claim, cancellation, and final claim", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { token, amount, startTime, endTime } =
            await createDefaultStream(stream, recipient.account.address, true);

        const firstClaimTime = startTime + (endTime - startTime) / 4n;

        await networkHelpers.time.increaseTo(Number(firstClaimTime));
        await stream.write.claim([1n], { account: recipient.account });

        const firstClaimedAt = BigInt(await networkHelpers.time.latest());
        const firstClaimedAmount = vestedAt(
            amount,
            startTime,
            endTime,
            firstClaimedAt,
        );

        assert.equal(
            await token.read.balanceOf([recipient.account.address]),
            firstClaimedAmount,
        );

        const cancelTime = startTime + (endTime - startTime) / 2n;

        await networkHelpers.time.increaseTo(Number(cancelTime));

        const senderBeforeCancel = await token.read.balanceOf([sender.account.address]);

        await stream.write.cancel([1n]);

        const storedAfterCancel = await stream.read.getStream([1n]);
        const vestedAtCancel = vestedAt(
            amount,
            startTime,
            endTime,
            storedAfterCancel.canceledAt,
        );
        const expectedRefund = amount - vestedAtCancel;
        const expectedFinalClaim = vestedAtCancel - storedAfterCancel.withdrawnAmount;
        const senderAfterCancel = await token.read.balanceOf([sender.account.address]);

        assert.equal(senderAfterCancel - senderBeforeCancel, expectedRefund);
        assert.equal(await stream.read.claimableAmount([1n]), expectedFinalClaim);

        await stream.write.claim([1n], { account: recipient.account });

        const recipientFinalBalance = await token.read.balanceOf([
            recipient.account.address,
        ]);
        const contractFinalBalance = await token.read.balanceOf([stream.address]);
        const senderRefund = senderAfterCancel - senderBeforeCancel;

        assert.equal(recipientFinalBalance, vestedAtCancel);
        assert.equal(recipientFinalBalance + senderRefund, amount);
        assert.equal(contractFinalBalance, 0n);
    });

    //24. 이미 cancel된 스트림에 대해 cancel 동작 실패 확인
    it("rejects canceling an already canceled stream", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { startTime, endTime } =
            await createDefaultStream(stream, recipient.account.address, true);

        const cancelTime = startTime + (endTime - startTime) / 2n;

        await networkHelpers.time.increaseTo(Number(cancelTime));
        await stream.write.cancel([1n]);

        await assert.rejects(
            stream.write.cancel([1n]),
        );
    });
});
