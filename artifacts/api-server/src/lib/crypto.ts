import bcrypt from "bcryptjs";

const ENCRYPTION_KEY = process.env.SESSION_SECRET ?? "fallback-key-change-me";

// Simple XOR-based encryption for device passwords (stored in DB)
// For production, consider a proper symmetric encryption library
function xorEncrypt(text: string, key: string): string {
  const keyBytes = Buffer.from(key.slice(0, 32).padEnd(32, "0"));
  const textBytes = Buffer.from(text, "utf8");
  const result = Buffer.alloc(textBytes.length);
  for (let i = 0; i < textBytes.length; i++) {
    result[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return result.toString("base64");
}

function xorDecrypt(encoded: string, key: string): string {
  const keyBytes = Buffer.from(key.slice(0, 32).padEnd(32, "0"));
  const encodedBytes = Buffer.from(encoded, "base64");
  const result = Buffer.alloc(encodedBytes.length);
  for (let i = 0; i < encodedBytes.length; i++) {
    result[i] = encodedBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return result.toString("utf8");
}

export function encryptPassword(password: string): string {
  return xorEncrypt(password, ENCRYPTION_KEY);
}

export function decryptPassword(encrypted: string): string {
  return xorDecrypt(encrypted, ENCRYPTION_KEY);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
