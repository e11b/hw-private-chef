/**
 * Cloudflare Worker entry point for the Notion MCP server.
 * Uses workers-oauth-provider + Cloudflare Access for SaaS for authentication.
 * All tool logic lives in tools.ts (shared with the local stdio fallback).
 *
 * Template: cloudflare/ai/demos/remote-mcp-cf-access
 * Docs: https://developers.cloudflare.com/agents/model-context-protocol/authorization/
 */

import OAuthProvider from "workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { registerTools } from "./tools";

export interface Env {
  // Notion
  NOTION_TOKEN: string;

  // OAuth KV store (for token persistence)
  OAUTH_KV: KVNamespace;

  // Cloudflare Access for SaaS credentials
  ACCESS_CLIENT_ID: string;
  ACCESS_CLIENT_SECRET: string;
  ACCESS_TOKEN_URL: string;
  ACCESS_AUTHORIZATION_URL: string;
  ACCESS_JWKS_URL: string;
  COOKIE_ENCRYPTION_KEY: string;
}

// Creates a fresh McpServer with all 13 tools registered per request.
// The Notion client is initialized with the token from Worker secrets.
function buildServer(env: Env): McpServer {
  if (!env.NOTION_TOKEN) {
    throw new Error("NOTION_TOKEN secret is not set. Run: wrangler secret put NOTION_TOKEN");
  }
  const server = new McpServer({
    name: "notion",
    version: "1.0.0",
  });
  registerTools(server, env.NOTION_TOKEN);
  return server;
}

export default new OAuthProvider({
  apiRoute: "/mcp",
  // createMcpHandler wraps McpServer for Streamable HTTP transport.
  // It receives the Worker env so we can build a server with secrets.
  apiHandler: createMcpHandler(
    // @ts-expect-error - createMcpHandler typing may vary by agents SDK version
    (env: Env) => buildServer(env)
  ),
  defaultHandler: async (request: Request) => {
    return new Response("HW Private Chef - Notion MCP Server. Connect via Claude Settings > Connectors.", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
