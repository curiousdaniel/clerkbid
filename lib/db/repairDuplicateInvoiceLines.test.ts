/** @vitest-environment jsdom */
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuctionDB } from "@/lib/db";
import { repairDuplicateInvoiceLines } from "@/lib/db/repairDuplicateInvoiceLines";

let db: AuctionDB;
let eventId: number;
let bidderId: number;

const REPAIR_FLAG_KEY = "clerkbid:duplicateInvoiceLinesRepaired:v1";

beforeEach(async () => {
  // The repair pass is gated by a localStorage flag; clear it so each
  // test starts fresh.
  try {
    window.localStorage.removeItem(REPAIR_FLAG_KEY);
  } catch {
    /* ignore */
  }
  const uid = `repair_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  db = new AuctionDB(uid);
  eventId = (await db.events.add({
    name: "E",
    organizationName: "O",
    taxRate: 0,
    buyersPremiumRate: 0,
    defaultConsignorCommissionRate: 0,
    currencySymbol: "$",
    syncId: "evt-repair",
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as number;
  bidderId = (await db.bidders.add({
    eventId,
    paddleNumber: 1,
    firstName: "B",
    lastName: "B",
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as number;
});

afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});

describe("repairDuplicateInvoiceLines", () => {
  it("detaches older duplicate sale rows for the same lot on one invoice", async () => {
    const lotId = (await db.lots.add({
      eventId,
      baseLotNumber: 1,
      lotSuffix: "",
      displayLotNumber: "1",
      description: "Lot 1",
      quantity: 1,
      status: "sold",
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as number;
    const invId = (await db.invoices.add({
      eventId,
      bidderId,
      invoiceNumber: "1-001",
      subtotal: 0,
      buyersPremiumAmount: 0,
      taxAmount: 0,
      total: 0,
      status: "unpaid",
      generatedAt: new Date(),
    })) as number;
    const oldSaleId = (await db.sales.add({
      eventId,
      lotId,
      bidderId,
      displayLotNumber: "1",
      paddleNumber: 1,
      description: "Lot 1",
      quantity: 1,
      amount: 50,
      clerkInitials: "AB",
      createdAt: new Date(),
      invoiceId: invId,
    })) as number;
    const newSaleId = (await db.sales.add({
      eventId,
      lotId,
      bidderId,
      displayLotNumber: "1",
      paddleNumber: 1,
      description: "Lot 1 (corrected)",
      quantity: 1,
      amount: 60,
      clerkInitials: "AB",
      createdAt: new Date(),
      invoiceId: invId,
    })) as number;

    await repairDuplicateInvoiceLines(db);

    const oldSale = await db.sales.get(oldSaleId);
    const newSale = await db.sales.get(newSaleId);
    // Newer sale stays attached, older sale is detached (kept as
    // unallocated for re-attach via Generate).
    expect(newSale?.invoiceId).toBe(invId);
    expect(oldSale?.invoiceId).toBeUndefined();
  });

  it("is idempotent — second run does nothing because flag is set", async () => {
    const lotId = (await db.lots.add({
      eventId,
      baseLotNumber: 1,
      lotSuffix: "",
      displayLotNumber: "1",
      description: "Lot 1",
      quantity: 1,
      status: "sold",
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as number;
    const invId = (await db.invoices.add({
      eventId,
      bidderId,
      invoiceNumber: "1-001",
      subtotal: 0,
      buyersPremiumAmount: 0,
      taxAmount: 0,
      total: 0,
      status: "unpaid",
      generatedAt: new Date(),
    })) as number;
    await db.sales.add({
      eventId,
      lotId,
      bidderId,
      displayLotNumber: "1",
      paddleNumber: 1,
      description: "Lot 1",
      quantity: 1,
      amount: 50,
      clerkInitials: "AB",
      createdAt: new Date(),
      invoiceId: invId,
    });

    await repairDuplicateInvoiceLines(db);

    // Now fabricate a brand new duplicate after the repair flag is set:
    // the second call should NOT touch it.
    const dupId = (await db.sales.add({
      eventId,
      lotId,
      bidderId,
      displayLotNumber: "1",
      paddleNumber: 1,
      description: "Lot 1 dup",
      quantity: 1,
      amount: 50,
      clerkInitials: "AB",
      createdAt: new Date(),
      invoiceId: invId,
    })) as number;

    await repairDuplicateInvoiceLines(db);

    const dup = await db.sales.get(dupId);
    expect(dup?.invoiceId).toBe(invId);
  });

  it("leaves single-line invoices alone", async () => {
    const lotId = (await db.lots.add({
      eventId,
      baseLotNumber: 2,
      lotSuffix: "",
      displayLotNumber: "2",
      description: "Lot 2",
      quantity: 1,
      status: "sold",
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as number;
    const invId = (await db.invoices.add({
      eventId,
      bidderId,
      invoiceNumber: "1-002",
      subtotal: 75,
      buyersPremiumAmount: 0,
      taxAmount: 0,
      total: 75,
      status: "unpaid",
      generatedAt: new Date(),
    })) as number;
    const saleId = (await db.sales.add({
      eventId,
      lotId,
      bidderId,
      displayLotNumber: "2",
      paddleNumber: 1,
      description: "Lot 2",
      quantity: 1,
      amount: 75,
      clerkInitials: "AB",
      createdAt: new Date(),
      invoiceId: invId,
    })) as number;

    await repairDuplicateInvoiceLines(db);

    const sale = await db.sales.get(saleId);
    expect(sale?.invoiceId).toBe(invId);
  });
});
