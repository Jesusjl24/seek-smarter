import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";
const scrypt = promisify(scryptCb);

export async function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); const key = await scrypt(password, salt, 64) as Buffer; return `scrypt:${salt}:${key.toString("hex")}`; }
export async function verifyPassword(password: string, stored: string) { const [, salt, hex] = stored.split(":"); if (!salt || !hex) return false; const key = await scrypt(password, salt, 64) as Buffer; const expected = Buffer.from(hex, "hex"); return key.length === expected.length && timingSafeEqual(key, expected); }
const secret = (value: string) => new TextEncoder().encode(value);
export async function createToken(user: { id: string; email: string }, jwtSecret: string) { return new SignJWT({ email: user.email }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime("30d").sign(secret(jwtSecret)); }
export async function readToken(token: string, jwtSecret: string) { const { payload } = await jwtVerify(token, secret(jwtSecret)); return { id: payload.sub!, email: String(payload.email) }; }
