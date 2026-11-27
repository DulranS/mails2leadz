// lib/roles.js - what a team role may do, and the custom roles an owner defines. PURE (no imports): the gate (proxy.js), the routes,
// the team page and the tests all read this one list.
//
// Built-in roles. Every existing team member keeps exactly the access they have today (tests/roles-v405.test.mjs checks it):
//   owner    every permission (plus the owner-only areas in lib/workspace-access.js: plan, keys, mailbox, deleting the account)
//   manager  view, edit, sendEmail, exportData, changeSettings        (NOT manageTeam)
//   viewer   view, exportData   (the gate already allows a viewer only GET calls; exportData is the accountant CSV, which a viewer
//            could download before roles existed)
//
// A custom role is a name plus a subset of PERMISSIONS. "view" is always included, so every role can at least see the workspace.
// Checked in two places: the gate (proxy.js) for every /api call via requiredPermission(), and the routes that export, send,
// change settings or manage the team (requirePermission in lib/server/route-helpers.js).

export const PERMISSIONS = ['view', 'edit', 'sendEmail', 'exportData', 'changeSettings', 'manageTeam'];

export const PERMISSION_LABELS = {
  view: 'See the workspace',
  edit: 'Change records (deals, leads, customers, invoices, tasks)',
  sendEmail: 'Send emails and texts, and send broadcasts',
  exportData: 'Download files (accountant CSV, a person\'s data)',
  changeSettings: 'Change settings (booking, autopilot, website, deal rules)',
  manageTeam: 'Invite people, change roles and custom roles',
};

export const BUILTIN_PERMISSIONS = {
  owner: [...PERMISSIONS],
  manager: ['view', 'edit', 'sendEmail', 'exportData', 'changeSettings'],
  viewer: ['view', 'exportData'],
};

export const MAX_CUSTOM_ROLES = 10;
export const ROLE_NAME_MIN = 2;
export const ROLE_NAME_MAX = 40;
const RESERVED_NAMES = ['owner', 'manager', 'viewer', 'custom'];

// Routes that need a particular permission. Everything not listed needs "edit" (writes) or "view" (reads).
const SEND_ROUTES = ['/api/send-email', '/api/send-new-leads', '/api/send-followup', '/api/send-sms'];
const EXPORT_ROUTES = ['/api/exports', '/api/contacts/export'];
const SETTINGS_ROUTES = ['/api/booking/settings', '/api/deals/owner-settings', '/api/site/settings', '/api/automation-control'];
const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

const fail = (code, error) => ({ ok: false, code, error });
const startsWithPath = (p, prefix) => p === prefix || p.startsWith(`${prefix}/`);

export const isPermission = (p) => PERMISSIONS.includes(p);

/** The known permissions in a stored list, in the canonical order, with "view" always present. Unknown entries are dropped. */
export function sanitizePermissions(list) {
  const given = Array.isArray(list) ? list : [];
  return PERMISSIONS.filter((p) => p === 'view' || given.includes(p));
}

/** What a role may do. `customPerms` is only read for a custom role (the list copied onto the person's record). Unknown roles get the least. */
export function permissionsFor(role, customPerms) {
  if (role === 'owner') return [...BUILTIN_PERMISSIONS.owner];
  if (role === 'manager') return [...BUILTIN_PERMISSIONS.manager];
  if (role === 'custom') return sanitizePermissions(customPerms);
  return [...BUILTIN_PERMISSIONS.viewer];
}

export const can = (perms, permission) => Array.isArray(perms) && isPermission(permission) && perms.includes(permission);

/** May someone holding `actorPerms` give or change a role with `targetPerms`? Nobody hands out more than they have. */
export const canGrant = (actorPerms, targetPerms) => (Array.isArray(targetPerms) ? targetPerms : []).every((p) => can(actorPerms, p));

/**
 * The permission a request needs, decided from its method and path. null = the route decides for itself (team management).
 * GET/HEAD/OPTIONS need "view"; export routes need "exportData"; send routes need "sendEmail"; settings routes need "changeSettings";
 * any other change needs "edit". The send, export and settings routes also check this themselves (requirePermission).
 */
export function requiredPermission(method, pathname) {
  const p = String(pathname || '');
  const m = String(method || 'GET').toUpperCase();
  if (startsWithPath(p, '/api/team')) return null;
  if (EXPORT_ROUTES.some((x) => startsWithPath(p, x))) return 'exportData';
  if (READ_METHODS.includes(m)) return 'view';
  if (SEND_ROUTES.some((x) => startsWithPath(p, x))) return 'sendEmail';
  if (SETTINGS_ROUTES.some((x) => startsWithPath(p, x))) return 'changeSettings';
  return 'edit';
}

