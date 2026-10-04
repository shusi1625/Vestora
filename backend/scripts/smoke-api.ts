import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const app = buildApp();

async function expectOk(path: string) {
  const response = await app.inject({
    method: "GET",
    url: path,
  });

  if (response.statusCode !== 200) {
    throw new Error(
      `${path} expected 200 but received ${response.statusCode}: ${response.body}`,
    );
  }

  return response.json();
}

async function expectError(path: string, statusCode: number, code: string) {
  const response = await app.inject({
    method: "GET",
    url: path,
  });
  const body = response.json();

  if (response.statusCode !== statusCode || body.error?.code !== code) {
    throw new Error(
      `${path} expected ${statusCode}/${code} but received ${response.statusCode}: ${response.body}`,
    );
  }

  return body;
}

try {
  await app.ready();

  const streams = await expectOk("/streams");
  const listings = await expectOk("/listings");
  const marketStats = await expectOk("/market/stats");
  const streamId = streams.data?.[0]?.streamId;
  const address =
    streams.data?.[0]?.currentOwner ??
    streams.data?.[0]?.recipient ??
    streams.data?.[0]?.sender;

  if (streamId) {
    await expectOk(`/streams/${streamId}`);
  }

  if (address) {
    await expectOk(`/users/${address}/streams`);
    await expectOk(`/users/${address}/trades`);
  }

  await expectError("/streams/not-a-number", 400, "BAD_REQUEST");

  console.log(
    JSON.stringify(
      {
        streams: streams.meta,
        listings: listings.meta,
        marketStats: marketStats.data,
        checkedStreamDetail: Boolean(streamId),
        checkedUserRoutes: Boolean(address),
        checkedErrorShape: true,
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
  await prisma.$disconnect();
}
