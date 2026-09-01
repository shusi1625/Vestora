"use client";

import { useMemo, useState, type ReactNode } from "react";
import { isAddress, parseUnits, type Hex } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { sepolia } from "wagmi/chains";

import {
  erc20Abi,
  receivableMarketplaceAbi,
  receivableStreamAbi,
  sepoliaContracts,
} from "../lib/contracts";
import {
  formatTimestamp,
  formatTokenAmount,
  sameAddress,
  shortenAddress,
} from "../lib/format";

type TxState = {
  label: string;
  status: "idle" | "pending" | "success" | "error";
  message: string;
  hash?: Hex;
};

const zeroAddress = "0x0000000000000000000000000000000000000000";
const decimals = 6;

const initialTxState: TxState = {
  label: "",
  status: "idle",
  message: "No transaction yet.",
};

function parseStreamId(value: string) {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = BigInt(value);
  return parsed > BigInt(0) ? parsed : undefined;
}

function parsePositiveTokenAmount(value: string) {
  if (!value || Number(value) <= 0) {
    return undefined;
  }

  try {
    return parseUnits(value, decimals);
  } catch {
    return undefined;
  }
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();

  const [mintAmount, setMintAmount] = useState("1000");
  const [recipient, setRecipient] = useState("");
  const [streamAmount, setStreamAmount] = useState("100");
  const [startDelayMinutes, setStartDelayMinutes] = useState("1");
  const [durationMinutes, setDurationMinutes] = useState("10");
  const [cancelable, setCancelable] = useState(false);
  const [createdStreamId, setCreatedStreamId] = useState("");
  const [streamIdInput, setStreamIdInput] = useState("1");
  const [listingPrice, setListingPrice] = useState("40");
  const [txState, setTxState] = useState<TxState>(initialTxState);

  const metaMaskConnector = connectors.find((connector) =>
    connector.name.toLowerCase().includes("metamask"),
  );

  const isSepolia = chainId === sepolia.id;
  const canWrite = Boolean(isConnected && isSepolia && address && publicClient);
  const selectedStreamId = parseStreamId(streamIdInput);

  const mockUsdcName = useReadContract({
    address: sepoliaContracts.mockUSDC,
    abi: erc20Abi,
    functionName: "name",
  });

  const mockUsdcSymbol = useReadContract({
    address: sepoliaContracts.mockUSDC,
    abi: erc20Abi,
    functionName: "symbol",
  });

  const mockUsdcBalance = useReadContract({
    address: sepoliaContracts.mockUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
    },
  });

  const nextStreamId = useReadContract({
    address: sepoliaContracts.receivableStream,
    abi: receivableStreamAbi,
    functionName: "nextStreamId",
  });

  const marketplacePaymentToken = useReadContract({
    address: sepoliaContracts.receivableMarketplace,
    abi: receivableMarketplaceAbi,
    functionName: "paymentToken",
  });

  const marketplaceReceivableNft = useReadContract({
    address: sepoliaContracts.receivableMarketplace,
    abi: receivableMarketplaceAbi,
    functionName: "receivableNft",
  });

  const stream = useReadContract({
    address: sepoliaContracts.receivableStream,
    abi: receivableStreamAbi,
    functionName: "getStream",
    args: selectedStreamId ? [selectedStreamId] : undefined,
    query: {
      enabled: Boolean(selectedStreamId),
      retry: false,
    },
  });

  const vestedAmount = useReadContract({
    address: sepoliaContracts.receivableStream,
    abi: receivableStreamAbi,
    functionName: "vestedAmount",
    args: selectedStreamId ? [selectedStreamId] : undefined,
    query: {
      enabled: Boolean(selectedStreamId),
      retry: false,
    },
  });

  const claimableAmount = useReadContract({
    address: sepoliaContracts.receivableStream,
    abi: receivableStreamAbi,
    functionName: "claimableAmount",
    args: selectedStreamId ? [selectedStreamId] : undefined,
    query: {
      enabled: Boolean(selectedStreamId),
      retry: false,
    },
  });

  const streamOwner = useReadContract({
    address: sepoliaContracts.receivableStream,
    abi: receivableStreamAbi,
    functionName: "ownerOf",
    args: selectedStreamId ? [selectedStreamId] : undefined,
    query: {
      enabled: Boolean(selectedStreamId),
      retry: false,
    },
  });

  const listing = useReadContract({
    address: sepoliaContracts.receivableMarketplace,
    abi: receivableMarketplaceAbi,
    functionName: "getListing",
    args: selectedStreamId ? [selectedStreamId] : undefined,
    query: {
      enabled: Boolean(selectedStreamId),
      retry: false,
    },
  });

  const marketplaceChecks = useMemo(
    () => ({
      paymentToken: sameAddress(
        marketplacePaymentToken.data,
        sepoliaContracts.mockUSDC,
      ),
      receivableNft: sameAddress(
        marketplaceReceivableNft.data,
        sepoliaContracts.receivableStream,
      ),
    }),
    [marketplacePaymentToken.data, marketplaceReceivableNft.data],
  );

  const isListed = Boolean(
    listing.data && !sameAddress(listing.data.seller, zeroAddress),
  );

  async function refreshReads() {
    await Promise.all([
      mockUsdcBalance.refetch(),
      nextStreamId.refetch(),
      stream.refetch(),
      vestedAmount.refetch(),
      claimableAmount.refetch(),
      streamOwner.refetch(),
      listing.refetch(),
    ]);
  }

  async function runTransaction(label: string, action: () => Promise<Hex>) {
    if (!publicClient) {
      setTxState({
        label,
        status: "error",
        message: "Public client is not ready.",
      });
      return false;
    }

    try {
      setTxState({
        label,
        status: "pending",
        message: "Waiting for wallet confirmation...",
      });

      const hash = await action();

      setTxState({
        label,
        status: "pending",
        message: "Transaction submitted. Waiting for confirmation...",
        hash,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await refreshReads();

      setTxState({
        label,
        status: "success",
        message: "Transaction confirmed.",
        hash,
      });
      return true;
    } catch (error) {
      setTxState({
        label,
        status: "error",
        message: error instanceof Error ? error.message : "Transaction failed.",
      });
      return false;
    }
  }

  async function handleMint() {
    if (!address || !canWrite) {
      return;
    }

    const amount = parsePositiveTokenAmount(mintAmount);
    if (!amount) {
      setTxState({
        label: "Mint MockUSDC",
        status: "error",
        message: "Enter a positive mint amount.",
      });
      return;
    }

    await runTransaction("Mint MockUSDC", () =>
      writeContractAsync({
        address: sepoliaContracts.mockUSDC,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, amount],
      }),
    );
  }

  async function handleCreateStream() {
    if (!canWrite) {
      return;
    }

    if (!isAddress(recipient)) {
      setTxState({
        label: "Create Stream",
        status: "error",
        message: "Enter a valid recipient address.",
      });
      return;
    }

    const amount = parsePositiveTokenAmount(streamAmount);
    const startDelay = Number(startDelayMinutes);
    const duration = Number(durationMinutes);

    if (!amount || startDelay < 0 || duration <= 0) {
      setTxState({
        label: "Create Stream",
        status: "error",
        message: "Enter a positive amount and duration.",
      });
      return;
    }

    const approved = await runTransaction("Approve Stream Escrow", () =>
      writeContractAsync({
        address: sepoliaContracts.mockUSDC,
        abi: erc20Abi,
        functionName: "approve",
        args: [sepoliaContracts.receivableStream, amount],
      }),
    );

    if (!approved) {
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const startTime = BigInt(now + Math.floor(startDelay * 60));
    const endTime = startTime + BigInt(Math.floor(duration * 60));
    const streamIdBeforeCreate = nextStreamId.data?.toString() ?? "";

    await runTransaction("Create Stream", () =>
      writeContractAsync({
        address: sepoliaContracts.receivableStream,
        abi: receivableStreamAbi,
        functionName: "createStream",
        args: [
          recipient,
          sepoliaContracts.mockUSDC,
          amount,
          startTime,
          endTime,
          cancelable,
        ],
      }),
    );

    if (streamIdBeforeCreate) {
      setCreatedStreamId(streamIdBeforeCreate);
      setStreamIdInput(streamIdBeforeCreate);
    }
  }

  async function handleClaim() {
    if (!canWrite || !selectedStreamId) {
      return;
    }

    await runTransaction("Claim Stream", () =>
      writeContractAsync({
        address: sepoliaContracts.receivableStream,
        abi: receivableStreamAbi,
        functionName: "claim",
        args: [selectedStreamId],
      }),
    );
  }

  async function handleList() {
    if (!canWrite || !selectedStreamId) {
      return;
    }

    const price = parsePositiveTokenAmount(listingPrice);
    if (!price) {
      setTxState({
        label: "List Receivable",
        status: "error",
        message: "Enter a positive listing price.",
      });
      return;
    }

    const approved = await runTransaction("Approve Marketplace NFT Transfer", () =>
      writeContractAsync({
        address: sepoliaContracts.receivableStream,
        abi: receivableStreamAbi,
        functionName: "approve",
        args: [sepoliaContracts.receivableMarketplace, selectedStreamId],
      }),
    );

    if (!approved) {
      return;
    }

    await runTransaction("List Receivable", () =>
      writeContractAsync({
        address: sepoliaContracts.receivableMarketplace,
        abi: receivableMarketplaceAbi,
        functionName: "list",
        args: [selectedStreamId, price],
      }),
    );
  }

  async function handleCancelListing() {
    if (!canWrite || !selectedStreamId) {
      return;
    }

    await runTransaction("Cancel Listing", () =>
      writeContractAsync({
        address: sepoliaContracts.receivableMarketplace,
        abi: receivableMarketplaceAbi,
        functionName: "cancelListing",
        args: [selectedStreamId],
      }),
    );
  }

  async function handleBuy() {
    if (!canWrite || !selectedStreamId || !listing.data) {
      return;
    }

    const approved = await runTransaction("Approve Marketplace Payment", () =>
      writeContractAsync({
        address: sepoliaContracts.mockUSDC,
        abi: erc20Abi,
        functionName: "approve",
        args: [sepoliaContracts.receivableMarketplace, listing.data.price],
      }),
    );

    if (!approved) {
      return;
    }

    await runTransaction("Buy Receivable", () =>
      writeContractAsync({
        address: sepoliaContracts.receivableMarketplace,
        abi: receivableMarketplaceAbi,
        functionName: "buy",
        args: [selectedStreamId],
      }),
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Vestora</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Transferable on-chain receivables
            </p>
          </div>

          {isConnected ? (
            <button
              type="button"
              onClick={() => disconnect()}
              className="w-full rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 sm:w-auto"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (metaMaskConnector) {
                  connect({ connector: metaMaskConnector });
                }
              }}
              disabled={!metaMaskConnector || isConnecting}
              className="w-full rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isConnecting ? "Connecting..." : "Connect MetaMask"}
            </button>
          )}
        </header>

        {!isSepolia && isConnected ? (
          <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            This app is connected to Sepolia contracts. Please switch MetaMask
            to Sepolia before sending transactions.
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <InfoPanel title="Wallet">
            <InfoRow label="Connected" value={isConnected ? "Yes" : "No"} />
            <InfoRow label="Address" value={shortenAddress(address)} />
            <InfoRow
              label="Network"
              value={isSepolia ? "Sepolia" : "Unsupported"}
            />
          </InfoPanel>

          <InfoPanel title="Token">
            <InfoRow
              label="MockUSDC"
              value={`${mockUsdcName.data ?? "-"} (${mockUsdcSymbol.data ?? "-"})`}
            />
            <InfoRow
              label="Your Balance"
              value={formatTokenAmount(mockUsdcBalance.data, decimals)}
            />
            <InfoRow
              label="Next Stream ID"
              value={nextStreamId.data?.toString() ?? "-"}
            />
          </InfoPanel>

          <InfoPanel title="Marketplace Checks">
            <InfoRow
              label="Payment Token"
              value={marketplaceChecks.paymentToken ? "OK" : "Mismatch"}
            />
            <InfoRow
              label="Receivable NFT"
              value={marketplaceChecks.receivableNft ? "OK" : "Mismatch"}
            />
            <InfoRow
              label="Marketplace"
              value={shortenAddress(sepoliaContracts.receivableMarketplace)}
            />
          </InfoPanel>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium">Transaction Status</h2>
              <p className="mt-1 text-sm text-zinc-400">{txState.message}</p>
            </div>
            <span
              className={`rounded-md px-3 py-1 text-xs font-medium ${statusClassName(
                txState.status,
              )}`}
            >
              {txState.label || "Idle"}
            </span>
          </div>
          {txState.hash ? (
            <a
              href={`https://sepolia.etherscan.io/tx/${txState.hash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-sky-300 hover:text-sky-200"
            >
              View transaction
            </a>
          ) : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <ActionPanel title="1. Prepare MockUSDC">
            <label className="grid gap-2 text-sm">
              <span className="text-zinc-400">Mint amount</span>
              <input
                value={mintAmount}
                onChange={(event) => setMintAmount(event.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50 outline-none focus:border-sky-400"
              />
            </label>
            <button
              type="button"
              onClick={handleMint}
              disabled={!canWrite || isWriting}
              className="rounded-md bg-sky-400 px-4 py-2 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Mint MockUSDC
            </button>
          </ActionPanel>

          <ActionPanel title="2. Create Stream">
            <label className="grid gap-2 text-sm">
              <span className="text-zinc-400">Recipient address</span>
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder={address ?? "0x..."}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50 outline-none focus:border-sky-400"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-2 text-sm">
                <span className="text-zinc-400">Amount</span>
                <input
                  value={streamAmount}
                  onChange={(event) => setStreamAmount(event.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50 outline-none focus:border-sky-400"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-zinc-400">Start delay min</span>
                <input
                  value={startDelayMinutes}
                  onChange={(event) => setStartDelayMinutes(event.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50 outline-none focus:border-sky-400"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-zinc-400">Duration min</span>
                <input
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50 outline-none focus:border-sky-400"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={cancelable}
                onChange={(event) => setCancelable(event.target.checked)}
              />
              Cancelable stream
            </label>
            <button
              type="button"
              onClick={handleCreateStream}
              disabled={!canWrite || isWriting}
              className="rounded-md bg-sky-400 px-4 py-2 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Approve and Create Stream
            </button>
            {createdStreamId ? (
              <p className="text-sm text-zinc-400">
                Created stream ID: {createdStreamId}
              </p>
            ) : null}
          </ActionPanel>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="grid gap-2 text-sm">
              <span className="text-zinc-400">Selected stream ID</span>
              <input
                value={streamIdInput}
                onChange={(event) => setStreamIdInput(event.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50 outline-none focus:border-sky-400 sm:w-56"
              />
            </label>
            <button
              type="button"
              onClick={refreshReads}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
            >
              Refresh
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <InfoPanel title="3. Stream Details">
              <InfoRow label="Owner" value={shortenAddress(streamOwner.data)} />
              <InfoRow label="Sender" value={shortenAddress(stream.data?.sender)} />
              <InfoRow
                label="Deposited"
                value={formatTokenAmount(stream.data?.depositedAmount, decimals)}
              />
              <InfoRow
                label="Withdrawn"
                value={formatTokenAmount(stream.data?.withdrawnAmount, decimals)}
              />
              <InfoRow
                label="Vested"
                value={formatTokenAmount(vestedAmount.data, decimals)}
              />
              <InfoRow
                label="Claimable"
                value={formatTokenAmount(claimableAmount.data, decimals)}
              />
              <InfoRow label="Start" value={formatTimestamp(stream.data?.startTime)} />
              <InfoRow label="End" value={formatTimestamp(stream.data?.endTime)} />
              <InfoRow
                label="Status"
                value={stream.data?.canceled ? "Canceled" : "Active or scheduled"}
              />
              <button
                type="button"
                onClick={handleClaim}
                disabled={!canWrite || !selectedStreamId || isWriting}
                className="mt-2 rounded-md bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Claim Vested Tokens
              </button>
            </InfoPanel>

            <ActionPanel title="4. Marketplace">
              <InfoRow
                label="Listing seller"
                value={shortenAddress(listing.data?.seller)}
              />
              <InfoRow
                label="Listing price"
                value={formatTokenAmount(listing.data?.price, decimals)}
              />
              <label className="grid gap-2 text-sm">
                <span className="text-zinc-400">Price</span>
                <input
                  value={listingPrice}
                  onChange={(event) => setListingPrice(event.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50 outline-none focus:border-sky-400"
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={handleList}
                  disabled={!canWrite || !selectedStreamId || isWriting}
                  className="rounded-md bg-sky-400 px-4 py-2 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Approve and List
                </button>
                <button
                  type="button"
                  onClick={handleCancelListing}
                  disabled={!canWrite || !selectedStreamId || !isListed || isWriting}
                  className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel Listing
                </button>
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={!canWrite || !selectedStreamId || !isListed || isWriting}
                  className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Approve and Buy
                </button>
              </div>
            </ActionPanel>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-lg font-medium">{title}</h2>
      <dl className="mt-4 grid gap-3 text-sm">{children}</dl>
    </section>
  );
}

function ActionPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs uppercase text-zinc-500">{label}</dt>
      <dd className="break-all text-zinc-200">{value}</dd>
    </div>
  );
}

function statusClassName(status: TxState["status"]) {
  if (status === "pending") {
    return "bg-amber-400/15 text-amber-200";
  }

  if (status === "success") {
    return "bg-emerald-400/15 text-emerald-200";
  }

  if (status === "error") {
    return "bg-red-400/15 text-red-200";
  }

  return "bg-zinc-800 text-zinc-300";
}
