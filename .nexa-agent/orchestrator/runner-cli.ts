#!/usr/bin/env ts-node
/**
 * Entry point for the detached runner process.
 *
 * Separate from cli.ts so `start` can spawn it without also loading the whole
 * command surface, and so `ps` shows plainly what the long-lived process is.
 */
import { runQueue } from "./runner";

void runQueue({ daemon: true, pollSeconds: 30 }).catch((err) => {
  console.error(`runner died: ${(err as Error).message}`);
  process.exit(1);
});
