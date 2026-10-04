const url = process.env.HEALTH_URL ?? "http://127.0.0.1:3001/health";

const response = await fetch(url);
const body = await response.text();

if (!response.ok) {
  throw new Error(`Health check failed with ${response.status}: ${body}`);
}

console.log(body);
