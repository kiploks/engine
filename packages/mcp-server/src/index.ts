import { ENGINE_VERSION } from "@kiploks/engine-contracts";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { handleToolCall } from "./toolHandlers";
import { MCP_TOOLS } from "./tools";

export async function runMcpServer(): Promise<void> {
  const server = new Server(
    { name: "kiploks-engine", version: ENGINE_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      return await handleToolCall(request.params.name, args);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
        isError: true,
      };
    }
  });

  await server.connect(new StdioServerTransport());
}

if (require.main === module) {
  runMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kiploks-mcp failed: ${message}\n`);
    process.exit(1);
  });
}
