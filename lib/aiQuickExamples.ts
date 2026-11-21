// A handful of realistic example phrases shown as tappable chips wherever
// someone is staring at an empty AI Assistant composer, unsure what to
// type. Shared between the quick-entry modal (components/ai/QuickAiEntryModal)
// and the full assistant page (app/assistant) so both surfaces teach the
// same vocabulary. Clicking a chip fills the composer — it never sends on
// its own, since "save without reviewing" may be on and these are meant to be edited
// with real numbers, not fired at the ledger verbatim.
export const AI_QUICK_ENTRY_EXAMPLES: string[] = [
  "Sold 5 cement bags to John for 2000 each",
  "Bought 10 widgets from Supplier ABC for 500",
  "Paid 1500 for electricity bill",
  "How much did I spend on stock last month?",
];
