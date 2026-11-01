import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../src/history.ts';

test('undo and redo walk back and forth', () => {
  const h = createHistory({ size: 64 });
  h.record({ size: 80 }, 1000);
  h.record({ size: 96 }, 3000);
  assert.deepEqual(h.undo(), { size: 80 });
  assert.deepEqual(h.undo(), { size: 64 });
  assert.equal(h.undo(), null);
  assert.deepEqual(h.redo(), { size: 80 });
  assert.deepEqual(h.redo(), { size: 96 });
  assert.equal(h.redo(), null);
});

test('a quick run of changes (a drag) is one step', () => {
  const h = createHistory({ ls: 0 });
  for (let i = 1; i <= 30; i++) h.record({ ls: i / 1000 }, 1000 + i * 16);
  assert.deepEqual(h.undo(), { ls: 0 });
  assert.equal(h.canUndo(), false);
});

test('a new change clears redo; no-op changes are ignored', () => {
  const h = createHistory({ a: 1 });
  h.record({ a: 2 }, 1000);
  h.undo();
  h.record({ a: 1 }, 5000); // same as current: ignored
  assert.equal(h.canRedo(), true);
  h.record({ a: 3 }, 6000);
  assert.equal(h.canRedo(), false);
  assert.deepEqual(h.undo(), { a: 1 });
});

test('returned states are copies', () => {
  const h = createHistory({ a: 1 });
  h.record({ a: 2 }, 1000);
  const s = h.undo()!;
  s.a = 99;
  assert.deepEqual(h.redo(), { a: 2 });
  assert.deepEqual(h.undo(), { a: 1 });
});
