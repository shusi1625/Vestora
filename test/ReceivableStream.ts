import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

describe("ReceivableStream", async function () {
    const { viem } = await network.create();
    const [sender, recipient, anotherRecipient] = await viem.getWalletClients();

    //ERC-721 metadata 확인
    it("has NFT metadata", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        assert.equal(await stream.read.name(), "Vestora Receivable");
        assert.equal(await stream.read.symbol(), "vRCV");
    });

    //mint 동작 확인
    it("mints a receivable NFT to the recipient", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await stream.write.createStream([recipient.account.address]);

        assert.equal(
            (await stream.read.ownerOf([1n])).toLowerCase(),
            recipient.account.address.toLowerCase(),
        );
        assert.equal(await stream.read.nextStreamId(), 2n);
    });

    //스트림 id 증가 확인
    it("increments stream ids for each created stream", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await stream.write.createStream([recipient.account.address]);
        await stream.write.createStream([anotherRecipient.account.address]);

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

    //0번 주소 접근 실패 확인
    it("rejects the zero address recipient", async function () {
        const stream = await viem.deployContract("ReceivableStream");

        await assert.rejects(
        stream.write.createStream(["0x0000000000000000000000000000000000000000"]),
    );
  });

});
