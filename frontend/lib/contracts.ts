import type { Address } from "viem";

export const sepoliaContracts = {
  mockUSDC: "0x7BadaD2E8FBA41CAb32AA30dfecD03AA816E4517",
  receivableStream: "0x92BA9C82c417a0F2805a0227cB16dead1865a202",
  receivableMarketplace: "0x8a01A13FbEBF6f974F8956558065e70017156579",
} as const satisfies Record<string, Address>;

export const erc20Abi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const receivableStreamAbi = [
  {
    type: "function",
    name: "nextStreamId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "createStream",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "cancelable", type: "bool" },
    ],
    outputs: [{ name: "streamId", type: "uint256" }],
  },
  {
    type: "function",
    name: "createStreamWithDuration",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "startDelay", type: "uint256" },
      { name: "duration", type: "uint256" },
      { name: "cancelable", type: "bool" },
    ],
    outputs: [{ name: "streamId", type: "uint256" }],
  },
  {
    type: "function",
    name: "getStream",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          { name: "token", type: "address" },
          { name: "depositedAmount", type: "uint256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "withdrawnAmount", type: "uint256" },
          { name: "cancelable", type: "bool" },
          { name: "canceled", type: "bool" },
          { name: "canceledAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "vestedAmount",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "claimableAmount",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const receivableMarketplaceAbi = [
  {
    type: "function",
    name: "paymentToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "receivableNft",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "list",
    stateMutability: "nonpayable",
    inputs: [
      { name: "streamId", type: "uint256" },
      { name: "price", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelListing",
    stateMutability: "nonpayable",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getListing",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "seller", type: "address" },
          { name: "price", type: "uint256" },
        ],
      },
    ],
  },
] as const;
