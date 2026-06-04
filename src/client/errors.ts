export const EXIT_CODES = {
  success: 0,
  general: 1,
  config: 2,
  auth: 3,
  notFound: 4,
  validation: 5,
  writeBlocked: 6,
  network: 7,
  openapi: 8,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export class OpctlError extends Error {
  public readonly exitCode: ExitCode;
  public readonly details: unknown;

  public constructor(message: string, exitCode: ExitCode = EXIT_CODES.general, details?: unknown) {
    super(message);
    this.name = "OpctlError";
    this.exitCode = exitCode;
    this.details = details;
  }
}

export class ConfigurationError extends OpctlError {
  public constructor(message: string) {
    super(message, EXIT_CODES.config);
    this.name = "ConfigurationError";
  }
}

export class WriteBlockedError extends OpctlError {
  public constructor() {
    super("OpenProject write blocked: set OPENPROJECT_ALLOW_WRITE=1 to enable write commands", EXIT_CODES.writeBlocked);
    this.name = "WriteBlockedError";
  }
}

export class NetworkError extends OpctlError {
  public constructor(message: string) {
    super(message, EXIT_CODES.network);
    this.name = "NetworkError";
  }
}

export class OpenApiGenerationError extends OpctlError {
  public constructor(message: string) {
    super(message, EXIT_CODES.openapi);
    this.name = "OpenApiGenerationError";
  }
}

export class OpenProjectHttpError extends OpctlError {
  public readonly status: number;
  public readonly responseBody: unknown;

  public constructor(status: number, responseBody: unknown) {
    super(httpStatusMessage(status, responseBody), exitCodeForStatus(status), responseBody);
    this.name = "OpenProjectHttpError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export function exitCodeForStatus(status: number): ExitCode {
  if (status === 401 || status === 403) return EXIT_CODES.auth;
  if (status === 404) return EXIT_CODES.notFound;
  if (status === 422) return EXIT_CODES.validation;
  return EXIT_CODES.general;
}

export function httpStatusMessage(status: number, body: unknown): string {
  if (status === 401) return "authentication failed";
  if (status === 403) return "authenticated OpenProject user lacks permission";
  if (status === 404) return "resource not found or not visible to this user";
  if (status === 409) return "possible stale lockVersion or concurrent modification";
  if (status === 422) return `validation failed${validationDetail(body)}`;
  return `OpenProject request failed with HTTP ${status}`;
}

function validationDetail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const message = "message" in body && typeof body.message === "string" ? body.message : undefined;
  const errorIdentifier = "errorIdentifier" in body && typeof body.errorIdentifier === "string" ? body.errorIdentifier : undefined;
  const errors = "_embedded" in body ? body._embedded : undefined;
  const parts = [message, errorIdentifier, typeof errors === "object" && errors !== null ? JSON.stringify(errors) : undefined].filter(Boolean);
  return parts.length === 0 ? "" : `: ${parts.join("; ")}`;
}

export function toOpctlError(error: unknown): OpctlError {
  if (error instanceof OpctlError) return error;
  if (error instanceof Error) return new OpctlError(error.message);
  return new OpctlError("unexpected failure");
}
