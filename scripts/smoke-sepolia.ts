import { network } from "hardhat";

const MOCK_USDC_ADDRESS = "0x0Be84c36624AAa119D63497886629E21738Efd31";
const RECEIVABLE_STREAM_ADDRESS = "0xD689c4DFe4a8b44a75692421Abb3756fE93dFc59";
const MARKETPLACE_ADDRESS = "0xe190C2C25388F68417546D76f30A26909213E8c3";

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

const latestBlock = await publicClient.getBlock();
const now = latestBlock.timestamp;

const startTime = now + 30n;
const endTime = now + 300n;

console.log("Start time:", startTime.toString());
console.log("End time:", endTime.toString());

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
    await receivableStream.write.createStream([
        deployer.account.address,
        mockUSDC.address,
        depositAmount,
        startTime,
        endTime,
        false,
    ]),
);

console.log("Stream created:", streamId.toString());
console.log("NFT owner:", await receivableStream.read.ownerOf([streamId]));

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