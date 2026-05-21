import { describe, expect, it } from "vitest";
import { compareInvoiceRows, type InvoiceWithBidder } from "./InvoiceTable";

function makeRow(overrides: Partial<InvoiceWithBidder> = {}): InvoiceWithBidder {
  const now = new Date();
  return {
    id: 1,
    eventId: 1,
    bidderId: 1,
    invoiceNumber: "0001",
    subtotal: 100,
    buyersPremiumAmount: 10,
    buyersPremiumPct: 10,
    taxAmount: 5,
    taxPct: 5,
    total: 115,
    status: "unpaid",
    generatedAt: now,
    bidder: {
      id: 1,
      eventId: 1,
      paddleNumber: 1,
      firstName: "Alex",
      lastName: "Brown",
      createdAt: now,
      updatedAt: now,
    },
    ...overrides,
  } as InvoiceWithBidder;
}

describe("compareInvoiceRows", () => {
  it("sorts by invoice number using natural order", () => {
    const a = makeRow({ invoiceNumber: "9" });
    const b = makeRow({ invoiceNumber: "10" });
    expect(compareInvoiceRows(a, b, "invoiceNumber") < 0).toBe(true);
  });

  it("sorts by bidder name (last, first)", () => {
    const a = makeRow({
      bidder: {
        ...makeRow().bidder!,
        firstName: "Alex",
        lastName: "Zane",
      },
    });
    const b = makeRow({
      bidder: {
        ...makeRow().bidder!,
        firstName: "Zoe",
        lastName: "Adams",
      },
    });
    expect(compareInvoiceRows(a, b, "bidderName") > 0).toBe(true);
  });

  it("sorts by paddle number numerically", () => {
    const a = makeRow({
      bidder: { ...makeRow().bidder!, paddleNumber: 2 },
    });
    const b = makeRow({
      bidder: { ...makeRow().bidder!, paddleNumber: 10 },
    });
    expect(compareInvoiceRows(a, b, "paddle") < 0).toBe(true);
  });

  it("sorts by total numerically", () => {
    const a = makeRow({ total: 250 });
    const b = makeRow({ total: 100 });
    expect(compareInvoiceRows(a, b, "total") > 0).toBe(true);
  });

  it("sorts unpaid before paid (asc)", () => {
    const unpaid = makeRow({ status: "unpaid" });
    const paid = makeRow({ status: "paid" });
    expect(compareInvoiceRows(unpaid, paid, "status") < 0).toBe(true);
  });
});
