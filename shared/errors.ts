export class FirefoxTabsError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "FirefoxTabsError";
    this.code = code;
    this.details = details;
  }
}

export function serializeError(error: unknown): {
  code: string;
  message: string;
  details?: unknown;
} {
  if (error instanceof FirefoxTabsError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}
