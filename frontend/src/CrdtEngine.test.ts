import { describe, expect, it } from 'vitest';
import { CRDT, Operation, diffToOperations } from './CrdtEngine';
import { positionBetween } from './position';

// Small deterministic PRNG so a failing seed reproduces.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('positionBetween', () => {
  it('is strictly between its bounds and never ends in 0', () => {
    const r = rng(1);
    const pool = [positionBetween('', null)];
    for (let n = 0; n < 5000; n++) {
      const sorted = [...pool].sort();
      const i = Math.floor(r() * (sorted.length + 1));
      const lo = i === 0 ? '' : sorted[i - 1];
      const hi = i === sorted.length ? null : sorted[i];
      if (hi !== null && !(lo < hi)) continue;
      const p = positionBetween(lo, hi);
      expect(p > lo).toBe(true);
      if (hi !== null) expect(p < hi).toBe(true);
      expect(p.endsWith('0')).toBe(false);
      pool.push(p);
    }
  });

  it('keeps splitting the same gap long after a float would have run out', () => {
    let hi: string = positionBetween('', null);
    for (let i = 0; i < 2000; i++) {
      const p = positionBetween('', hi);
      expect(p < hi).toBe(true);
      hi = p; // always insert at the very front: the worst case for halving
    }
    expect(hi.length).toBeLessThan(2000);
  });
});

describe('CRDT', () => {
  it('inserts and deletes at an index', () => {
    const a = new CRDT('a');
    let text = '';
    for (const next of ['hello', 'help', 'yelp!', 'y-elp!']) {
      diffToOperations(a, text, next);
      text = next;
    }
    expect(a.getText()).toBe('y-elp!');
  });

  it('typing into the middle 300 times keeps order', () => {
    const a = new CRDT('a');
    let text = '[]';
    diffToOperations(a, '', text);
    for (let i = 0; i < 300; i++) {
      const next = text.slice(0, 1 + i) + String.fromCharCode(97 + (i % 26)) + text.slice(1 + i);
      diffToOperations(a, text, next);
      text = next;
    }
    expect(a.getText()).toBe(text);
  });

  it('retyping into a gap after a delete does not reuse the deleted key', () => {
    // Found by the convergence test: generation is deterministic, so the new
    // character got the tombstoned key back and every other replica dropped it.
    const a = new CRDT('a'), b = new CRDT('b');
    const ops = [
      ...diffToOperations(a, '', 'ac'),
      ...diffToOperations(a, 'ac', 'abc'),
      ...diffToOperations(a, 'abc', 'ac'),
      ...diffToOperations(a, 'ac', 'abc'),
    ];
    ops.forEach((op) => b.apply(op));
    expect(a.getText()).toBe('abc');
    expect(b.getText()).toBe('abc');
  });

  it('two people appending at the same place keep their words whole', () => {
    // The case the demo page exposed: one person adds a line while another
    // extends the last word, both at the end of the document, at the same time.
    const base = 'shopping list:\n- coffee';
    const grace = new CRDT('grace'), linus = new CRDT('linus');
    const seed = diffToOperations(grace, '', base);
    seed.forEach((op) => linus.apply(op));
    const fromGrace = diffToOperations(grace, base, base + '\n- eggs');
    const fromLinus = diffToOperations(linus, base, base + ' beans');
    fromLinus.forEach((op) => grace.apply(op));
    fromGrace.forEach((op) => linus.apply(op));
    expect(grace.getText()).toBe(linus.getText());
    expect(grace.getText()).toContain('\n- eggs');
    expect(grace.getText()).toContain(' beans');
  });

  it('three concurrent runs typed into one gap stay contiguous', () => {
    const sites = ['ada', 'grace', 'linus'].map((id) => new CRDT(id));
    const seed = diffToOperations(sites[0], '', '<>');
    sites.slice(1).forEach((s) => seed.forEach((op) => s.apply(op)));
    // Each types one character at a time, as a keyboard does, before anything arrives.
    const ops = sites.map((s) => {
      let text = '<>';
      const out = [];
      for (const ch of `[${s.siteId}]`) {
        const next = text.slice(0, text.length - 1) + ch + '>';
        out.push(...diffToOperations(s, text, next));
        text = next;
      }
      return out;
    });
    sites.forEach((s, i) => ops.forEach((o, j) => { if (i !== j) o.forEach((op) => s.apply(op)); }));
    const final = sites[0].getText();
    sites.forEach((s) => expect(s.getText()).toBe(final));
    for (const name of ['[ada]', '[grace]', '[linus]']) expect(final).toContain(name);
  });

  it('a long run of sequential typing keeps positions short', () => {
    const a = new CRDT('a');
    let text = '';
    for (let i = 0; i < 2000; i++) {
      diffToOperations(a, text, text + 'x');
      text += 'x';
    }
    const longest = Math.max(...a.chars().map((c) => c.position.length));
    expect(longest).toBeLessThan(200);
  });

  it('a delete that arrives before its insert still wins', () => {
    const a = new CRDT('a'), b = new CRDT('b');
    const [ins] = diffToOperations(a, '', 'x');
    const [del] = diffToOperations(a, 'x', '');
    b.apply(del);
    b.apply(ins);
    expect(b.getText()).toBe('');
  });

  it('replicas converge under random concurrent edits and random delivery order', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed);
      const sites = ['s1', 's2', 's3'].map((id) => new CRDT(id));
      const inboxes: Operation[][] = sites.map(() => []);

      for (let step = 0; step < 120; step++) {
        const who = Math.floor(r() * sites.length);
        const t = sites[who].getText();
        let next: string;
        if (t.length && r() < 0.35) {
          const at = Math.floor(r() * t.length);
          const len = 1 + Math.floor(r() * Math.min(3, t.length - at));
          next = t.slice(0, at) + t.slice(at + len);
        } else {
          const at = Math.floor(r() * (t.length + 1));
          next = t.slice(0, at) + 'abcxyz'.slice(0, 1 + Math.floor(r() * 3)) + t.slice(at);
        }
        const ops = diffToOperations(sites[who], t, next);
        expect(sites[who].getText()).toBe(next);
        inboxes.forEach((box, i) => { if (i !== who) box.push(...ops); });

        // Deliver a random subset, in a random order, sometimes twice.
        for (let i = 0; i < sites.length; i++) {
          while (inboxes[i].length && r() < 0.5) {
            const [op] = inboxes[i].splice(Math.floor(r() * inboxes[i].length), 1);
            sites[i].apply(op);
            if (r() < 0.1) sites[i].apply(op);
          }
        }
      }
      for (let i = 0; i < sites.length; i++) {
        while (inboxes[i].length) {
          const [op] = inboxes[i].splice(Math.floor(r() * inboxes[i].length), 1);
          sites[i].apply(op);
        }
      }
      const final = sites.map((s) => s.getText());
      expect(final[1], `seed ${seed}`).toBe(final[0]);
      expect(final[2], `seed ${seed}`).toBe(final[0]);
    }
  });
});
