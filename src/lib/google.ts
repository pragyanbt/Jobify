import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { htmlToText } from "./jobsearch/html";
import { decrypt, encrypt, encryptionConfigured } from "./secrets";

// Google OAuth (authorization code + PKCE) and a minimal read-only Gmail client.
// Only the gmail.readonly scope is requested: Jobify can never send, delete or
// change mail. Tokens are encrypted at rest and never leave the server.

/** Short-lived cookie holding the OAuth state + PKCE verifier between connect and callback. */
export const OAUTH_COOKIE = "jobify_google_oauth";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT_MS = 20_000;

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && encryptionConfigured());
}

export function redirectUri(origin: string) {
  return `${origin}/api/integrations/google/callback`;
}

/** Start the consent flow: returns the Google URL plus the state/verifier to keep in a cookie. */
export function startAuth(origin: string) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "false",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), state, verifier };
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || data.error) {
    throw new GoogleAuthError(data.error_description || data.error || `Google token request failed (${res.status}).`, data.error);
  }
  return data;
}

export class GoogleAuthError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

/** Finish the consent flow: exchange the code, check the scope, and store encrypted tokens. */
export async function completeAuth(userId: string, origin: string, code: string, verifier: string) {
  const t = await tokenRequest({
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(origin),
  });
  if (!t.scope?.split(" ").includes(GMAIL_SCOPE)) {
    throw new GoogleAuthError("Gmail read access wasn't granted. Connect again and allow “View your email messages and settings”.");
  }
  if (!t.refresh_token) throw new GoogleAuthError("Google didn't return a refresh token. Remove Jobify's access in your Google Account and connect again.");

  const profile = await gmailFetch<{ emailAddress: string }>(t.access_token, "/profile");
  const data = {
    accountEmail: profile.emailAddress,
    scopes: t.scope,
    refreshTokenEnc: encrypt(t.refresh_token),
    accessTokenEnc: encrypt(t.access_token),
    accessExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    lastError: null,
  };
  await prisma.integration.upsert({
    where: { userId_provider: { userId, provider: "google" } },
    create: { userId, provider: "google", ...data },
    update: data,
  });
  return profile.emailAddress;
}

/** A valid access token for the user's Gmail, refreshing it when needed. */
export async function accessToken(userId: string): Promise<string | null> {
  const i = await prisma.integration.findUnique({ where: { userId_provider: { userId, provider: "google" } } });
  if (!i) return null;
  if (i.accessTokenEnc && i.accessExpiresAt && i.accessExpiresAt > new Date()) return decrypt(i.accessTokenEnc);
  try {
    const t = await tokenRequest({ refresh_token: decrypt(i.refreshTokenEnc), grant_type: "refresh_token" });
    await prisma.integration.update({
      where: { id: i.id },
      data: {
        accessTokenEnc: encrypt(t.access_token),
        accessExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
        ...(t.refresh_token && { refreshTokenEnc: encrypt(t.refresh_token) }),
      },
    });
    return t.access_token;
  } catch (e) {
    const msg = e instanceof GoogleAuthError && e.code === "invalid_grant"
      ? "Google access expired or was removed. Reconnect Gmail in Settings."
      : (e as Error).message;
    await prisma.integration.update({ where: { id: i.id }, data: { lastError: msg } });
    throw new GoogleAuthError(msg, (e as GoogleAuthError).code);
  }
}

/** Disconnect: revoke at Google (best effort), then delete the tokens and the updates they found. */
export async function disconnectGoogle(userId: string) {
  const i = await prisma.integration.findUnique({ where: { userId_provider: { userId, provider: "google" } } });
  if (i) {
    try {
      await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decrypt(i.refreshTokenEnc) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      console.warn("[jobify] Google token revoke failed; deleting locally anyway", (e as Error).message);
    }
    await prisma.integration.delete({ where: { id: i.id } });
  }
  await prisma.inboxUpdate.deleteMany({ where: { userId } });
}

// ------------------------------------------------------------------ Gmail (read-only)

export async function gmailFetch<T>(token: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(GMAIL + path);
  if (params) url.search = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Gmail API error ${res.status}: ${body.error?.message ?? res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  snippet?: string;
  payload?: GmailPart;
}
interface GmailPart {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: GmailPart[];
}

export function header(m: GmailMessage, name: string) {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Plain text of a message: text/plain parts, or text/html stripped of tags. */
export function messageText(m: GmailMessage): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p?: GmailPart) => {
    if (!p) return;
    const data = p.body?.data ? Buffer.from(p.body.data, "base64url").toString("utf8") : "";
    if (p.mimeType === "text/plain" && data) plain.push(data);
    else if (p.mimeType === "text/html" && data) html.push(data);
    p.parts?.forEach(walk);
  };
  walk(m.payload);
  const text = plain.length ? plain.join("\n") : htmlToText(html.join("\n"));
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() || m.snippet || "";
}
