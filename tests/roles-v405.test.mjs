// Custom roles (lib/roles.js) and the built-in roles. Pure modules only, so this runs without the database packages installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeAccess } from '../lib/workspace-access.js';
import {
  PERMISSIONS, BUILTIN_PERMISSIONS, MAX_CUSTOM_ROLES, can, canGrant, permissionsFor, requiredPermission,
  sanitizeRole, sanitizeStoredRoles, addRole, updateRole, removeRole, resolveRoleChoice,
} from '../lib/roles.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Expected built-in access, written from what the code does today (routeAccess in lib/workspace-access.js, plus the
// route-level checks). Owner: everything. Manager: all daily work, not the team. Viewer: GET only, plus the accountant CSV download.
test('built-in roles: exact permission table', () => {
  assert.deepEqual(BUILTIN_PERMISSIONS.owner, ['view', 'edit', 'sendEmail', 'exportData', 'changeSettings', 'manageTeam']);
  assert.deepEqual(BUILTIN_PERMISSIONS.manager, ['view', 'edit', 'sendEmail', 'exportData', 'changeSettings']);
  assert.deepEqual(BUILTIN_PERMISSIONS.viewer, ['view', 'exportData']);
  assert.equal(can(permissionsFor('manager'), 'manageTeam'), false);
  assert.equal(can(permissionsFor('viewer'), 'edit'), false);
  assert.equal(can(permissionsFor('mystery'), 'edit'), false); // an unknown role gets the least
});

// Every route file under app/api, every method: the permission layer must never refuse something the gate allowed for a built-in role.
test('built-in roles keep today\'s access on every API route', () => {
  const routes = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'route.js') {
        const rel = path.relative(path.join(root, 'app'), path.dirname(p)).split(path.sep).join('/');
        routes.push('/' + rel.replace(/\[[^\]]+\]/g, 'x'));
      }
    }
  };
  walk(path.join(root, 'app', 'api'));
  assert.ok(routes.length > 100, 'found the API routes');
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  for (const role of ['owner', 'manager', 'viewer']) {
    const perms = permissionsFor(role);
    for (const r of routes) for (const m of methods) {
      if (!routeAccess(role, m, r).ok) continue; // the gate already refuses it, as before
      const need = requiredPermission(m, r);
      assert.ok(need === null || can(perms, need), `${role} ${m} ${r} needs ${need}`);
    }
  }
  // the one place a viewer's GET differs from the rest: the accountant CSV
  assert.equal(requiredPermission('GET', '/api/exports/accounting'), 'exportData');
  assert.ok(can(permissionsFor('viewer'), 'exportData'));
  assert.equal(routeAccess('viewer', 'POST', '/api/contacts/export').code, 'VIEW_ONLY');
});

test('which permission each sensitive route needs', () => {
  assert.equal(requiredPermission('POST', '/api/send-email'), 'sendEmail');
  assert.equal(requiredPermission('POST', '/api/send-sms'), 'sendEmail');
  assert.equal(requiredPermission('POST', '/api/contacts/export'), 'exportData');
  assert.equal(requiredPermission('POST', '/api/automation-control'), 'changeSettings');
  assert.equal(requiredPermission('GET', '/api/automation-control'), 'view');
  assert.equal(requiredPermission('POST', '/api/team'), null); // the route checks Manage team itself
  assert.equal(requiredPermission('POST', '/api/deals'), 'edit');
  assert.equal(requiredPermission('GET', '/api/deals'), 'view');
});

test('a custom role with only view cannot export', () => {
  const reader = sanitizeRole({ name: 'Reader', permissions: [] });
  assert.ok(reader.ok);
  assert.deepEqual(reader.role.permissions, ['view']);
  assert.equal(can(reader.role.permissions, requiredPermission('GET', '/api/exports/accounting')), false);
  assert.equal(can(reader.role.permissions, requiredPermission('POST', '/api/contacts/export')), false);
  assert.equal(can(reader.role.permissions, requiredPermission('POST', '/api/send-email')), false);
});

test('an unknown permission name is refused, not silently dropped', () => {
  const r = sanitizeRole({ name: 'Sales rep', permissions: ['edit', 'launchRockets'] });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'UNKNOWN_PERMISSION');
  assert.equal(sanitizeRole({ name: 'Sales rep', permissions: 'edit' }).code, 'BAD_PERMISSIONS');
});

