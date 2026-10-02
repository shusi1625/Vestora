import { network } from "hardhat";

const MOCK_USDC_ADDRESS = "0x7BadaD2E8FBA41CAb32AA30dfecD03AA816E4517";
const RECEIVABLE_STREAM_ADDRESS = "0x92BA9C82c417a0F2805a0227cB16dead1865a202";
const MARKETPLACE_ADDRESS = "0x8a01A13FbEBF6f974F8956558065e70017156579";

const { viem } = await network.create({
    network: "sepolia",
    chainType: "l1",
});

const [deployer] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();

async function waitForTx(hash: `0x${string}`) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== "success") {
        throw new Error(`Transaction failed: ${hash}`);
    }

    return receipt;
}

const mockUSDC = await viem.getContractAt("MockUSDC", MOCK_USDC_ADDRESS);
const receivableStream = await viem.getContractAt(
    "ReceivableStream",
    RECEIVABLE_STREAM_ADDRESS,
);
const marketplace = await viem.getContractAt(
    "ReceivableMarketplace",
    MARKETPLACE_ADDRESS,
);

console.log("Deployer:", deployer.account.address);

//테스트용 상수
const depositAmount = 1_000_000n;
const salePrice = 400_000n;

const startDelay = 30n;
const duration = 300n;

console.log("Start delay:", startDelay.toString());
console.log("Duration:", duration.toString());

//stream 생성
console.log("Minting MockUSDC to deployer...");
await waitForTx(
    await mockUSDC.write.mint([deployer.account.address, depositAmount + salePrice]),
);

console.log("Approving ReceivableStream...");
await waitForTx(
    await mockUSDC.write.approve([receivableStream.address, depositAmount]),
);

const streamId = await receivableStream.read.nextStreamId();

console.log("Creating stream...");
await waitForTx(
    await receivableStream.write.createStreamWithDuration([
        deployer.account.address,
        mockUSDC.address,
        depositAmount,
        startDelay,
        duration,
        false,
    ]),
);

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

//listing 생성
console.log("Approving Marketplace to transfer NFT...");
await waitForTx(
    await receivableStream.write.approve([marketplace.address, streamId]),
);

console.log("Listing receivable NFT...");
await waitForTx(
    await marketplace.write.list([streamId, salePrice]),
);

const listing = await marketplace.read.getListing([streamId]) as {
    seller: `0x${string}`;
    price: bigint;
};

console.log("Listing seller:", listing.seller);
console.log("Listing price:", listing.price.toString());


//buyer 구매
console.log("Approving Marketplace to spend payment token...");
await waitForTx(
    await mockUSDC.write.approve([marketplace.address, salePrice]),
);

const sellerBeforeBuy = await mockUSDC.read.balanceOf([deployer.account.address]);

console.log("Buying receivable NFT...");
await waitForTx(
    await marketplace.write.buy([streamId]),
);

const sellerAfterBuy = await mockUSDC.read.balanceOf([deployer.account.address]);

console.log("NFT owner after buy:", await receivableStream.read.ownerOf([streamId]));
console.log("Seller payment delta:", (sellerAfterBuy - sellerBeforeBuy).toString());

const listingAfterBuy = await marketplace.read.getListing([streamId]) as {
    seller: `0x${string}`;
    price: bigint;
};

console.log("Listing after buy seller:", listingAfterBuy.seller);
console.log("Listing after buy price:", listingAfterBuy.price.toString());

console.log("Sepolia smoke completed.");