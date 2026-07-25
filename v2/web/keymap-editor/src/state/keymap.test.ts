/**
 * Editing logic only. `loadDemo` fills the store from the built-in sample,
 * which lets every edit/dirty/revert path be exercised with no transport.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { KC_NO } from '../protocol/keycodes';
import { dirtyLayers, dirtyOnLayer, useKeymapStore } from './keymap';

const store = () => useKeymapStore.getState();

describe('keymap store editing', () => {
  beforeEach(() => {
    store().reset();
    store().loadDemo();
  });

  it('loads the sample and starts clean', () => {
    expect(store().phase).toBe('ready');
    expect(store().demo).toBe(true);
    expect(store().layerCount).toBe(7);
    expect(store().dirty.size).toBe(0);
    expect(store().draft).not.toBeNull();
  });

  it('records an edit as dirty and leaves the base untouched', () => {
    const cell = { layer: 0, row: 0, col: 0 };
    const original = store().base?.[0]?.[0]?.[0];
    store().setKey(cell, KC_NO);

    expect(store().draft?.[0]?.[0]?.[0]).toBe(KC_NO);
    expect(store().base?.[0]?.[0]?.[0]).toBe(original);
    expect(store().dirty.has('0,0,0')).toBe(true);
  });

  it('drops the dirty flag when an edit is undone by hand', () => {
    const cell = { layer: 0, row: 1, col: 3 };
    const original = store().base?.[0]?.[1]?.[3] ?? 0;
    store().setKey(cell, KC_NO);
    expect(store().dirty.size).toBe(1);
    store().setKey(cell, original);
    expect(store().dirty.size).toBe(0);
  });

  it('reverts a single cell without touching the others', () => {
    store().setKey({ layer: 0, row: 0, col: 0 }, KC_NO);
    store().setKey({ layer: 0, row: 0, col: 1 }, KC_NO);
    store().revertCell({ layer: 0, row: 0, col: 0 });

    expect(store().dirty.has('0,0,0')).toBe(false);
    expect(store().dirty.has('0,0,1')).toBe(true);
  });

  it('discards every edit at once', () => {
    store().setKey({ layer: 0, row: 0, col: 0 }, KC_NO);
    store().setKey({ layer: 2, row: 1, col: 5 }, KC_NO);
    store().discardEdits();

    expect(store().dirty.size).toBe(0);
    expect(store().draft).toEqual(store().base);
  });

  it('ignores a write to a slot that already holds that keycode', () => {
    const existing = store().base?.[0]?.[0]?.[0] ?? 0;
    store().setKey({ layer: 0, row: 0, col: 0 }, existing);
    expect(store().dirty.size).toBe(0);
  });

  it('clamps setLayer to the reported layer count', () => {
    store().setLayer(3);
    expect(store().layer).toBe(3);
    store().setLayer(99);
    expect(store().layer).toBe(3);
    store().setLayer(-1);
    expect(store().layer).toBe(3);
  });

  it('refuses to write in demo mode', async () => {
    store().setKey({ layer: 0, row: 0, col: 0 }, KC_NO);
    await store().save();
    expect(store().error).toMatch(/デモ/);
    // Nothing was written, so the edit is still pending.
    expect(store().dirty.size).toBe(1);
  });

  it('projects dirty cells onto the layer being viewed', () => {
    store().setKey({ layer: 0, row: 0, col: 0 }, KC_NO);
    store().setKey({ layer: 4, row: 2, col: 7 }, KC_NO);

    expect([...dirtyOnLayer(store().dirty, 0)]).toEqual(['0,0']);
    expect([...dirtyOnLayer(store().dirty, 4)]).toEqual(['2,7']);
    expect(dirtyOnLayer(store().dirty, 1).size).toBe(0);
    expect([...dirtyLayers(store().dirty)].sort()).toEqual([0, 4]);
  });

  it('clears everything on reset', () => {
    store().setKey({ layer: 0, row: 0, col: 0 }, KC_NO);
    store().reset();
    expect(store().phase).toBe('idle');
    expect(store().demo).toBe(false);
    expect(store().draft).toBeNull();
    expect(store().dirty.size).toBe(0);
  });
});
