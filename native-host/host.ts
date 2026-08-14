import type { BridgeConfig, PlatformInfo } from "../shared/config.js";
import { EXTENSION_ID, NATIVE_HOST_NAME, configRoot, loadBridgeConfig, verifyHostRegistration } from "../shared/config.js";
import { BRIDGE_PROTOCOL_VERSION } from "../shared/protocol.js";

export interface HostState {
  config: BridgeConfig | null;
  configError: string | null;
  registrationOk: boolean;
  registrationReason: string;
}

export async function loadHostState(platform: PlatformInfo): Promise<HostState> {
  let config: BridgeConfig | null = null;
  let configError: string | null = null;
  try {
    config = await loadBridgeConfig(configRoot(platform));
  } catch (error) {
    configError = error instanceof Error && "code" in error ? String((error as { code: string }).code) : "CONFIG_INVALID";
  }
  const registration = await verifyHostRegistration(platform);
  return {
    config,
    configError,
    registrationOk: registration.ok,
    registrationReason: registration.reason,
  };
}

export function errorResponse(code: string, message: string): Record<string, unknown> {
  return { type: "error", code, message };
}

export function handleHostMessage(raw: unknown, state: HostState): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return errorResponse("INVALID_MESSAGE", "Native messaging message must be a JSON object.");
  }
  const message = raw as Record<string, unknown>;
  if (typeof message.type !== "string") {
    return errorResponse("INVALID_MESSAGE", "Native messaging message type must be a string.");
  }
  if (message.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
    return errorResponse(
      "PROTOCOL_VERSION_MISMATCH",
      `Unsupported protocol version ${JSON.stringify(message.protocolVersion)}; expected ${BRIDGE_PROTOCOL_VERSION}.`,
    );
  }
  switch (message.type) {
    case "ping":
    case "get_status":
      return {
        type: "status",
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        ok: true,
        host: NATIVE_HOST_NAME,
        configPresent: state.config !== null,
        registrationOk: state.registrationOk,
      };
    case "get_bridge_config":
      if (!state.registrationOk) {
        return errorResponse(
          "HOST_REGISTRATION_INVALID",
          `The native host registration must authorize exactly ${EXTENSION_ID}.`,
        );
      }
      if (state.config === null) {
        return errorResponse("CONFIG_NOT_FOUND", "Local bridge configuration not found. Run the bridge setup command.");
      }
      return {
        type: "bridge_config",
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        port: state.config.port,
        token: state.config.token,
      };
    default:
      return errorResponse("UNKNOWN_MESSAGE_TYPE", `Unknown native messaging message type ${JSON.stringify(message.type)}.`);
  }
}
