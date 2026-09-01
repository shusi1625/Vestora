import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [
    injected({
      target: "metaMask",
    }),
  ],
  transports: {
    [sepolia.id]: http(),
  },
  ssr: true,
});