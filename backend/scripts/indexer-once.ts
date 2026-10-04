import { prisma } from "../src/db/prisma.js";
import { runIndexerOnce } from "../src/indexer/service.js";

try {
  const result = await runIndexerOnce();

  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
