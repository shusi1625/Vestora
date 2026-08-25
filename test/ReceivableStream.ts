import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

describe("ReceivableStream", async function () {
    const { viem } = await network.create();
    const [sender, recipient, anotherRecipient] = await viem.getWalletClients();

    //helper 함수
    async function createDefaultStream(stream: any, to = recipient.account.address) {
        const tokenAddress = sender.account.address;
        const amount = 1_000_000n;
        const startTime = 1000n;
        const endTime = 2000n;

        await stream.write.createStream([
            to,
            tokenAddress,
            amount,
            startTime,
            endTime,
        ]);

        return { tokenAddress, amount, startTime, endTime };
    }

    //ERC-721 metadata 확인
    it("has NFT metadata", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        assert.equal(await stream.read.name(), "Vestora Receivable");
        assert.equal(await stream.read.symbol(), "vRCV");
    });

    //mint 동작 확인
    it("mints a receivable NFT to the recipient", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await createDefaultStream(stream);

        assert.equal(
            (await stream.read.ownerOf([1n])).toLowerCase(),
            recipient.account.address.toLowerCase(),
        );
        assert.equal(await stream.read.nextStreamId(), 2n);
    });

    //스트림 id 증가 확인
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

    //invalid parameter 실패 확인
    it("rejects invalid stream parameters", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await assert.rejects(
            stream.write.createStream([
                "0x0000000000000000000000000000000000000000",
                sender.account.address,
                1_000_000n,
                1000n,
                2000n,
            ]),
        );

        await assert.rejects(
            stream.write.createStream([
                recipient.account.address,
                "0x0000000000000000000000000000000000000000",
                1_000_000n,
                1000n,
                2000n,
            ]),
        );

        await assert.rejects(
            stream.write.createStream([
                recipient.account.address,
                sender.account.address,
                0n,
                1000n,
                2000n,
            ]),
        );

        await assert.rejects(
            stream.write.createStream([
                recipient.account.address,
                sender.account.address,
                1_000_000n,
                2000n,
                1000n,
            ]),
        );
    });

    //getStream 동작 확인
    it("stores stream data", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        const { tokenAddress, amount, startTime, endTime } =
            await createDefaultStream(stream);

        const stored = await stream.read.getStream([1n]);

        assert.equal(stored.sender.toLowerCase(), sender.account.address.toLowerCase());
        assert.equal(stored.token.toLowerCase(), tokenAddress.toLowerCase());
        assert.equal(stored.depositedAmount, amount);
        assert.equal(stored.startTime, startTime);
        assert.equal(stored.endTime, endTime);
    });

});
