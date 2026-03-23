import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ServerConfig } from "./types.js";
export declare function isCancelled(requestId: string): boolean;
export declare function createServer(config?: ServerConfig): Server;
export declare function startServer(config: ServerConfig): Promise<void>;