const nameKey = (n) => String(n).trim().toLowerCase();
const nameTaken = (list, name, exceptId) => list.some((r) => r.id !== exceptId && nameKey(r.name) === nameKey(name));

/**
 * Checks a custom role's name and permissions. The name is 2 to 40 characters after trimming, and cannot be a built-in role's name.
 * An unknown permission is refused (not silently dropped), so a typo never grants less than the owner chose.
 * @returns {{ok:true, role:{name:string, permissions:string[]}} | {ok:false, code:string, error:string}}
 */
export function sanitizeRole(input) {
  const raw = input && typeof input === 'object' ? input : {};
  // eslint-disable-next-line no-control-regex
  const name = String(raw.name ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (name.length < ROLE_NAME_MIN || name.length > ROLE_NAME_MAX) {
    return fail('BAD_NAME', `A role name is ${ROLE_NAME_MIN} to ${ROLE_NAME_MAX} characters.`);
  }
  if (RESERVED_NAMES.includes(name.toLowerCase())) return fail('BAD_NAME', 'That name belongs to a built-in role. Choose another.');
  if (raw.permissions !== undefined && !Array.isArray(raw.permissions)) return fail('BAD_PERMISSIONS', 'Permissions must be a list.');
  const list = raw.permissions || [];
  const unknown = list.filter((p) => !isPermission(p));
  if (unknown.length) return fail('UNKNOWN_PERMISSION', `Unknown permission: ${unknown.map((p) => String(p).slice(0, 40)).join(', ')}.`);
  return { ok: true, role: { name, permissions: sanitizePermissions(list) } };
}

/** Reads the stored list back (it may be edited by hand in the database): keeps only valid roles, at most the cap. */
export function sanitizeStoredRoles(raw) {
  const out = [];
  const seen = new Set();
  for (const r of Array.isArray(raw) ? raw : []) {
    const id = String(r?.id || '');
    if (!/^r_[a-f0-9]{6,32}$/.test(id) || seen.has(id)) continue;
    const s = sanitizeRole(r);
    if (!s.ok) continue;
    seen.add(id);
    out.push({ id, name: s.role.name, permissions: s.role.permissions });
    if (out.length >= MAX_CUSTOM_ROLES) break;
  }
  return out;
}

/** Adds a custom role. `newId` is made by the caller (the database layer), so this stays pure. */
export function addRole(existing, input, newId) {
  const list = Array.isArray(existing) ? existing : [];
  if (list.length >= MAX_CUSTOM_ROLES) return fail('TOO_MANY_ROLES', `An account can have up to ${MAX_CUSTOM_ROLES} custom roles. Delete one first.`);
  const s = sanitizeRole(input);
  if (!s.ok) return s;
  if (nameTaken(list, s.role.name, null)) return fail('DUPLICATE_NAME', 'A role with that name already exists.');
  return { ok: true, roles: [...list, { id: String(newId), ...s.role }] };
}

/** Renames and/or changes the permissions of one custom role. */
export function updateRole(existing, id, input) {
  const list = Array.isArray(existing) ? existing : [];
  if (!list.some((r) => r.id === id)) return fail('NOT_FOUND', 'That role was not found.');
  const s = sanitizeRole(input);
  if (!s.ok) return s;
  if (nameTaken(list, s.role.name, id)) return fail('DUPLICATE_NAME', 'A role with that name already exists.');
  return { ok: true, roles: list.map((r) => (r.id === id ? { id, ...s.role } : r)) };
}

/** Deletes one custom role. Refused while anyone (or any invite) still holds it: move them first, so nobody silently changes access. */
export function removeRole(existing, id, holders) {
  const list = Array.isArray(existing) ? existing : [];
  if (!list.some((r) => r.id === id)) return fail('NOT_FOUND', 'That role was not found.');
  if (Number(holders) > 0) return fail('IN_USE', `${holders} ${Number(holders) === 1 ? 'person or invite uses' : 'people or invites use'} this role. Move them to another role first.`);
  return { ok: true, roles: list.filter((r) => r.id !== id) };
}

/** The role a chosen value stands for: 'manager' or 'viewer', or a custom role's id. null when it matches nothing. */
export function resolveRoleChoice(choice, customRoles = []) {
  const c = String(choice || '');
  if (c === 'manager' || c === 'viewer') return { role: c, custom: null, perms: [...BUILTIN_PERMISSIONS[c]] };
  const custom = (Array.isArray(customRoles) ? customRoles : []).find((r) => r.id === c);
  return custom ? { role: 'custom', custom, perms: sanitizePermissions(custom.permissions) } : null;
}
