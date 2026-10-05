import { network } from "hardhat";

const { viem, networkHelpers } = await network.create();
const [sender, recipient, buyer] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();

const AMOUNT = 1_000_000n;
const PRICE = 400_000n;
const DURATION = 1_000n;

type GasResult = {
    functionName: string;
    scenario: string;
    gasUsed: bigint;
};

const results: GasResult[] = [];

async function measureGas(
    functionName: string,
    scenario: string,
    sendTransaction: () => Promise<`0x${string}`>,
) {
    const hash = await sendTransaction();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== "success") {
        throw new Error(`${functionName} measurement transaction failed`);
    }

    results.push({
        functionName,
        scenario,
        gasUsed: receipt.gasUsed,
    });
}

async function deploySuite() {
    const stream = await viem.deployContract("ReceivableStream");
    const token = await viem.deployContract("MockUSDC");
    const marketplace = await viem.deployContract("ReceivableMarketplace", [
        stream.address,
        token.address,
    ]);

    return { stream, token, marketplace };
}

async function createStreamFor(
    options: {
        cancelable?: boolean;
        owner?: `0x${string}`;
    } = {},
) {
    const { stream, token, marketplace } = await deploySuite();
    const owner = options.owner ?? recipient.account.address;
    const cancelable = options.cancelable ?? false;

    await token.write.mint([sender.account.address, AMOUNT]);
    await token.write.approve([stream.address, AMOUNT]);

    const streamId = await stream.read.nextStreamId();

    await stream.write.createStreamWithDuration([
        owner,
        token.address,
        AMOUNT,
        0n,
        DURATION,
        cancelable,
    ]);

    return {
        stream,
        token,
        marketplace,
        streamId,
    };
}

async function createListedStream() {
    const { stream, token, marketplace, streamId } = await createStreamFor();

    await stream.write.approve(
        [marketplace.address, streamId],
        { account: recipient.account },
    );

    await marketplace.write.list(
        [streamId, PRICE],
        { account: recipient.account },
    );

    await token.write.mint([buyer.account.address, PRICE]);
    await token.write.approve(
        [marketplace.address, PRICE],
        { account: buyer.account },
    );

    return {
        stream,
        token,
        marketplace,
        streamId,
    };
}

async function measureCreateStreamWithDuration() {
    const { stream, token } = await deploySuite();

    await token.write.mint([sender.account.address, AMOUNT]);
    await token.write.approve([stream.address, AMOUNT]);

    await measureGas(
        "createStreamWithDuration",
        "fully funded stream, recipient NFT mint, non-cancelable",
        () =>
            stream.write.createStreamWithDuration([
                recipient.account.address,
                token.address,
                AMOUNT,
                0n,
                DURATION,
                false,
            ]),
    );
}

async function measureClaim() {
    const { stream, streamId } = await createStreamFor();
    const stored = await stream.read.getStream([streamId]);
    const claimTime = stored.startTime + (stored.endTime - stored.startTime) / 2n;

    await networkHelpers.time.increaseTo(Number(claimTime));

    await measureGas(
        "claim",
        "recipient claims halfway through active stream",
        () => stream.write.claim([streamId], { account: recipient.account }),
    );
}

async function measureCancel() {
    const { stream, streamId } = await createStreamFor({ cancelable: true });
    const stored = await stream.read.getStream([streamId]);
    const cancelTime = stored.startTime + (stored.endTime - stored.startTime) / 2n;

    await networkHelpers.time.increaseTo(Number(cancelTime));

    await measureGas(
        "cancel",
        "sender cancels cancelable stream halfway through active stream",
        () => stream.write.cancel([streamId]),
    );
}

async function measureList() {
    const { stream, marketplace, streamId } = await createStreamFor();

    await stream.write.approve(
        [marketplace.address, streamId],
        { account: recipient.account },
    );

    await measureGas(
        "list",
        "recipient lists approved receivable NFT",
        () => marketplace.write.list([streamId, PRICE], { account: recipient.account }),
    );
}

async function measureCancelListing() {
    const { marketplace, streamId } = await createListedStream();

    await measureGas(
        "cancelListing",
        "seller cancels active listing",
        () =>
            marketplace.write.cancelListing(
                [streamId],
                { account: recipient.account },
            ),
    );
}

async function measureBuy() {
    const { marketplace, streamId } = await createListedStream();

    await measureGas(
        "buy",
        "buyer purchases active listing without protection parameters",
        () => marketplace.write.buy([streamId], { account: buyer.account }),
    );
}

async function measureBuyWithProtection() {
    const { marketplace, streamId } = await createListedStream();

    await measureGas(
        "buyWithProtection",
        "buyer purchases active listing with latest snapshot protection",
        () =>
            marketplace.write.buyWithProtection(
                [streamId, PRICE, AMOUNT, 0n, recipient.account.address],
                { account: buyer.account },
            ),
    );
}

await measureCreateStreamWithDuration();
await measureClaim();
await measureCancel();
await measureList();
await measureCancelListing();
await measureBuy();
await measureBuyWithProtection();

console.log("# Gas Baseline Results");
console.log("");
console.log("| Function | Scenario | Gas Used |");
console.log("| --- | --- | --- |");

for (const result of results) {
    console.log(
        `| \`${result.functionName}\` | ${result.scenario} | ${result.gasUsed.toString()} |`,
    );
}
