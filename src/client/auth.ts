import type { AuthMode } from "../config.js";

export function createAuthorizationHeader(mode: AuthMode, token: string): string {
  if (mode === "basic") {
    return `Basic ${Buffer.from(`apikey:${token}`, "utf8").toString("base64")}`;
  }
  return `Bearer ${token}`;
}

export function redactSecrets(value: string, token?: string): string {
  let redacted = value.replace(/Authorization:\s*(Bearer|Basic)\s+[^\s,}]+/gi, "Authorization: <redacted>");
  redacted = redacted.replace(/"Authorization"\s*:\s*"[^"]+"/gi, '"Authorization":"<redacted>"');
  if (token && token !== "") redacted = redacted.split(token).join("<redacted>");
  return redacted;
}
