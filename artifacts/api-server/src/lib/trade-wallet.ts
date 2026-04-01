const WALLET_NOTE_PATTERN = /\bwallet=(0x[a-fA-F0-9]{40})\b/;

export function normalizeWalletAddress(walletAddress: string | null | undefined) {
  if (typeof walletAddress !== "string") {
    return null;
  }

  const trimmed = walletAddress.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

export function getTradeWalletAddress(notes: string | null | undefined) {
  if (!notes) {
    return null;
  }

  const match = notes.match(WALLET_NOTE_PATTERN);
  return normalizeWalletAddress(match?.[1]);
}

export function appendWalletToNotes(notes: string | null | undefined, walletAddress: string | null | undefined) {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) {
    return notes ?? null;
  }

  const withoutExistingWallet = (notes ?? "").replace(WALLET_NOTE_PATTERN, "").replace(/\s+\|\s+$/, "").trim();
  return withoutExistingWallet ? `${withoutExistingWallet} | wallet=${normalized}` : `wallet=${normalized}`;
}
