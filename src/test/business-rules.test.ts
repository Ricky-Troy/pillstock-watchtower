import { describe, expect, it } from "vitest";
import { computeDiscrepancy, getStockStatus } from "@/lib/stock";
import { isStrongPassword } from "@/lib/password";
import { canAccess } from "@/lib/roles";

describe("stock status", () => {
  it("is out of stock at zero", () => expect(getStockStatus(0, 10)).toBe("out"));
  it("is low at exactly the minimum level", () => expect(getStockStatus(10, 10)).toBe("low"));
  it("is in stock above the minimum level", () => expect(getStockStatus(11, 10)).toBe("ok"));
});

describe("audit discrepancy", () => {
  it("is physical minus recorded, shortage when negative", () =>
    expect(computeDiscrepancy(20, 15)).toEqual({ value: -5, status: "shortage" }));
  it("is a surplus when more is counted", () => expect(computeDiscrepancy(20, 23).status).toBe("surplus"));
  it("is balanced when counts match", () => expect(computeDiscrepancy(7, 7).status).toBe("balanced"));
});

describe("password policy", () => {
  it("accepts 8+ chars with uppercase, number and special", () => expect(isStrongPassword("Pharma#2026")).toBe(true));
  it("rejects a password without a special character", () => expect(isStrongPassword("Pharma2026")).toBe(false));
  it("rejects a password shorter than 8", () => expect(isStrongPassword("Ph#1")).toBe(false));
});

describe("role access", () => {
  it("blocks pharmacists from Manage Users", () => expect(canAccess("pharmacist", "/users")).toBe(false));
  it("blocks storekeepers from stock-out", () => expect(canAccess("storekeeper", "/stock-out")).toBe(false));
  it("blocks pharmacists from stock-in", () => expect(canAccess("pharmacist", "/stock-in")).toBe(false));
  it("lets storekeepers run audits", () => expect(canAccess("storekeeper", "/audit")).toBe(true));
  it("lets admins open everything", () => expect(canAccess("admin", "/activity")).toBe(true));
});
