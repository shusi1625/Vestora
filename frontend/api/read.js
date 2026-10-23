import { readProxy } from "../server/read-proxy.mjs";

export default {
  fetch(request) {
    return readProxy(request, { origin: process.env.VESTORA_API_PROXY_TARGET });
  },
};
