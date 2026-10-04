import { parseAbi, type Abi, type Address } from "viem";

import { env } from "../config/env.js";

export type IndexedContractName =
  | "ReceivableStream"
  | "ReceivableMarketplace";

export type IndexedContract = {
  name: IndexedContractName;
  address: Address;
  abi: Abi;
};

export const receivableStreamEventAbi = parseAbi([
  "event StreamCreated(uint256 indexed streamId, address indexed sender, address indexed recipient, address token, uint256 depositedAmount, uint256 startTime, uint256 endTime, bool cancelable)",
  "event StreamClaimed(uint256 indexed streamId, address indexed recipient, uint256 amount)",
  "event StreamCanceled(uint256 indexed streamId, address indexed sender, address indexed recipient, uint256 vestedAmount, uint256 senderRefund)",
]);

export const receivableMarketplaceEventAbi = parseAbi([
  "event Listed(uint256 indexed streamId, address indexed seller, uint256 price)",
  "event ListingCanceled(uint256 indexed streamId, address indexed seller)",
  "event Purchased(uint256 indexed streamId, address indexed seller, address indexed buyer, uint256 price)",
]);

export const indexedContracts: IndexedContract[] = [
  {
    name: "ReceivableStream",
    address: env.receivableStreamAddress as Address,
    abi: receivableStreamEventAbi,
  },
  {
    name: "ReceivableMarketplace",
    address: env.receivableMarketplaceAddress as Address,
    abi: receivableMarketplaceEventAbi,
  },
];
