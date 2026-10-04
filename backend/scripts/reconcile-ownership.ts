import { prisma } from "../src/db/prisma.js";
import { reconcileOwnership } from "../src/reconciliation/ownership.js";

try {
  const result = await reconcileOwnership();

  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
