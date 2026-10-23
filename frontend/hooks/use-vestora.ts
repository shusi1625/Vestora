"use client";

import { pendingKey, readPending, savePending, clearPending } from "../lib/pending-transaction";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { decodeEventLog, isAddress, parseUnits, type Address, type Hex } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useSwitchChain,
} from "wagmi";
import { getAccount } from "wagmi/actions";
import { wagmiConfig } from "../lib/wagmi";
import { sepolia } from "wagmi/chains";
import { isWalletRejection, requiresProjection, projectionIncludes, visiblePollInterval, refreshAfterConfirmation } from "../lib/transaction-policy";

import {
  fetchListings,
  fetchMarketStats,
  fetchMetrics,
  fetchStream,
  fetchUserStreams,
  fetchUserTrades,
  VestoraApiError,
} from "../lib/api";
import {
  erc20Abi,
  receivableMarketplaceAbi,
  receivableStreamAbi,
  sepoliaContracts,
} from "../lib/contracts";
import {
  formatTokenAmount,
  sameAddress,
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
    | "completed"
    | "rejected"
    | "unknown"
    | "error";
  message: string;
  hash?: Hex;
  confirmedBlockNumber?: bigint;
  projectionRequired?: boolean;
  refreshWarning?: string;
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
  if (!/^\d+(\.\d{1,6})?$/.test(value) || Number(value) <= 0) {
    return undefined;
  }

  try {
    return parseUnits(value, decimals);
  } catch {
    return undefined;
  }
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



export function useVestora() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { connect, connectors, isPending: isConnecting, error: connectError } = useConnect();
  const { switchChain, error: switchError } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();

  const [mintAmount, setMintAmount] = useState("1000");
  const [recipient, setRecipient] = useState("");
  const [streamAmount, setStreamAmount] = useState("100");
  const [startDelayMinutes, setStartDelayMinutes] = useState("1");
  const [durationMinutes, setDurationMinutes] = useState("10");
  const [cancelable, setCancelable] = useState(false);
  const [createdStreamId, setCreatedStreamId] = useState("");
  const [streamIdInput, setStreamIdInput] = useState("");
  const [listingPrice, setListingPrice] = useState("40");
  const [txState, storeTxState] = useState<TxState>(initialTxState);
  const [pageVisible, setPageVisible] = useState(false);
  const [observedAt,setObservedAt] = useState(0);
  useEffect(()=>{const update=()=>setObservedAt(Date.now());update();const timer=setInterval(update,15000);return()=>clearInterval(timer);},[]);
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const [buyPreflightMessage, setBuyPreflightMessage] =
    useState("Not checked yet.");

  const [restoredAccount, setRestoredAccount] = useState<string | undefined>(undefined);
  const [storageWarning, setStorageWarning] = useState("");
  function setTxState(next: TxState) {
    // A delayed receipt for a previous wallet must not overwrite the current wallet.
    if (sameAddress(getAccount(wagmiConfig).address,address)) storeTxState(next);
  }
  useEffect(() => {
    const restore = () => {
      const saved = address ? readPending(pendingKey(address,sepoliaContracts.receivableStream),address) : null;
      storeTxState(saved ? {label:saved.label,hash:saved.hash,status:"error",phase:"unknown",message:"저장된 거래입니다. 결과를 다시 확인하세요."} : initialTxState);
      if (saved?.streamId) setStreamIdInput(saved.streamId);
      setRestoredAccount(address);
    };
    restore();
  }, [address]);

  const metaMaskConnector = connectors.find((connector) =>
    connector.name.toLowerCase().includes("metamask"),
  );

  const isSepolia = chainId === sepolia.id;
  const canWrite = Boolean(isConnected && isSepolia && address && publicClient && restoredAccount === address);
  const selectedStreamId = parseStreamId(streamIdInput);
  const selectedStreamIdText = selectedStreamId?.toString();
  const onchainPoll = visiblePollInterval(pageVisible);
  const chainBlock = useQuery({
    queryKey: ["chain-block", sepolia.id, selectedStreamIdText],
    queryFn: () => publicClient!.getBlock(),
    enabled: Boolean(publicClient && selectedStreamId && pageVisible),
    refetchInterval: onchainPoll,
    retry: false,
  });

  const marketStats = useQuery({
    queryKey: ["market-stats"],
    queryFn: fetchMarketStats,
    refetchInterval: onchainPoll,
  });

  const indexerMetrics = useQuery({
    queryKey: ["indexer-metrics"],
    queryFn: fetchMetrics,
    refetchInterval: onchainPoll,
  });

  const backendListings = useQuery({
    queryKey: ["listings"],
    queryFn: () => fetchListings(),
    refetchInterval: onchainPoll,
  });

  const backendStream = useQuery({
    queryKey: ["stream", selectedStreamIdText],
    queryFn: () => fetchStream(selectedStreamIdText ?? ""),
    enabled: Boolean(selectedStreamIdText),
    retry: false,
    refetchInterval: onchainPoll,
  });

  const userStreams = useQuery({
    queryKey: ["user-streams", address?.toLowerCase()],
    queryFn: () => fetchUserStreams(address ?? zeroAddress),
    enabled: Boolean(address),
    refetchInterval: onchainPoll,
  });

  const userTrades = useQuery({
    queryKey: ["user-trades", address?.toLowerCase()],
    queryFn: () => fetchUserTrades(address ?? zeroAddress),
    enabled: Boolean(address),
    refetchInterval: onchainPoll,
  });

  const mockUsdcSymbol = useReadContract({
    chainId: sepolia.id,
    address: sepoliaContracts.mockUSDC,
    abi: erc20Abi,
    functionName: "symbol",
  });

  const mockUsdcBalance = useReadContract({
    chainId: sepolia.id,
    address: sepoliaContracts.mockUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
    },
  });

  const nextStreamId = useReadContract({
    chainId: sepolia.id,
    address: sepoliaContracts.receivableStream,
    abi: receivableStreamAbi,
    functionName: "nextStreamId",
  });

  const marketplacePaymentToken = useReadContract({
    chainId: sepolia.id,
    address: sepoliaContracts.receivableMarketplace,
    abi: receivableMarketplaceAbi,
    functionName: "paymentToken",
  });

  const marketplaceReceivableNft = useReadContract({
    chainId: sepolia.id,
    address: sepoliaContracts.receivableMarketplace,
    abi: receivableMarketplaceAbi,
    functionName: "receivableNft",
  });

  const stream = useReadContract({
    chainId: sepolia.id,
    address: sepoliaContracts.receivableStream,
    abi: receivableStreamAbi,
    functionName: "getStream",
    args: selectedStreamId ? [selectedStreamId] : undefined,
    query: {
      enabled: Boolean(selectedStreamId && pageVisible),
      refetchInterval: onchainPoll,
      retry: false,
    },
  });

  const vestedAmount = useReadContract({
    chainId: sepolia.id,
    address: sepoliaContracts.receivableStream,
    abi: receivableStreamAbi,
    functionName: "vestedAmount",
    args: selectedStreamId ? [selectedStreamId] : undefined,
    query: {
      enabled: Boolean(selectedStreamId && pageVisible),
      refetchInterval: onchainPoll,
      retry: false,
    },
  });

  const claimableAmount = useReadContract({
    chainId: sepolia.id,
    address: sepoliaContracts.receivableStream,
    abi: receivableStreamAbi,
    functionName: "claimableAmount",
    args: selectedStreamId ? [selectedStreamId] : undefined,
    query: {
      enabled: Boolean(selectedStreamId && pageVisible),
      refetchInterval: onchainPoll,
      retry: false,
    },
  });

  const streamOwner = useReadContract({
    chainId: sepolia.id,
    address: sepoliaContracts.receivableStream,
    abi: receivableStreamAbi,
    functionName: "ownerOf",
    args: selectedStreamId ? [selectedStreamId] : undefined,
    query: {
      enabled: Boolean(selectedStreamId && pageVisible),
      refetchInterval: onchainPoll,
      retry: false,
    },
  });

  const listing = useReadContract({
    chainId: sepolia.id,
    address: sepoliaContracts.receivableMarketplace,
    abi: receivableMarketplaceAbi,
    functionName: "getListing",
    args: selectedStreamId ? [selectedStreamId] : undefined,
    query: {
      enabled: Boolean(selectedStreamId && pageVisible),
      refetchInterval: onchainPoll,
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
    [backendListings.dataUpdatedAt, ...(address ? [userStreams.dataUpdatedAt] : [])].some(at => at > 0 && observedAt - at > 30_000);
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
  const latestProjectedBlock = parseBlockNumber(
    backendListings.data?.meta?.projection?.latestProjectedBlock,
  );
  const transactionBackendIndexed = projectionIncludes(txState.confirmedBlockNumber, latestProjectedBlock);
  const transactionComplete = txState.status === "success" && txState.confirmedBlockNumber !== undefined && !txState.refreshWarning &&
    (!txState.projectionRequired || transactionBackendIndexed);
  useEffect(() => {
    if (transactionComplete && address && txState.hash) clearPending(pendingKey(address,sepoliaContracts.receivableStream),address,txState.hash);
  }, [transactionComplete,address,txState.hash]);
  const displayedPhase = transactionComplete ? "completed" : txState.phase;
  const displayedMessage = transactionComplete
    ? "Transaction confirmed. Required updates completed."
    : txState.message;
  const transactionBackendIndexingStatus =
    txState.confirmedBlockNumber === undefined
      ? "No confirmed transaction"
      : !txState.projectionRequired ? "Not required"
      : backendListings.isError
        ? "Indexer status unavailable"
        : transactionBackendIndexed
          ? "Indexed"
          : `Pending block ${txState.confirmedBlockNumber.toString()}`;

  const selectedListingRiskLabels =
    backendSelectedListing?.computed.riskLabels ?? [];

  async function refreshOnchainReads() {
    const results = await Promise.all([
      ...(address ? [mockUsdcBalance.refetch()] : []),
      nextStreamId.refetch(),
      ...(selectedStreamId ? [stream.refetch(), vestedAmount.refetch(), claimableAmount.refetch(),
        streamOwner.refetch(), listing.refetch(), chainBlock.refetch()] : []),
    ]);
    if (results.some((result) => result.isError)) throw new Error("On-chain read refresh failed");
  }

  async function refreshBackendReads() {
    const readRefreshes: Promise<unknown>[] = [
      marketStats.refetch(),
      indexerMetrics.refetch(),
      backendListings.refetch(),
      ...(address ? [userStreams.refetch(), userTrades.refetch()] : []),
    ];

    if (selectedStreamIdText) {
      readRefreshes.push(backendStream.refetch());
    }

    const results = await Promise.all(readRefreshes);
    if (results.some(result => (result as {isError?:boolean}).isError)) throw new Error("API refresh failed");
  }

  async function refreshReads() {
    await Promise.all([refreshOnchainReads(), refreshBackendReads()]);
  }

  async function runTransaction(label: string, action: () => Promise<Hex>) {
    const projectionRequired = requiresProjection(label);
    let submittedHash: Hex | undefined;
    let confirmedBlock: bigint | undefined;
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
      submittedHash = hash;
      if (address && !savePending(pendingKey(address,sepoliaContracts.receivableStream),{version:1,chainId:sepolia.id,account:address,hash,label,streamId:selectedStreamIdText??""})) setStorageWarning("이 브라우저에 거래를 저장하지 못했습니다. 새로고침 전 거래 해시를 보관하세요.");

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
        if (address) clearPending(pendingKey(address,sepoliaContracts.receivableStream),address,hash);
        throw new Error("Transaction reverted.");
      }
      confirmedBlock = receipt.blockNumber;
      if (label === "Create Stream") {
        for (const log of receipt.logs) {
          if (!sameAddress(log.address,sepoliaContracts.receivableStream)) continue;
          try {
            const event = decodeEventLog({abi:receivableStreamAbi,data:log.data,topics:log.topics});
            if (event.eventName === "StreamCreated") { const id=event.args.streamId.toString();setCreatedStreamId(id);setStreamIdInput(id); }
          } catch { /* Ignore unrelated logs. */ }
        }
      }

      setTxState({
        label,
        status: "pending",
        phase: "refreshing_onchain",
        message: "Transaction confirmed. Refreshing on-chain reads...",
        hash,
        confirmedBlockNumber: receipt.blockNumber,
      });

      const refreshWarning = await refreshAfterConfirmation([refreshOnchainReads, refreshBackendReads]);

      setTxState({
        label,
        status: "success",
        phase: refreshWarning ? "refreshing_onchain" : projectionRequired ? "indexing_pending" : "completed",
        message: projectionRequired ? "On-chain confirmed. Waiting for projection." : "Transaction confirmed.",
        projectionRequired,
        refreshWarning,
        hash,
        confirmedBlockNumber: receipt.blockNumber,
      });
      if (!projectionRequired && address) clearPending(pendingKey(address,sepoliaContracts.receivableStream),address,hash);
      return true;
    } catch (error) {
      if (confirmedBlock !== undefined) {
        setTxState({ label, status: "success", phase: "refreshing_onchain",
          hash: submittedHash, confirmedBlockNumber: confirmedBlock, projectionRequired,
          message: "Transaction confirmed.", refreshWarning: "Read refresh failed. The transaction succeeded." });
        return true;
      }
      setTxState({
        label,
        status: "error",
        phase: submittedHash && !(error instanceof Error && error.message === "Transaction reverted.") ? "unknown" : !submittedHash && isWalletRejection(error) ? "rejected" : "error",
        hash: submittedHash,
        message: error instanceof Error ? error.message : "Transaction failed.",
      });
      return false;
    }
  }


  async function recoverTransaction() {
    if (!publicClient || !address || !txState.hash || txState.status === "pending") return;
    const hash=txState.hash, label=txState.label;
    setTxState({...txState,status:"pending",phase:"confirming",message:"제출된 거래 결과를 조회하고 있습니다."});
    try {
      const receipt=await publicClient.getTransactionReceipt({hash});
      if (!sameAddress(getAccount(wagmiConfig).address,address)) return;
      if (receipt.status !== "success") {
        clearPending(pendingKey(address,sepoliaContracts.receivableStream),address,hash);
        setTxState({label,hash,status:"error",phase:"error",message:"거래가 블록에서 실패했습니다. 조건을 다시 확인하세요."});return;
      }
      if (label === "Create Stream") {
        for (const log of receipt.logs) {
          if (!sameAddress(log.address,sepoliaContracts.receivableStream)) continue;
          try {
            const event=decodeEventLog({abi:receivableStreamAbi,data:log.data,topics:log.topics});
            if (event.eventName === "StreamCreated") {const id=event.args.streamId.toString();setCreatedStreamId(id);setStreamIdInput(id);}
          } catch { /* Ignore unrelated logs. */ }
        }
      }
      const refreshWarning=await refreshAfterConfirmation([refreshOnchainReads,refreshBackendReads]);
      const projectionRequired=requiresProjection(label);
      setTxState({label,hash,status:"success",phase:refreshWarning?"refreshing_onchain":projectionRequired?"indexing_pending":"completed",confirmedBlockNumber:receipt.blockNumber,projectionRequired,refreshWarning,message:label.startsWith("Approve ")?"승인이 확인됐습니다. 후속 거래는 조건을 검토한 뒤 직접 실행하세요.":"거래가 확인됐습니다. 정보 반영 상태를 확인합니다."});
    } catch {
      setTxState({label,hash,status:"error",phase:"unknown",message:"아직 거래 결과를 확인할 수 없습니다. 중복 실행하지 말고 잠시 후 다시 확인하세요."});
    }
  }

  async function submit(request: Parameters<typeof writeContractAsync>[0]) {
    const account = getAccount(wagmiConfig);
    if (!sameAddress(account.address, address) || account.chainId !== sepolia.id || !address || !publicClient) throw new Error("지갑 또는 네트워크가 변경되었습니다. 조건을 다시 확인하세요.");
    if (["claim", "list", "cancelListing"].includes(request.functionName) && selectedStreamId) {
      const [owner, currentListing, available] = await Promise.all([
        publicClient.readContract({address:sepoliaContracts.receivableStream,abi:receivableStreamAbi,functionName:"ownerOf",args:[selectedStreamId]}),
        publicClient.readContract({address:sepoliaContracts.receivableMarketplace,abi:receivableMarketplaceAbi,functionName:"getListing",args:[selectedStreamId]}),
        publicClient.readContract({address:sepoliaContracts.receivableStream,abi:receivableStreamAbi,functionName:"claimableAmount",args:[selectedStreamId]})
      ]);
      if (request.functionName !== "cancelListing" && !sameAddress(owner,address)) throw new Error("현재 수취권 소유자가 아닙니다.");
      if (request.functionName === "claim" && available === BigInt(0)) throw new Error("현재 청구 가능한 금액이 없습니다.");
      if (request.functionName === "list" && !sameAddress(currentListing.seller,zeroAddress)) throw new Error("이미 판매 중인 수취권입니다.");
      if (request.functionName === "cancelListing" && !sameAddress(currentListing.seller,address)) throw new Error("본인이 판매 중인 수취권이 아닙니다.");
    }
    return writeContractAsync({...request,account:address,chainId:sepolia.id});
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
      submit({
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

    if (!isAddress(recipient) || sameAddress(recipient, zeroAddress)) {
      setTxState({
        label: "Create Stream",
        status: "error",
        phase: "error",
        message: "Enter a valid recipient address.",
      });
      return;
    }

    const amount = parsePositiveTokenAmount(streamAmount);
    if (!/^\d+$/.test(startDelayMinutes) || !/^\d+$/.test(durationMinutes)) throw new Error("시작 대기와 기간을 정수(분)로 입력하세요.");
    const startDelay = BigInt(startDelayMinutes) * BigInt(60);
    const duration = BigInt(durationMinutes) * BigInt(60);
    if (startDelay > BigInt(315360000) || duration > BigInt(315360000)) throw new Error("시작 대기와 기간은 각각 10년 이내여야 합니다.");

    if (!amount || startDelay < 0 || duration <= 0) {
      setTxState({
        label: "Create Stream",
        status: "error",
        phase: "error",
        message: "Enter a positive amount and duration.",
      });
      return;
    }

    const balance = await publicClient!.readContract({address:sepoliaContracts.mockUSDC,abi:erc20Abi,functionName:"balanceOf",args:[address!]});
    if (amount > balance) throw new Error("예치할 토큰 잔액이 부족합니다.");
    const approved = await runTransaction("Approve Stream Escrow", () =>
      submit({
        address: sepoliaContracts.mockUSDC,
        abi: erc20Abi,
        functionName: "approve",
        args: [sepoliaContracts.receivableStream, amount],
      }),
    );

    if (!approved) {
      return;
    }


    await runTransaction("Create Stream", () =>
      submit({
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


  }

  async function handleClaim() {
    if (!canWrite || !selectedStreamId) {
      return;
    }

    await runTransaction("Claim Stream", () =>
      submit({
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
      submit({
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
      submit({
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
      submit({
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

      if (sameAddress(latestListing.seller,address)) throw new Error("본인 매물은 구매할 수 없습니다.");
      if (!sameAddress(latestStream.token,sepoliaContracts.mockUSDC)) throw new Error("지원하지 않는 결제 토큰입니다.");
      if (sameAddress(latestListing.seller, zeroAddress)) {
        throw new Error("This stream is not currently listed.");
      }

      if (!sameAddress(latestOwner, latestListing.seller)) {
        throw new Error("Listing seller no longer owns this receivable NFT.");
      }

      if (!listing.data || latestListing.price !== listing.data.price) {
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
        canceled: latestStream.canceled,
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

  async function handleBuy(reviewed: { account:string; id:string; seller:string; price:bigint; remaining:bigint; withdrawn:bigint; canceled:boolean }) {
    if (!canWrite || !selectedStreamId || !listing.data) {
      return;
    }

    if (!reviewed || !sameAddress(reviewed.account,address) || reviewed.id !== selectedStreamId.toString()) throw new Error("확인한 지갑 또는 수취권이 변경되었습니다. 다시 검토하세요.");
    const firstPreflight = await runBuyPreflight();

    if (!firstPreflight) {
      return;
    }

    if (firstPreflight.price !== reviewed.price || !sameAddress(firstPreflight.seller,reviewed.seller) || firstPreflight.remainingReceivable < reviewed.remaining || firstPreflight.withdrawnAmount !== reviewed.withdrawn || firstPreflight.canceled !== reviewed.canceled) throw new Error("확인 후 매물 조건이 변경되었습니다. 닫고 다시 검토하세요.");
    const balance = await publicClient!.readContract({address:sepoliaContracts.mockUSDC,abi:erc20Abi,functionName:"balanceOf",args:[address!]});
    if (balance < firstPreflight.price) throw new Error("결제 토큰 잔액이 부족합니다.");
    const approved = await runTransaction("Approve Marketplace Payment", () =>
      submit({
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

    if (finalPreflight.price !== firstPreflight.price || !sameAddress(finalPreflight.seller,firstPreflight.seller) || finalPreflight.remainingReceivable < firstPreflight.remainingReceivable || finalPreflight.withdrawnAmount !== firstPreflight.withdrawnAmount || finalPreflight.canceled !== firstPreflight.canceled) throw new Error("승인 중 매물 조건이 변경되었습니다. 다시 검토하세요.");
    await runTransaction("Buy Receivable", () =>
      submit({
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


  async function handleCancelStream() {
    if (!canWrite || !selectedStreamId || !publicClient || !address) return;
    await runTransaction("Cancel Stream", async () => {
      const current = await publicClient.readContract({address:sepoliaContracts.receivableStream,abi:receivableStreamAbi,functionName:"getStream",args:[selectedStreamId]});
      if (!sameAddress(current.sender,address) || !current.cancelable || current.canceled) throw new Error("송금자와 지급 취소 조건을 다시 확인하세요.");
      return submit({address:sepoliaContracts.receivableStream,abi:receivableStreamAbi,functionName:"cancel",args:[selectedStreamId],chainId:sepolia.id});
    });
  }
  return {
    address,isConnected,isSepolia,canWrite,connect,connectors,metaMaskConnector,disconnect,isConnecting,connectError,switchChain,switchError,
    mintAmount,setMintAmount,recipient,setRecipient,streamAmount,setStreamAmount,startDelayMinutes,setStartDelayMinutes,durationMinutes,setDurationMinutes,
    cancelable,setCancelable,createdStreamId,streamIdInput,setStreamIdInput,selectedStreamIdText,listingPrice,setListingPrice,
    txState,displayedPhase,displayedMessage,transactionBackendIndexingStatus,transactionComplete,isWriting,refreshReads,recoverTransaction,storageWarning,
    handleMint,handleCreateStream,handleClaim,handleList,handleCancelListing,handleCancelStream,handleBuy,
    backendListings,backendStream,userStreams,userTrades,indexerMetrics,mockUsdcBalance,mockUsdcSymbol,
    stream,vestedAmount,claimableAmount,streamOwner,listing,isListed,backendSelectedStream,backendSelectedListing,
    backendApiUnavailable,backendIsStale,backendStreamNotIndexed,buyPreflightMessage,chainBlock,marketplaceChecks,newestBackendReadAt,selectedListingRiskLabels
  };
}
export type VestoraController = ReturnType<typeof useVestora>;
