export type HelpFaqItem = { question: string; answer: string };

export const helpFaqs: HelpFaqItem[] = [
  {
    question: "Where is my data stored?",
    answer:
      "Auction data is stored locally in your browser (IndexedDB) and ClerkBid continuously attempts to sync event data to ClerkBid cloud services whenever the device has an internet connection. If you lose connectivity after you are already signed in, you can usually keep working on this device until you reconnect; changes made while disconnected stay local until sync runs again. Do not depend on ClerkBid to work entirely offline—you need the network to sign in and for reliable cloud backup. Some assets (like invoice logo images) remain local-only.",
  },
  {
    question: "Why do I need to select an event?",
    answer:
      "Bidders, lots, sales, invoices, consignors, and reports are all scoped to one event at a time. Use the event switcher in the sidebar to change context.",
  },
  {
    question: "What is the difference between hammer and invoice total?",
    answer:
      "Hammer is the winning bid amount for a lot. Invoice totals add buyer’s premium (if configured) and tax on top of hammer lines, depending on your event settings.",
  },
  {
    question: "Can I undo a sale?",
    answer:
      "Yes. The Lots tab shows every lot for the event with full sale details — search by lot number, paddle, buyer name, or description, then expand the row to edit or void the sale. The Clerking page also offers Edit / Void on the most recent 20 sales for quick corrections. Sales on a paid invoice must be marked unpaid first.",
  },
  {
    question: "Do logos on invoices sync to the cloud?",
    answer:
      "Invoice logos and per-event invoice footer overrides are stored locally for privacy and size. JSON event export and cloud snapshot payloads do not include those image blobs.",
  },
  {
    question: "How do consignor commissions work?",
    answer:
      "Set a default commission percent on the event in Settings. Individual consignors can have an override percent. Statements and commission reports use the effective rate per line.",
  },
  {
    question: "What if I marked an invoice paid by mistake?",
    answer:
      "Open Invoices, click the invoice to open its detail, and choose Mark as unpaid (with confirmation). That clears payment method and date so you can record payment again. Invoice lines and totals are not changed.",
  },
];