test('a role cannot be named empty (or too short or too long)', () => {
  for (const name of ['', '   ', 'a', undefined, 'x'.repeat(41), '\u0000\u0001']) {
    assert.equal(sanitizeRole({ name, permissions: ['edit'] }).code, 'BAD_NAME', JSON.stringify(name));
  }
  const ok = sanitizeRole({ name: 'x'.repeat(40), permissions: [] });
  assert.ok(ok.ok);
  assert.equal(sanitizeRole({ name: '  Sales   rep  ', permissions: ['edit'] }).role.name, 'Sales rep');
  assert.equal(sanitizeRole({ name: 'Owner', permissions: [] }).code, 'BAD_NAME'); // built-in names are reserved
});

test('an account can have at most 10 custom roles', () => {
  assert.equal(MAX_CUSTOM_ROLES, 10);
  const nine = Array.from({ length: 9 }, (_, i) => ({ id: `r_00000${i}`, name: `Role ${i}`, permissions: ['view'] }));
  const ten = [...nine, { id: 'r_0000ff', name: 'Tenth', permissions: ['view'] }];
  assert.ok(addRole(nine, { name: 'Tenth', permissions: [] }, 'r_0000ff').ok);
  assert.equal(addRole(ten, { name: 'Eleventh', permissions: [] }, 'r_0000fe').code, 'TOO_MANY_ROLES');
  assert.equal(sanitizeStoredRoles([...ten, { id: 'r_0000fe', name: 'Eleventh', permissions: [] }]).length, 10);
});

test('names are unique, and rename keeps the id', () => {
  const list = [{ id: 'r_aaaaaa', name: 'Sales', permissions: ['view'] }, { id: 'r_bbbbbb', name: 'Support', permissions: ['view'] }];
  assert.equal(addRole(list, { name: 'sales', permissions: [] }, 'r_cccccc').code, 'DUPLICATE_NAME');
  assert.equal(updateRole(list, 'r_bbbbbb', { name: 'Sales', permissions: [] }).code, 'DUPLICATE_NAME');
  const renamed = updateRole(list, 'r_bbbbbb', { name: 'Help desk', permissions: ['edit'] });
  assert.equal(renamed.roles[1].id, 'r_bbbbbb');
  assert.deepEqual(renamed.roles[1].permissions, ['view', 'edit']);
  assert.equal(updateRole(list, 'r_zzzzzz', { name: 'Other', permissions: [] }).code, 'NOT_FOUND');
});

test('a role in use cannot be deleted', () => {
  const list = [{ id: 'r_aaaaaa', name: 'Sales', permissions: ['view'] }];
  assert.equal(removeRole(list, 'r_aaaaaa', 2).code, 'IN_USE');
  assert.deepEqual(removeRole(list, 'r_aaaaaa', 0).roles, []);
  assert.equal(removeRole(list, 'r_zzzzzz', 0).code, 'NOT_FOUND');
});

test('nobody hands out more permissions than they hold', () => {
  const editOnly = ['view', 'edit'];
  assert.equal(canGrant(editOnly, BUILTIN_PERMISSIONS.manager), false);
  assert.equal(canGrant(editOnly, BUILTIN_PERMISSIONS.viewer), false);
  assert.equal(canGrant(editOnly, ['view']), true);
  assert.equal(canGrant(PERMISSIONS, BUILTIN_PERMISSIONS.manager), true); // the owner can give anything
});

test('choosing a role: built-in names or a custom id, never owner', () => {
  const custom = [{ id: 'r_aaaaaa', name: 'Sales', permissions: ['view', 'edit'] }];
  assert.equal(resolveRoleChoice('manager', custom).role, 'manager');
  assert.equal(resolveRoleChoice('r_aaaaaa', custom).role, 'custom');
  assert.deepEqual(resolveRoleChoice('r_aaaaaa', custom).perms, ['view', 'edit']);
  assert.equal(resolveRoleChoice('owner', custom), null);
  assert.equal(resolveRoleChoice('r_missing', custom), null);
});

test('a custom role with no list of permissions on the record gets view only', () => {
  assert.deepEqual(permissionsFor('custom', undefined), ['view']);
  assert.deepEqual(permissionsFor('custom', ['launchRockets', 'export']), ['view']);
});

test('database rules: custom roles get only edit and changeSettings, and nothing else is granted', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(/function teamWrites\(ownerId\)[\s\S]*'edit' in/.test(rules));
  assert.ok(/function teamWritesSettings\(ownerId\)[\s\S]*'changeSettings' in/.test(rules));
  assert.ok(rules.includes("'team_roles'"), 'custom role definitions stay server-only');
});
