import { createHash, randomInt } from "node:crypto";

// Ohne Zeichen, die man verwechselt (0/O, 1/I)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomChars(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

// z. B. VZA-K7QM-4XHD (8 Zufallszeichen)
export const newInviteCode = () => `VZA-${randomChars(4)}-${randomChars(4)}`;
// z. B. K7QM4XHD
export const newLinkCode = () => randomChars(8);
// z. B. K7QM-4XHD-9WPA-2NTC (16 Zeichen, etwa 80 Bit): für den Passwort-Link
export const newResetCode = () => [0, 1, 2, 3].map(() => randomChars(4)).join("-");

// In der Datenbank steht nur dieser Fingerabdruck, nie der Code selbst
export const hashCode = (normalizedCode: string) => createHash("sha256").update(normalizedCode, "utf8").digest("hex");
