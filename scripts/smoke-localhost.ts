import { network } from "hardhat";

const MOCK_USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const RECEIVABLE_STREAM_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const MARKETPLACE_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

const { viem, networkHelpers } = await network.create({
    network: "localhost",
    chainType: "l1",
});

const [sender, recipient, buyer] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();

const mockUSDC = await viem.getContractAt("MockUSDC", MOCK_USDC_ADDRESS);
const receivableStream = await viem.getContractAt(
    "ReceivableStream",
    RECEIVABLE_STREAM_ADDRESS,
);
const marketplace = await viem.getContractAt(
    "ReceivableMarketplace",
    MARKETPLACE_ADDRESS,
);

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

// 테스트용 상수
const depositAmount = 1_000_000n;
const salePrice = 400_000n;

const startDelay = 0n;
const duration = 300n;

console.log("Sender:", sender.account.address);
console.log("Recipient:", recipient.account.address);
console.log("Buyer:", buyer.account.address);

// stream 생성
console.log("Minting MockUSDC to sender...");
await mockUSDC.write.mint([sender.account.address, depositAmount]);

console.log("Approving ReceivableStream to spend sender MockUSDC...");
await mockUSDC.write.approve([receivableStream.address, depositAmount]);

const streamId = await receivableStream.read.nextStreamId();

console.log("Creating stream...");
await receivableStream.write.createStreamWithDuration([
    recipient.account.address,
    mockUSDC.address,
    depositAmount,
    startDelay,
    duration,
    false,
]);

console.log("Stream created:", streamId.toString());
console.log("NFT owner:", await receivableStream.read.ownerOf([streamId]));

const stored = await receivableStream.read.getStream([streamId]);
const storedDuration = stored.endTime - stored.startTime;
const vestedRightAfterCreate = await receivableStream.read.vestedAmount([streamId]);
const claimableRightAfterCreate = await receivableStream.read.claimableAmount([streamId]);

console.log("Stored start time:", stored.startTime.toString());
console.log("Stored end time:", stored.endTime.toString());
console.log("Stored duration:", storedDuration.toString());
console.log("Vested right after create:", vestedRightAfterCreate.toString());
console.log("Claimable right after create:", claimableRightAfterCreate.toString());

// listing 생성
console.log("Approving Marketplace to transfer recipient NFT...");
await receivableStream.write.approve(
    [marketplace.address, streamId],
    { account: recipient.account },
);

console.log("Listing receivable NFT...");
await marketplace.write.list(
    [streamId, salePrice],
    { account: recipient.account },
);

const listing = await marketplace.read.getListing([streamId]) as {
    seller: `0x${string}`;
    price: bigint;
};

console.log("Listing seller:", listing.seller);
console.log("Listing price:", listing.price.toString());

// buyer 구매
console.log("Minting MockUSDC to buyer...");
await mockUSDC.write.mint([buyer.account.address, salePrice]);

console.log("Approving Marketplace to spend buyer MockUSDC...");
await mockUSDC.write.approve(
    [marketplace.address, salePrice],
    { account: buyer.account },
);

const sellerBeforeBuy = await mockUSDC.read.balanceOf([recipient.account.address]);

console.log("Buying receivable NFT...");
await marketplace.write.buy(
    [streamId],
    { account: buyer.account },
);

const sellerAfterBuy = await mockUSDC.read.balanceOf([recipient.account.address]);

console.log("NFT owner after buy:", await receivableStream.read.ownerOf([streamId]));
console.log("Seller payment received:", (sellerAfterBuy - sellerBeforeBuy).toString());

// buyer claim
const claimTime = stored.startTime + (stored.endTime - stored.startTime) / 2n;

console.log("Moving time to claim point...");
const latestBeforeClaim = BigInt(await networkHelpers.time.latest());

if (latestBeforeClaim < claimTime) {
    await networkHelpers.time.increaseTo(Number(claimTime));
} else {
    console.log(
        "Claim point already reached:",
        latestBeforeClaim.toString(),
    );
}

const buyerBeforeClaim = await mockUSDC.read.balanceOf([buyer.account.address]);
const streamBeforeClaim = await mockUSDC.read.balanceOf([receivableStream.address]);

console.log("Buyer claiming vested amount...");
await receivableStream.write.claim(
    [streamId],
    { account: buyer.account },
);

const blockAfterClaim = await publicClient.getBlock();
const expectedClaim = vestedAt(
    depositAmount,
    stored.startTime,
    stored.endTime,
    blockAfterClaim.timestamp,
);

const buyerBalance = await mockUSDC.read.balanceOf([buyer.account.address]);
const streamBalance = await mockUSDC.read.balanceOf([receivableStream.address]);
const claimedDelta = buyerBalance - buyerBeforeClaim;
const streamDelta = streamBeforeClaim - streamBalance;

if (claimedDelta !== expectedClaim) {
    throw new Error("claimed amount does not match expected claim");
}

if (streamDelta !== expectedClaim) {
    throw new Error("stream balance decrease does not match expected claim");
}

console.log("Claim block timestamp:", blockAfterClaim.timestamp.toString());
console.log("Expected claim at block timestamp:", expectedClaim.toString());
console.log("Buyer claimed amount:", claimedDelta.toString());
console.log("Buyer balance after claim:", buyerBalance.toString());
console.log("Stream contract balance after claim:", streamBalance.toString());

console.log("Smoke test completed.");

