import test from 'node:test';
import assert from 'node:assert/strict';

import {
  newTab,
  tabLabel,
  addTab,
  closeTab,
  findTab,
  moveTab,
  anyInFlight,
  nextTabId,
  tabForSavedId,
  tabForPick,
} from './tabs.js';

const tab = (id, extra = {}) => newTab({ id, ...extra });

test('a tab is labelled by its title, then by what it points at', () => {
  assert.equal(tabLabel(tab('a', { title: '登录' })), '登录');
  assert.equal(tabLabel(tab('a', { method: 'post', url: 'https://x.dev/login' })), 'POST https://x.dev/login');
  assert.equal(tabLabel(tab('a', { url: 'https://x.dev/login' })), 'https://x.dev/login');
  assert.equal(tabLabel(tab('a')), '未命名');
  // A title wins over the URL: it is what the user called the thing.
  assert.equal(tabLabel(tab('a', { title: '登录', url: 'https://x.dev/login' })), '登录');
});

test('adding a tab makes it the active one', () => {
  const first = tab('a');
  const { tabs, activeId } = addTab([first], tab('b'));
  assert.deepEqual(tabs.map((t) => t.id), ['a', 'b']);
  assert.equal(activeId, 'b');
});

test('closing a tab moves to its right neighbour', () => {
  const tabs = [tab('a'), tab('b'), tab('c')];
  const { tabs: left, activeId } = closeTab(tabs, 'b');
  assert.deepEqual(left.map((t) => t.id), ['a', 'c']);
  assert.equal(activeId, 'c');
});

test('closing the last tab moves to its left neighbour', () => {
  const tabs = [tab('a'), tab('b'), tab('c')];
  const { tabs: left, activeId } = closeTab(tabs, 'c');
  assert.deepEqual(left.map((t) => t.id), ['a', 'b']);
  assert.equal(activeId, 'b');
});

test('the only tab cannot be closed', () => {
  const tabs = [tab('a')];
  const { tabs: left, activeId } = closeTab(tabs, 'a');
  assert.deepEqual(left.map((t) => t.id), ['a']);
  assert.equal(activeId, 'a');
});

test('closing an unknown id leaves the list alone', () => {
  const tabs = [tab('a'), tab('b')];
  const { tabs: left } = closeTab(tabs, 'nope');
  assert.deepEqual(left.map((t) => t.id), ['a', 'b']);
});

test('moving a tab clamps to the ends', () => {
  const tabs = [tab('a'), tab('b'), tab('c')];
  assert.deepEqual(moveTab(tabs, 'c', 0).map((t) => t.id), ['c', 'a', 'b']);
  assert.deepEqual(moveTab(tabs, 'a', 9).map((t) => t.id), ['b', 'c', 'a']);
  // A move to the place it already is changes nothing.
  assert.deepEqual(moveTab(tabs, 'b', 1).map((t) => t.id), ['a', 'b', 'c']);
  assert.deepEqual(moveTab(tabs, 'nope', 0).map((t) => t.id), ['a', 'b', 'c']);
});

test('sending is tracked per tab, not for the window', () => {
  const tabs = [tab('a'), tab('b')];
  assert.equal(anyInFlight(tabs), false);
  tabs[1].inFlight = true;
  assert.equal(anyInFlight(tabs), true);
  // One tab sending must not make the other look busy.
  assert.equal(tabs[0].inFlight, false);
});

test('a new id does not collide with the tabs already open', () => {
  assert.equal(nextTabId([], 1), 'tab-1');
  assert.equal(nextTabId([tab('tab-1'), tab('tab-2')], 1), 'tab-3');
});

test('picking a request opens a tab of its own instead of replacing one', () => {
  const a = tab('a', { savedId: 'r1' });
  const b = tab('b', { savedId: 'r2' });
  const tabs = [a, b];

  // A third request is not open yet, so it gets a tab of its own: picking is
  // not browsing, and replacing the current tab would lose it.
  assert.deepEqual(tabForPick(tabs, { savedId: 'r3' }), { tab: undefined, reason: 'new' });

  // Already open somewhere: go there rather than open a second copy of it.
  assert.equal(tabForPick(tabs, { savedId: 'r1' }).tab, a);
  assert.equal(tabForPick(tabs, { savedId: 'r1' }).reason, 'open');

  // An empty id is not a request; it must not match every blank tab.
  assert.equal(tabForSavedId([tab('a', { savedId: '' })], ''), undefined);
  assert.equal(tabForSavedId([tab('a', { savedId: 'r1' })], 'r1')?.id, 'a');

  // Every distinct request that is not open asks for a tab of its own.
  assert.equal(tabForPick(tabs, { savedId: 'r4' }).reason, 'new');
  assert.equal(tabForPick(tabs, { savedId: 'r5' }).reason, 'new');
});
