// The only place keys live: a module-level variable. Never written to any browser storage.
import type { Hex } from "viem";

export type Session = { address: Hex; signingKey: Hex; contentKey: CryptoKey; contentKeyRaw: Uint8Array };

let current: Session | null = null;

export function getSession(): Session | null {
  return current;
}
export function setSession(s: Session): void {
  current = s;
}
export function clearSession(): void {
  if (current) current.contentKeyRaw.fill(0);
  current = null;
}
