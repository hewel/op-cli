import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { ConfigurationError } from "../client/errors.js";
import type { EnvReader } from "../config.js";

export interface Profile {
  readonly url?: string;
  readonly authMode?: string;
  readonly defaultProject?: string;
  readonly token?: string;
}

interface ProfileStore {
  readonly activeProfile?: string;
  readonly profiles: Record<string, Profile>;
}

const EMPTY_STORE: ProfileStore = { profiles: {} };

export function profilesPath(env: NodeJS.ProcessEnv = process.env): string {
  const configHome = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() !== "" ? env.XDG_CONFIG_HOME : join(homedir(), ".config");
  return join(configHome, "opctl", "profiles.json");
}

export function loadProfileStore(path = profilesPath()): ProfileStore {
  if (!existsSync(path)) return EMPTY_STORE;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object") throw new ConfigurationError("profile store is invalid");
  const object = parsed as Record<string, unknown>;
  const profiles = object.profiles;
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) throw new ConfigurationError("profile store is invalid");
  return {
    ...(typeof object.activeProfile === "string" ? { activeProfile: object.activeProfile } : {}),
    profiles: profiles as Record<string, Profile>,
  };
}

export function saveProfileStore(store: ProfileStore, path = profilesPath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try { chmodSync(dirname(path), 0o700); } catch { /* best effort on platforms without chmod */ }
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* best effort on platforms without chmod */ }
}

export function profileToEnv(profile: Profile | undefined): EnvReader {
  if (!profile) return {};
  return {
    ...(profile.url ? { OPENPROJECT_URL: profile.url } : {}),
    ...(profile.authMode ? { OPENPROJECT_AUTH_MODE: profile.authMode } : {}),
    ...(profile.defaultProject ? { OPENPROJECT_DEFAULT_PROJECT: profile.defaultProject } : {}),
    ...(profile.token ? { OPENPROJECT_TOKEN: profile.token } : {}),
  };
}

export function getProfileEnv(name: string | undefined, env: NodeJS.ProcessEnv = process.env): EnvReader {
  const store = loadProfileStore(profilesPath(env));
  const selected = name ?? store.activeProfile;
  if (!selected) return {};
  const profile = store.profiles[selected];
  if (!profile) throw new ConfigurationError(`profile '${selected}' does not exist`);
  return profileToEnv(profile);
}

export function listProfiles(env: NodeJS.ProcessEnv = process.env): ReadonlyArray<{ readonly name: string; readonly active: boolean; readonly profile: Profile }> {
  const store = loadProfileStore(profilesPath(env));
  return Object.entries(store.profiles).sort(([left], [right]) => left.localeCompare(right)).map(([name, profile]) => ({ name, active: name === store.activeProfile, profile }));
}

export function setProfile(name: string, profile: Profile, env: NodeJS.ProcessEnv = process.env): void {
  validateProfileName(name);
  const path = profilesPath(env);
  const store = loadProfileStore(path);
  saveProfileStore({ ...store, profiles: { ...store.profiles, [name]: cleanProfile(profile) } }, path);
}

export function useProfile(name: string, env: NodeJS.ProcessEnv = process.env): void {
  validateProfileName(name);
  const path = profilesPath(env);
  const store = loadProfileStore(path);
  if (!store.profiles[name]) throw new ConfigurationError(`profile '${name}' does not exist`);
  saveProfileStore({ ...store, activeProfile: name }, path);
}

export function unsetProfile(name: string, env: NodeJS.ProcessEnv = process.env): void {
  validateProfileName(name);
  const path = profilesPath(env);
  const store = loadProfileStore(path);
  const { [name]: _removed, ...profiles } = store.profiles;
  saveProfileStore({ ...(store.activeProfile === name ? {} : { activeProfile: store.activeProfile }), profiles }, path);
}

export function showProfile(name: string | undefined, env: NodeJS.ProcessEnv = process.env): { readonly name?: string; readonly profile?: Profile } {
  const store = loadProfileStore(profilesPath(env));
  const selected = name ?? store.activeProfile;
  if (!selected) return {};
  const profile = store.profiles[selected];
  if (!profile) throw new ConfigurationError(`profile '${selected}' does not exist`);
  return { name: selected, profile };
}

export function redactProfile(profile: Profile): Profile & { readonly token?: string } {
  return { ...profile, ...(profile.token ? { token: "<redacted>" } : {}) };
}

function validateProfileName(name: string): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new ConfigurationError("profile name may contain only letters, numbers, '.', '_', and '-'");
}

function cleanProfile(profile: Profile): Profile {
  return {
    ...(profile.url && profile.url.trim() !== "" ? { url: profile.url.trim() } : {}),
    ...(profile.authMode && profile.authMode.trim() !== "" ? { authMode: profile.authMode.trim() } : {}),
    ...(profile.defaultProject && profile.defaultProject.trim() !== "" ? { defaultProject: profile.defaultProject.trim() } : {}),
    ...(profile.token && profile.token.trim() !== "" ? { token: profile.token } : {}),
  };
}
