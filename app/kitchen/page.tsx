"use client";

// Kitchen: the tickets waiting on the kitchen from every open tab, oldest first. Mark each one as it moves along; a served ticket
// leaves the board. Nothing is charged here: payment is taken on the Tabs page.
import { useMemo } from "react";
import type { KitchenTicket } from "@/lib/types";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { KITCHEN_LABEL, kitchenQueue, nextKitchenStatus } from "@/lib/tabKitchen";
import { kitchenTicketHtml } from "@/lib/kitchenPrint";
import { printJob } from "@/lib/thermalPrint";
import { kitchenTicketLines, renderTicket } from "@/lib/escpos";
import { Badge, Button, Card, EmptyState, PageHeader, TableCardSkeleton } from "@/components/ui";

export default function KitchenPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "staff"]);
  const { tabs, setTabTickets, loading } = useData();
  const toast = useToast();
  const queue = useMemo(() => kitchenQueue(tabs), [tabs]);

  if (guardLoading || !allowed) return null;
  if (loading) return <TableCardSkeleton />;

  async function move(tabId: string, ticketId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const next = (tab.tickets ?? []).map((t) => (t.id === ticketId ? { ...t, status: nextKitchenStatus(t.status) } : t));
    try {
      await setTabTickets(tabId, next);
    } catch (e) {
      toast.error("Couldn't update the ticket", toastableErrorMessage(e));
    }
  }

  async function printTicket(table: string, ticket: KitchenTicket) {
    const sentAt = new Date(ticket.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const res = await printJob({
      bytes: renderTicket(kitchenTicketLines(table, sentAt, ticket.status, ticket.items)),
      html: kitchenTicketHtml(table, ticket, sentAt),
    });
    if (res.via === "printer") toast.success("Sent to the kitchen printer", table);
    else if (res.error) toast.error("Ticket not sent to the printer", res.error);
  }

  return (
    <>
      <PageHeader title="Kitchen" />
      {queue.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          body="Tickets appear here when a tab's items are sent to the kitchen from the Tabs page. Each item is only ever sent once."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {queue.map(({ tabId, table, ticket }) => (
            <Card key={ticket.id}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-sm font-medium break-words">{table}</div>
                <Badge tone={ticket.status === "ready" ? "good" : "amber"}>{KITCHEN_LABEL[ticket.status]}</Badge>
              </div>
              <div className="text-xs text-muted num mb-2">
                Sent {new Date(ticket.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="space-y-1 mb-3">
                {ticket.items.map((i, idx) => (
                  <div key={`${ticket.id}-${idx}`} className="text-sm break-words">
                    <span className="num font-medium">{i.qty} ×</span> {i.name}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" className="min-h-[44px]" onClick={() => printTicket(table, ticket)}>
                  Print
                </Button>
                <Button className="flex-1 min-h-[44px]" onClick={() => move(tabId, ticket.id)}>
                  Mark {KITCHEN_LABEL[nextKitchenStatus(ticket.status)].toLowerCase()}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
