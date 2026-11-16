import { z } from "zod";

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { id: "number", label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { id: "special", label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export function checkPassword(password: string) {
  return PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(password) }));
}

export function isStrongPassword(password: string) {
  return PASSWORD_RULES.every((r) => r.test(password));
}

export const passwordSchema = z
  .string()
  .max(128, "Password is too long")
  .refine(isStrongPassword, {
    message: "Password needs 8+ characters, an uppercase letter, a number and a special character",
  });

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^[a-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores only");
