"use client";

// The next two weeks of capacity for the signed-in business (lib/capacity.ts). Shared by the Capacity tab and the Agenda.
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { todayIso } from "@/lib/format";
import { capacityFor, nextDays, type CapacityDay } from "@/lib/capacity";

export function useCapacity(horizon = 14): CapacityDay[] {
  const { shifts, leaveRecords, bookings } = useData();
  const today = todayIso();
  return useMemo(() => capacityFor(nextDays(today, horizon), shifts, leaveRecords, bookings), [shifts, leaveRecords, bookings, today, horizon]);
}
