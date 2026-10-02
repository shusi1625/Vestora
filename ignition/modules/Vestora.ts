import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("VestoraModule", (m) => {
    const mockUSDC = m.contract("MockUSDC");

    const receivableStream = m.contract("ReceivableStream", [], {
        after: [mockUSDC],
    });

    const marketplace = m.contract("ReceivableMarketplace", [
        receivableStream,
        mockUSDC,
    ]);

    return { mockUSDC, receivableStream, marketplace };
});