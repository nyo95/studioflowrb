#!/usr/bin/env node
// @ts-check
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createBridge, readConfig } from "./bridge.mjs";

// stdout carries the MCP protocol; every human-readable line goes to stderr.
let config;
try {
  config = readConfig(process.env);
} catch (error) {
  process.stderr.write(`schedule-assistant: ${error instanceof Error ? error.message : "invalid configuration"}\n`);
  process.exit(1);
}
await createBridge(config).connect(new StdioServerTransport());
