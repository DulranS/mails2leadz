// Read-only enforcement for the Accountant role, on the client.
//
// The real boundary is firestore.rules (no write rule ever names 'accountant'), and
// lib/permissions.ts gives the role no write permission, so DataContext's requirePermission
// already refuses most writes. This is the belt to those braces: every DataContext method whose
// name says it changes something is replaced, for an accountant, by one that throws a plain
// sentence BEFORE any Firestore call is attempted. That matters for the few write paths that
// have no requirePermission line (a convenience wrapper, a bulk import), and it means the person
// sees "view-only access" instead of a raw "Missing or insufficient permissions" from Firestore.
//
// Name-based on purpose: DataContext's value is a flat object and every mutation is named with
// one of these verbs. scripts/verify-accountant-readonly.ts fails if a function on the context
// value is neither a known mutation verb nor on the explicit read-only allowlist, so a newly
// added write method cannot silently slip past this guard.

export const READ_ONLY_MESSAGE =
  "Your accountant login is view-only, so it can't change anything. Ask the business owner to make this change.";

export const MUTATION_NAME = /^(add|update|delete|bulk|cancel|receive|convert|untag|post|discard|fulfill|record|generate|create|revoke|change|set|save|clock|return|mark|close|pay|make|revise|log|move|complete|send)[A-Z]/;

export function isMutationName(name: string): boolean {
  return MUTATION_NAME.test(name);
}

export function withReadOnly<T extends Record<string, any>>(value: T): T {
  const wrapped: Record<string, any> = { ...value };
  for (const name of Object.keys(value)) {
    if (typeof value[name] !== "function" || !isMutationName(name)) continue;
    wrapped[name] = async () => {
      throw new Error(READ_ONLY_MESSAGE);
    };
  }
  return wrapped as T;
}
