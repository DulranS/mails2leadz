"use client";

import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { todayIso } from "@/lib/format";
import { buildCollectionQueue, collectionPayments, computeCollectorBoard, summarizeCollectionQueue } from "@/lib/collections";

// The collections queue for the page you are on, built from what the business already keeps: open invoices,
// loans it made, and the contact diary (lib/collections.ts has the rules). Shared by the Collections page and
// the reminder buttons on Money lent out so both always agree on who is late and what they last said.
export function useCollections() {
  const {
    receivablesAging, customers, lendingPortfolio, collectionNotes,
    sales, openingBalances, receivablePayments, lentLoans, lentLoanTxns,
  } = useData();
  return useMemo(() => {
    const today = todayIso();
    const payments = collectionPayments({ sales, openingBalances, receivablePayments, lentLoans, lentLoanTxns });
    const items = buildCollectionQueue({
      today,
      receivableLines: receivablesAging.lines,
      customers,
      lentSummaries: lendingPortfolio.loans,
      notes: collectionNotes,
      payments,
    });
    return {
      today,
      items,
      payments,
      totals: summarizeCollectionQueue(items),
      board: computeCollectorBoard(items, payments, collectionNotes, today.slice(0, 7)),
    };
  }, [receivablesAging, customers, lendingPortfolio, collectionNotes, sales, openingBalances, receivablePayments, lentLoans, lentLoanTxns]);
}
