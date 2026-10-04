import { prisma } from "../src/db/prisma.js";
import { rebuildProjections } from "../src/projections/rebuild.js";

try {
  const result = await rebuildProjections();

  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
