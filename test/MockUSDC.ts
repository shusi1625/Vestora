import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {network} from "hardhat";

describe("MockUSDC", async function () {
    const { viem } = await network.create();
    const [owner, user] = await viem.getWalletClients();
  
    //토큰 기본 정보 확인
    it("has token metadata", async function () {
      const token = await viem.deployContract("MockUSDC");
  
      assert.equal(await token.read.name(), "Mock USDC");
      assert.equal(await token.read.symbol(), "mUSDC");
      assert.equal(await token.read.decimals(), 6);
    });
  
    //mint 동작 확인
    it("mints tokens to a user", async function () {
      const token = await viem.deployContract("MockUSDC");
  
      const amount = 1_000_000n;
      await token.write.mint([user.account.address, amount]);
  
      assert.equal(await token.read.balanceOf([user.account.address]), amount);
    });
  
    //토큰 전송 동작 확인
    it("transfers tokens between users", async function () {
      const token = await viem.deployContract("MockUSDC");
  
      const amount = 1_000_000n;
      await token.write.mint([owner.account.address, amount]);
  
      await token.write.transfer([user.account.address, amount]);
  
      assert.equal(await token.read.balanceOf([owner.account.address]), 0n);
      assert.equal(await token.read.balanceOf([user.account.address]), amount);
    });

    //approve-transferFrom-예치 동작 확인
    it("allows an approved spender to transfer tokens", async function () {
        const token = await viem.deployContract("MockUSDC");
      
        const amount = 1_000_000n;
        await token.write.mint([owner.account.address, amount]);
      
        await token.write.approve([user.account.address, amount]);
      
        assert.equal(
          await token.read.allowance([owner.account.address, user.account.address]),
          amount,
        );
      
        await token.write.transferFrom(
          [owner.account.address, user.account.address, amount],
          { account: user.account },
        );
      
        assert.equal(await token.read.balanceOf([owner.account.address]), 0n);
        assert.equal(await token.read.balanceOf([user.account.address]), amount);
      });
  });