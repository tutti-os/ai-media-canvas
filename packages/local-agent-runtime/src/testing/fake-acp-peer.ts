export function createFakeAcpPeer(messages: unknown[]) {
  return messages.map((message) => JSON.stringify(message)).join("\n");
}

export function createFakeAcpPeerScript(input: {
  updates: unknown[];
  exitCode?: number;
}) {
  return `
process.stdin.setEncoding("utf8");
let buffer = "";
const updates = ${JSON.stringify(input.updates)};
const exitCode = ${input.exitCode ?? 0};

function send(message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\\n");
}

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newlineIndex = buffer.indexOf("\\n");
  while (newlineIndex >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    newlineIndex = buffer.indexOf("\\n");
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined) {
      send({ id: message.id, result: { ok: true } });
    }
    if (message.method === "session/prompt") {
      for (const update of updates) {
        send({ method: "session/update", params: update });
      }
      process.exit(exitCode);
    }
  }
});
`;
}
