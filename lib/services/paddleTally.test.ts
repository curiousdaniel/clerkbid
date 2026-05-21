import { describe, expect, it } from "vitest";
import type { AuctionEvent, Invoice, Sale } from "@/lib/db";
import { buildPaddleTally } from "./paddleTally";

const event = {
  id: 1,
  name: "Test Auction",
  date: new Date(),
  status: "active",
  currencySymbol: "$",
  buyersPremiumRate: 0.1,
  taxRate: 0.05,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as AuctionEvent;

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: overrides.id ?? 1,
    eventId: 1,
    bidderId: 1,
    lotId: 1,
    paddleNumber: 1,
    description: "x",
    quantity: 1,
    amount: 100,
    clerkInitials: "AB",
    displayLotNumber: "1",
    createdAt: new Date(),
    ...overrides,
  } as Sale;
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: overrides.id ?? 1,
    eventId: 1,
    bidderId: 1,
    invoiceNumber: "0001",
    subtotal: 0,
    buyersPremiumAmount: 0,
    buyersPremiumPct: 10,
    taxAmount: 0,
    taxPct: 5,
    total: 0,
    status: "unpaid",
    generatedAt: new Date(),
    ...overrides,
  } as Invoice;
}

describe("buildPaddleTally", () => {
  it("returns zeros when there are no sales or invoices", () => {
    const t = buildPaddleTally([], [], event);
    expect(t.hammer).toBe(0);
    expect(t.total).toBe(0);
    expect(t.hasUnallocated).toBe(false);
    expect(t.hasUnpaidInvoice).toBe(false);
    expect(t.hasPaidInvoice).toBe(false);
  });

  it("projects BP and tax for unallocated lines using event rates", () => {
    const sales = [makeSale({ amount: 100 })];
    const t = buildPaddleTally(sales, [], event);
    expect(t.hammer).toBe(100);
    expect(t.unallocatedHammer).toBe(100);
    expect(t.unallocatedBuyersPremium).toBe(10);
    expect(t.unallocatedTax).toBe(5.5);
    expect(t.unallocatedTotal).toBe(115.5);
    expect(t.total).toBe(115.5);
    expect(t.hasUnallocated).toBe(true);
    expect(t.pendingLines).toBe(1);
  });

  it("uses authoritative invoice numbers for allocated sales", () => {
    const sales = [
      makeSale({ id: 1, amount: 100, invoiceId: 1 }),
      makeSale({ id: 2, amount: 50, invoiceId: 1 }),
    ];
    const invoices = [
      makeInvoice({
        subtotal: 150,
        buyersPremiumAmount: 15,
        taxAmount: 8.25,
        total: 173.25,
        status: "unpaid",
      }),
    ];
    const t = buildPaddleTally(sales, invoices, event);
    expect(t.hammer).toBe(150);
    expect(t.buyersPremium).toBe(15);
    expect(t.tax).toBe(8.25);
    expect(t.total).toBe(173.25);
    expect(t.hasUnpaidInvoice).toBe(true);
    expect(t.hasUnallocated).toBe(false);
    expect(t.pendingLines).toBe(0);
  });

  it("combines paid invoice and pending lines into a running total", () => {
    const sales = [
      makeSale({ id: 1, amount: 100, invoiceId: 1 }),
      makeSale({ id: 2, amount: 200, invoiceId: undefined }),
    ];
    const invoices = [
      makeInvoice({
        subtotal: 100,
        buyersPremiumAmount: 10,
        taxAmount: 5.5,
        total: 115.5,
        status: "paid",
      }),
    ];
    const t = buildPaddleTally(sales, invoices, event);
    // Allocated: 115.5 paid invoice. Pending: 200 hammer → 220 + tax(11) = 231.
    expect(t.unallocatedHammer).toBe(200);
    expect(t.unallocatedTotal).toBe(231);
    expect(t.total).toBe(346.5);
    expect(t.hasPaidInvoice).toBe(true);
    expect(t.hasUnallocated).toBe(true);
    expect(t.pendingLines).toBe(1);
  });
});
