"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { isAddress, parseUnits, type Address, type Hex } from "viem";
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
  fetchListings,
  fetchMarketStats,
  fetchMetrics,
  fetchStream,
  fetchUserStreams,
  fetchUserTrades,
  VestoraApiError,
  type ListingStatus,
} from "../lib/api";
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
  phase:
    | "idle"
    | "wallet_confirmation"
    | "submitted"
    | "confirming"
    | "refreshing_onchain"
    | "indexing_pending"
    | "error";
  message: string;
  hash?: Hex;
  confirmedBlockNumber?: bigint;
};

type OnchainListing = {
  seller: Address;
  price: bigint;
};

type OnchainStream = {
  sender: Address;
  token: Address;
  depositedAmount: bigint;
  startTime: bigint;
  endTime: bigint;
  withdrawnAmount: bigint;
  cancelable: boolean;
  canceled: boolean;
  canceledAt: bigint;
};

const zeroAddress = "0x0000000000000000000000000000000000000000";
const decimals = 6;

const initialTxState: TxState = {
  label: "",
  status: "idle",
  phase: "idle",
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

function formatApiTokenAmount(value?: string | null) {
  if (!value) {
    return "-";
  }

  try {
    return formatTokenAmount(BigInt(value), decimals);
  } catch {
    return "-";
  }
}

function formatApiTimestamp(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function formatBps(value?: number | null) {
  if (value === undefined || value === null) {
    return "-";
  }

  return `${(value / 100).toFixed(2)}%`;
}

function formatRiskLabels(labels?: string[] | null) {
  if (!labels?.length) {
    return "-";
  }

  return labels.join(", ");
}

function parseBlockNumber(value?: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function shortenHash(hash?: Hex) {
  if (!hash) {
    return "-";
  }

  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function txPhaseLabel(phase: TxState["phase"]) {
  switch (phase) {
    case "wallet_confirmation":
      return "Waiting for wallet";
    case "submitted":
      return "Submitted";
    case "confirming":
      return "Waiting for block";
    case "refreshing_onchain":
      return "Refreshing on-chain";
    case "indexing_pending":
      return "Backend indexing";
    case "error":
      return "Error";
    default:
      return "Idle";
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
  const [buyPreflightMessage, setBuyPreflightMessage] =
    useState("Not checked yet.");

  const metaMaskConnector = connectors.find((connector) =>
    connector.name.toLowerCase().includes("metamask"),
  );

  const isSepolia = chainId === sepolia.id;
  const canWrite = Boolean(isConnected && isSepolia && address && publicClient);
  const selectedStreamId = parseStreamId(streamIdInput);
  const selectedStreamIdText = selectedStreamId?.toString();

  const marketStats = useQuery({
    queryKey: ["market-stats"],
    queryFn: fetchMarketStats,
    refetchInterval: 15_000,
  });

  const indexerMetrics = useQuery({
    queryKey: ["indexer-metrics"],
    queryFn: fetchMetrics,
    refetchInterval: 15_000,
  });

  const backendListings = useQuery({
    queryKey: ["listings"],
    queryFn: () => fetchListings(),
    refetchInterval: 15_000,
  });

  const backendStream = useQuery({
    queryKey: ["stream", selectedStreamIdText],
    queryFn: () => fetchStream(selectedStreamIdText ?? ""),
    enabled: Boolean(selectedStreamIdText),
    retry: false,
    refetchInterval: 15_000,
  });

  const userStreams = useQuery({
    queryKey: ["user-streams", address?.toLowerCase()],
    queryFn: () => fetchUserStreams(address ?? zeroAddress),
    enabled: Boolean(address),
    refetchInterval: 15_000,
  });

  const userTrades = useQuery({
    queryKey: ["user-trades", address?.toLowerCase()],
    queryFn: () => fetchUserTrades(address ?? zeroAddress),
    enabled: Boolean(address),
    refetchInterval: 15_000,
  });

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
  const newestBackendReadAt = Math.max(
    marketStats.dataUpdatedAt,
    indexerMetrics.dataUpdatedAt,
    backendListings.dataUpdatedAt,
    backendStream.dataUpdatedAt,
    userStreams.dataUpdatedAt,
    userTrades.dataUpdatedAt,
  );
  const backendIsStale =
    newestBackendReadAt > 0 && Date.now() - newestBackendReadAt > 30_000;
  const backendStreamNotIndexed =
    backendStream.error instanceof VestoraApiError &&
    backendStream.error.status === 404;
  const backendApiUnavailable =
    marketStats.isError ||
    indexerMetrics.isError ||
    backendListings.isError ||
    userStreams.isError ||
    userTrades.isError ||
    (backendStream.isError && !backendStreamNotIndexed);
  const backendSelectedStream = backendStream.data?.data;
  const backendSelectedListing =
    backendSelectedStream?.listing ??
    backendListings.data?.data.find(
      (item) => item.streamId === selectedStreamIdText,
    ) ??
    null;
  const latestIndexedBlock = parseBlockNumber(
    indexerMetrics.data?.indexer.latestIndexedBlock,
  );
  const transactionBackendIndexed =
    txState.confirmedBlockNumber !== undefined &&
    latestIndexedBlock !== undefined &&
    latestIndexedBlock >= txState.confirmedBlockNumber;
  const transactionBackendIndexingStatus =
    txState.confirmedBlockNumber === undefined
      ? "No confirmed transaction"
      : indexerMetrics.isError
        ? "Indexer status unavailable"
        : transactionBackendIndexed
          ? "Indexed"
          : `Pending block ${txState.confirmedBlockNumber.toString()}`;

  const selectedListingRiskLabels =
    backendSelectedListing?.computed.riskLabels ?? [];

  async function refreshOnchainReads() {
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

  async function refreshBackendReads() {
    const readRefreshes: Promise<unknown>[] = [
      marketStats.refetch(),
      indexerMetrics.refetch(),
      backendListings.refetch(),
      userStreams.refetch(),
      userTrades.refetch(),
    ];

    if (selectedStreamIdText) {
      readRefreshes.push(backendStream.refetch());
    }

    await Promise.all(readRefreshes);
  }

  async function refreshReads() {
    await Promise.all([refreshOnchainReads(), refreshBackendReads()]);
  }

  async function runTransaction(label: string, action: () => Promise<Hex>) {
    if (!publicClient) {
      setTxState({
        label,
        status: "error",
        phase: "error",
        message: "Public client is not ready.",
      });
      return false;
    }

    try {
      setTxState({
        label,
        status: "pending",
        phase: "wallet_confirmation",
        message: "Waiting for wallet confirmation...",
      });

      const hash = await action();

      setTxState({
        label,
        status: "pending",
        phase: "submitted",
        message: "Transaction submitted. Hash is available.",
        hash,
      });

      setTxState({
        label,
        status: "pending",
        phase: "confirming",
        message: "Waiting for block confirmation...",
        hash,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== "success") {
        throw new Error("Transaction reverted.");
      }

      setTxState({
        label,
        status: "pending",
        phase: "refreshing_onchain",
        message: "Transaction confirmed. Refreshing on-chain reads...",
        hash,
        confirmedBlockNumber: receipt.blockNumber,
      });

      await refreshOnchainReads();
      void refreshBackendReads();

      setTxState({
        label,
        status: "success",
        phase: "indexing_pending",
        message: "On-chain confirmed. Backend indexing may still be pending.",
        hash,
        confirmedBlockNumber: receipt.blockNumber,
      });
      return true;
    } catch (error) {
      setTxState({
        label,
        status: "error",
        phase: "error",
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
        phase: "error",
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
        phase: "error",
        message: "Enter a valid recipient address.",
      });
      return;
    }

    const amount = parsePositiveTokenAmount(streamAmount);
    const startDelay = BigInt(Math.floor(Number(startDelayMinutes) * 60));
    const duration = BigInt(Math.floor(Number(durationMinutes) * 60));

    if (!amount || startDelay < 0 || duration <= 0) {
      setTxState({
        label: "Create Stream",
        status: "error",
        phase: "error",
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

    const streamIdBeforeCreate = nextStreamId.data?.toString() ?? "";

    await runTransaction("Create Stream", () =>
      writeContractAsync({
        address: sepoliaContracts.receivableStream,
        abi: receivableStreamAbi,
        functionName: "createStreamWithDuration",
        args: [
          recipient,
          sepoliaContracts.mockUSDC,
          amount,
          startDelay,
          duration,
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
        phase: "error",
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

  async function runBuyPreflight() {
    if (!publicClient || !selectedStreamId) {
      return undefined;
    }

    try {
      setTxState({
        label: "Buy Preflight",
        status: "pending",
        phase: "refreshing_onchain",
        message: "Rechecking latest on-chain listing and stream value...",
      });
      setBuyPreflightMessage("Checking latest on-chain state...");

      const [
        latestListing,
        latestOwner,
        latestStream,
        latestVestedAmount,
        latestClaimableAmount,
      ] = await Promise.all([
        publicClient.readContract({
          address: sepoliaContracts.receivableMarketplace,
          abi: receivableMarketplaceAbi,
          functionName: "getListing",
          args: [selectedStreamId],
        }) as Promise<OnchainListing>,
        publicClient.readContract({
          address: sepoliaContracts.receivableStream,
          abi: receivableStreamAbi,
          functionName: "ownerOf",
          args: [selectedStreamId],
        }) as Promise<Address>,
        publicClient.readContract({
          address: sepoliaContracts.receivableStream,
          abi: receivableStreamAbi,
          functionName: "getStream",
          args: [selectedStreamId],
        }) as Promise<OnchainStream>,
        publicClient.readContract({
          address: sepoliaContracts.receivableStream,
          abi: receivableStreamAbi,
          functionName: "vestedAmount",
          args: [selectedStreamId],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: sepoliaContracts.receivableStream,
          abi: receivableStreamAbi,
          functionName: "claimableAmount",
          args: [selectedStreamId],
        }) as Promise<bigint>,
      ]);

      if (sameAddress(latestListing.seller, zeroAddress)) {
        throw new Error("This stream is not currently listed.");
      }

      if (!sameAddress(latestOwner, latestListing.seller)) {
        throw new Error("Listing seller no longer owns this receivable NFT.");
      }

      if (listing.data && latestListing.price !== listing.data.price) {
        throw new Error("Listing price changed. Refresh before buying.");
      }

      const settlementCeiling = latestStream.canceled
        ? latestVestedAmount
        : latestStream.depositedAmount;
      const remainingReceivable =
        settlementCeiling > latestStream.withdrawnAmount
          ? settlementCeiling - latestStream.withdrawnAmount
          : BigInt(0);

      if (remainingReceivable === BigInt(0)) {
        throw new Error("No receivable value remains.");
      }

      if (latestListing.price > remainingReceivable) {
        throw new Error(
          "Listing price is above the latest remaining receivable value.",
        );
      }

      const message = `OK. Remaining ${formatTokenAmount(
        remainingReceivable,
        decimals,
      )}, claimable now ${formatTokenAmount(
        latestClaimableAmount,
        decimals,
      )}.`;

      setBuyPreflightMessage(message);
      setTxState({
        label: "Buy Preflight",
        status: "success",
        phase: "refreshing_onchain",
        message,
      });

      return {
        seller: latestListing.seller,
        price: latestListing.price,
        remainingReceivable,
        withdrawnAmount: latestStream.withdrawnAmount,
        claimableAmount: latestClaimableAmount,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Buy preflight failed.";

      setBuyPreflightMessage(message);
      setTxState({
        label: "Buy Preflight",
        status: "error",
        phase: "error",
        message,
      });

      return undefined;
    }
  }

  async function handleBuy() {
    if (!canWrite || !selectedStreamId || !listing.data) {
      return;
    }

    const firstPreflight = await runBuyPreflight();

    if (!firstPreflight) {
      return;
    }

    const approved = await runTransaction("Approve Marketplace Payment", () =>
      writeContractAsync({
        address: sepoliaContracts.mockUSDC,
        abi: erc20Abi,
        functionName: "approve",
        args: [sepoliaContracts.receivableMarketplace, firstPreflight.price],
      }),
    );

    if (!approved) {
      return;
    }

    const finalPreflight = await runBuyPreflight();

    if (!finalPreflight) {
      return;
    }

    await runTransaction("Buy Receivable", () =>
      writeContractAsync({
        address: sepoliaContracts.receivableMarketplace,
        abi: receivableMarketplaceAbi,
        functionName: "buyWithProtection",
        args: [
          selectedStreamId,
          finalPreflight.price,
          finalPreflight.remainingReceivable,
          finalPreflight.withdrawnAmount,
          finalPreflight.seller,
        ],
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

        {backendApiUnavailable ? (
          <section className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
            Backend API data is unavailable. Transaction buttons still use
            on-chain reads, but marketplace and dashboard projections may be
            missing until the API is reachable.
          </section>
        ) : null}

        {backendStreamNotIndexed && selectedStreamIdText ? (
          <section className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-4 text-sm text-sky-100">
            Stream #{selectedStreamIdText} is not indexed by the backend yet.
            On-chain reads remain authoritative while the indexer catches up.
          </section>
        ) : null}

        {backendIsStale ? (
          <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            Backend projection data may be stale. Use Refresh before comparing
            marketplace values or preparing a transaction.
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoPanel title="Wallet">
            <InfoRow label="Connected" value={isConnected ? "Yes" : "No"} />
            <InfoRow label="Address" value={shortenAddress(address)} />
            <InfoRow
              label="Network"
              value={
                !isConnected ? "Not connected" : isSepolia ? "Sepolia" : "Unsupported"
              }
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

          <InfoPanel title="Backend API">
            <InfoRow
              label="Status"
              value={
                marketStats.isLoading
                  ? "Loading"
                  : backendApiUnavailable
                    ? "Error"
                    : "OK"
              }
            />
            <InfoRow
              label="Indexer"
              value={indexerMetrics.data?.indexer.status ?? "-"}
            />
            <InfoRow
              label="Lag blocks"
              value={indexerMetrics.data?.indexer.lagBlocks ?? "-"}
            />
            <InfoRow
              label="Streams"
              value={marketStats.data?.data.streams.total ?? "-"}
            />
            <InfoRow
              label="Listings"
              value={marketStats.data?.data.listings.total ?? "-"}
            />
            <InfoRow
              label="Trades"
              value={marketStats.data?.data.trades.total ?? "-"}
            />
            <InfoRow
              label="Last API read"
              value={
                newestBackendReadAt > 0
                  ? new Date(newestBackendReadAt).toLocaleTimeString()
                  : "-"
              }
            />
            <InfoRow
              label="Estimate basis"
              value={formatApiTimestamp(
                marketStats.data?.meta?.projection?.latestIndexedBlockTimestamp ??
                  indexerMetrics.data?.indexer.latestIndexedBlockTimestamp,
              )}
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
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <InfoRow label="Phase" value={txPhaseLabel(txState.phase)} />
            <InfoRow label="Tx hash" value={shortenHash(txState.hash)} />
            <InfoRow
              label="Confirmed block"
              value={txState.confirmedBlockNumber?.toString() ?? "-"}
            />
            <InfoRow
              label="Backend indexing"
              value={transactionBackendIndexingStatus}
            />
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

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium">Backend Marketplace</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Listings are loaded from the backend projection API. Recheck
                on-chain ownership before buying.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshReads}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
            >
              Refresh API
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <InfoRow
              label="Active value"
              value={formatApiTokenAmount(
                marketStats.data?.data.listings.activeValue,
              )}
            />
            <InfoRow
              label="Sold listings"
              value={marketStats.data?.data.listings.byStatus.SOLD ?? "-"}
            />
            <InfoRow
              label="Invalidated"
              value={
                marketStats.data?.data.listings.byStatus.INVALIDATED ?? "-"
              }
            />
          </div>

          <div className="mt-5 grid gap-3">
            {backendListings.isLoading ? (
              <p className="text-sm text-zinc-400">Loading listings...</p>
            ) : backendListings.data?.data.length ? (
              backendListings.data.data.map((item) => (
                <button
                  key={item.streamId}
                  type="button"
                  onClick={() => setStreamIdInput(item.streamId)}
                  className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-left hover:border-sky-500/60 md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
                >
                  <div>
                    <p className="text-xs uppercase text-zinc-500">
                      Stream #{item.streamId}
                    </p>
                    <p className="mt-1 text-sm text-zinc-200">
                      Seller {shortenAddress(item.seller)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-zinc-500">Price</p>
                    <p className="mt-1 text-sm text-zinc-200">
                      {formatApiTokenAmount(item.price)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-zinc-500">
                      Remaining / Yield
                    </p>
                    <p className="mt-1 text-sm text-zinc-200">
                      {formatApiTokenAmount(
                        item.computed.remainingReceivable,
                      )}{" "}
                      / {formatBps(item.computed.expectedYieldBps)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-zinc-500">
                      Risk
                    </p>
                    <p className="mt-1 text-sm text-zinc-200">
                      {formatRiskLabels(item.computed.riskLabels)}
                    </p>
                  </div>
                  <div className="flex items-center md:justify-end">
                    <span
                      className={`rounded-md px-3 py-1 text-xs font-medium ${listingStatusClassName(
                        item.status,
                      )}`}
                    >
                      {item.status}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-sm text-zinc-400">
                No projected listings returned by the backend API.
              </p>
            )}
          </div>
        </section>

        {address ? (
          <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-medium">Backend User Dashboard</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  User streams and trades are loaded from the backend API.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-64">
                <InfoRow
                  label="Streams"
                  value={String(userStreams.data?.meta.count ?? "-")}
                />
                <InfoRow
                  label="Trades"
                  value={String(userTrades.data?.meta.count ?? "-")}
                />
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {userStreams.isLoading ? (
                <p className="text-sm text-zinc-400">Loading user streams...</p>
              ) : userStreams.data?.data.length ? (
                userStreams.data.data.slice(0, 4).map((item) => (
                  <button
                    key={item.streamId}
                    type="button"
                    onClick={() => setStreamIdInput(item.streamId)}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-left hover:border-sky-500/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase text-zinc-500">
                          Stream #{item.streamId}
                        </p>
                        <p className="mt-1 text-sm text-zinc-200">
                          {item.userRoles?.join(", ") || "related"}
                        </p>
                      </div>
                      <span className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                        {item.riskLabel}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <InfoRow
                        label="Remaining"
                        value={formatApiTokenAmount(
                          item.computed.remainingReceivable,
                        )}
                      />
                      <InfoRow
                        label="Estimate"
                        value={formatApiTokenAmount(
                          item.computed.claimableEstimate,
                        )}
                      />
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-zinc-400">
                  No user streams returned by the backend API.
                </p>
              )}
            </div>
          </section>
        ) : null}

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
              <InfoRow
                label="Backend owner"
                value={shortenAddress(
                  backendSelectedStream?.currentOwner ?? undefined,
                )}
              />
              <InfoRow
                label="Backend remaining"
                value={formatApiTokenAmount(
                  backendSelectedStream?.computed.remainingReceivable,
                )}
              />
              <InfoRow
                label="Backend estimate"
                value={formatApiTokenAmount(
                  backendSelectedStream?.computed.claimableEstimate,
                )}
              />
              <InfoRow
                label="Risk"
                value={backendSelectedStream?.riskLabel ?? "-"}
              />
              <InfoRow
                label="Estimate basis"
                value={formatApiTimestamp(
                  backendSelectedStream?.computed.estimateTimestamp,
                )}
              />
              <InfoRow
                label="Projection updated"
                value={formatApiTimestamp(backendSelectedStream?.updatedAt)}
              />
              <InfoRow
                label="Owner source"
                value={
                  backendSelectedStream?.ownership.sourceOfTruth ??
                  "receivableStream.ownerOf(streamId)"
                }
              />
              <InfoRow
                label="On-chain owner"
                value={shortenAddress(streamOwner.data)}
              />
              <InfoRow
                label="On-chain sender"
                value={shortenAddress(stream.data?.sender)}
              />
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
                label="On-chain status"
                value={stream.data?.canceled ? "Canceled" : "Active or scheduled"}
              />
              <InfoRow
                label="Backend listing"
                value={backendSelectedListing?.status ?? "-"}
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
              <InfoRow
                label="Backend remaining"
                value={formatApiTokenAmount(
                  backendSelectedListing?.computed.remainingReceivable,
                )}
              />
              <InfoRow
                label="Discount / yield"
                value={`${formatBps(
                  backendSelectedListing?.computed.discountBps,
                )} / ${formatBps(
                  backendSelectedListing?.computed.expectedYieldBps,
                )}`}
              />
              <InfoRow
                label="Risk labels"
                value={formatRiskLabels(selectedListingRiskLabels)}
              />
              <InfoRow
                label="Buy preflight"
                value={buyPreflightMessage}
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

function listingStatusClassName(status: ListingStatus) {
  if (status === "ACTIVE") {
    return "bg-emerald-400/15 text-emerald-200";
  }

  if (status === "SOLD") {
    return "bg-sky-400/15 text-sky-200";
  }

  if (status === "INVALIDATED") {
    return "bg-amber-400/15 text-amber-200";
  }

  return "bg-zinc-800 text-zinc-300";
}
