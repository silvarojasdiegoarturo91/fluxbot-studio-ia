import net from "node:net";

const LOCAL_IPV6_HOST = "::1";
const LISTEN_PORT = 3000;
const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = 3000;

const server = net.createServer((client) => {
  const target = net.connect({ host: TARGET_HOST, port: TARGET_PORT });

  client.on("error", () => {
    // Ignore connection-level errors from browser disconnects.
  });

  target.on("error", () => {
    client.destroy();
  });

  client.pipe(target);
  target.pipe(client);
});

server.listen(LISTEN_PORT, LOCAL_IPV6_HOST, () => {
  // Keep output concise so it's clear the relay is active.
  // eslint-disable-next-line no-console
  console.log(`IPv6 relay ready at [${LOCAL_IPV6_HOST}]:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
