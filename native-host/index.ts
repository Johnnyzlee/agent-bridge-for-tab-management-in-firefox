#!/usr/bin/env node
import { platformForCLI } from "../shared/config.js";
import { MAX_NATIVE_MESSAGE_BYTES, readFramedMessage, writeFramedMessage } from "./framing.js";
import { handleHostMessage, loadHostState } from "./host.js";

const statePromise = loadHostState(platformForCLI());

process.stdin.on("error", () => {
  process.exit(1);
});

async function main(): Promise<void> {
  const state = await statePromise;
  for (;;) {
    let message: unknown;
    try {
      message = await readFramedMessage(process.stdin, MAX_NATIVE_MESSAGE_BYTES);
    } catch (error) {
      writeFramedMessage(process.stdout, {
        type: "error",
        code: "INVALID_FRAME",
        message: error instanceof Error ? error.message : String(error),
      });
      break;
    }
    if (message === null) {
      break;
    }
    writeFramedMessage(process.stdout, handleHostMessage(message, state));
  }
}

void main();
