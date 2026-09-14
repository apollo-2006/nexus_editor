import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CRDT, Operation, diffToOperations } from './CrdtEngine';
import { SimulatedNetwork } from './SimulatedNetwork';

const NAMES = ['ada', 'grace', 'linus'];

// The document every replica opens with, so the page starts with something to edit.
const SEED = 'shopping list:\n- oat milk\n- coffee';

// The other project demos, linked at the bottom of the page.
const MORE_DEMOS: [string, string][] = [
  ['nexus_db', 'nexus_db'], ['nexus_cluster', 'nexus_cluster'], ['nano_match', 'nano_match'],
  ['custom_mem_alloc', 'custom_mem_alloc'], ['neon_vm', 'neon_vm'], ['photon_tracer', 'photon_tracer'],
  ['cpu_rasterizer', 'cpu_rasterizer'], ['rasterizer_engine', 'rasterizer_engine'], ['oracle-of-delphi', 'oracle_of_delphi'],
];
const COLORS = ['var(--accent)', 'var(--accent-warm)', 'var(--ok)'];

// Apply a remote operation without moving the local cursor: remember which
// character the cursor sat after, and put it back after that character.
function applyKeepingCursor(crdt: CRDT, op: Operation, box: HTMLTextAreaElement | null) {
  if (!box || document.activeElement !== box) { crdt.apply(op); return; }
  const anchor = (i: number) => (i > 0 ? crdt.chars()[i - 1] : null);
  const start = anchor(box.selectionStart), end = anchor(box.selectionEnd);
  crdt.apply(op);
  const locate = (c: ReturnType<typeof anchor>, fallback: number) => {
    if (!c) return 0;
    const i = crdt.indexOfKey(c.position, c.siteId);
    return i >= 0 ? i + 1 : Math.min(fallback, crdt.chars().length);
  };
  const s = locate(start, box.selectionStart), e = locate(end, box.selectionEnd);
  requestAnimationFrame(() => box.setSelectionRange(s, e));
}

function Replica({ index, crdt, net, boxRef, onLocalEdit }: {
  index: number;
  crdt: CRDT;
  net: SimulatedNetwork;
  boxRef: (el: HTMLTextAreaElement | null) => void;
  onLocalEdit: () => void;
}) {
  const text = crdt.getText();
  const offline = net.isOffline(index);
  const q = net.queuedFor(index);
  return (
    <section className="panel replica" style={{ borderTopColor: COLORS[index] }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ margin: 0, color: COLORS[index] }}>{NAMES[index]}</h2>
        <label className="small muted toggle">
          <input type="checkbox" checked={offline} onChange={(e) => net.setOffline(index, e.target.checked)} /> offline
        </label>
      </div>
      <textarea
        ref={boxRef}
        rows={7}
        value={text}
        placeholder="type here"
        spellCheck={false}
        aria-label={`${NAMES[index]}'s editor`}
        onChange={(e) => {
          for (const op of diffToOperations(crdt, text, e.target.value)) net.broadcast(index, op);
          onLocalEdit();
        }}
      />
      <p className="small muted mono" style={{ margin: '6px 0 0' }}>
        {text.length} chars{offline ? ` · ${q.out} unsent, ${q.in} waiting` : ''}
      </p>
    </section>
  );
}

function Demo() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const crdts = useMemo(() => {
    const replicas = NAMES.map((n) => new CRDT(n));
    // Typed once and handed to the other replicas directly, not through the simulated
    // network, so the page opens already converged.
    const seed = diffToOperations(replicas[0], '', SEED);
    replicas.slice(1).forEach((r) => seed.forEach((op) => r.apply(op)));
    return replicas;
  }, []);
  const boxes = useRef<(HTMLTextAreaElement | null)[]>([]);
  const net = useMemo(
    () => new SimulatedNetwork(NAMES.length, (to, op) => applyKeepingCursor(crdts[to], op, boxes.current[to]), () => rerender()),
    [crdts],
  );
  const [latency, setLatency] = useState(net.settings.latencyMs);
  const [jitter, setJitter] = useState(net.settings.jitterMs);
  const [showIds, setShowIds] = useState(false);

  useEffect(() => { net.settings = { latencyMs: latency, jitterMs: jitter }; }, [net, latency, jitter]);

  const texts = crdts.map((c) => c.getText());
  const converged = net.pending === 0 && texts.every((t) => t === texts[0]);

  const race = () => {
    // All three type into the same spot at the same moment.
    const at = Math.floor(texts[0].length / 2);
    crdts.forEach((c, i) => {
      const t = c.getText();
      const pos = Math.min(at, t.length);
      const next = t.slice(0, pos) + `[${NAMES[i]}]` + t.slice(pos);
      for (const op of diffToOperations(c, t, next)) net.broadcast(i, op);
    });
    rerender();
  };

  return (
    <div className="wrap">
      <header className="masthead">
        <div>
          <p className="eyebrow">nexus_editor · CRDT in TypeScript, relay in Go</p>
          <h1>Three editors, one document, no locks</h1>
          <p className="lede">
            Each box is its own replica of the document with its own copy of <span className="mono">CrdtEngine.ts</span>. Edits
            travel between them as the same JSON operations the Go relay forwards, over a network on this page that delays,
            reorders and disconnects them. Type into all three at once. They agree once every message has arrived.
          </p>
        </div>
        <nav className="links">
          <a href="https://github.com/apollo-2006/nexus_editor">source</a>
          <a href="https://abirdeol.tech/projects/nexus-editor">write-up</a>
        </nav>
      </header>

      <div className={`converge ${converged ? 'ok' : ''}`} role="status">
        {converged ? 'converged: all three documents are identical' : `diverged for now · ${net.pending} operation${net.pending === 1 ? '' : 's'} still in flight`}
      </div>

      <div className="grid replicas">
        {crdts.map((c, i) => (
          <Replica key={i} index={i} crdt={c} net={net} boxRef={(el) => { boxes.current[i] = el; }} onLocalEdit={rerender} />
        ))}
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2>Network</h2>
          <div className="ctl">
            <label htmlFor="lat">latency</label>
            <input id="lat" type="range" min={0} max={3000} step={50} value={latency} onChange={(e) => setLatency(+e.target.value)} />
            <output className="mono">{latency} ms</output>
            <label htmlFor="jit">jitter</label>
            <input id="jit" type="range" min={0} max={3000} step={50} value={jitter} onChange={(e) => setJitter(+e.target.value)} />
            <output className="mono">+0..{jitter} ms</output>
          </div>
          <p className="small muted">Jitter larger than the gap between keystrokes makes operations arrive out of order. Take a replica
            offline, edit on both sides, then reconnect it.</p>
          <p className="small muted">The race button has all three type a word into the same spot at the same moment. Convergence alone
            only promises that every replica agrees; a naive fractional index agrees on letters shuffled together. Here each word stays whole,
            because a character typed right after your own previous one extends that character's position instead of splitting the gap.</p>
          <div className="row">
            <button onClick={race}>all three type in the same spot</button>
            <label className="small muted toggle"><input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} /> show positions</label>
          </div>
        </section>

        <section className="panel">
          <h2>How it converges</h2>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Every character gets a position string strictly between its neighbours, so no insert renumbers anyone else's.</li>
            <li>Characters sort by (position, site), a total order every replica computes the same way.</li>
            <li>A delete leaves a tombstone, so it still wins if it arrives before the insert it deletes.</li>
            <li>Applying an operation twice does nothing, so replaying after a reconnect is safe.</li>
          </ul>
        </section>
      </div>

      {showIds && (
        <section className="panel wide" style={{ marginTop: 16 }}>
          <h2>{NAMES[0]}'s document, character by character</h2>
          <div className="table-wrap" style={{ maxHeight: 300, overflow: 'auto' }}>
            <table>
              <thead><tr><th>#</th><th>char</th><th>position</th><th>site</th></tr></thead>
              <tbody>
                {crdts[0].chars().map((c, i) => (
                  <tr key={c.position + c.siteId}>
                    <td className="muted">{i}</td>
                    <td>{c.char === ' ' ? '␠' : c.char === '\n' ? '⏎' : c.char}</td>
                    <td>{c.position}</td>
                    <td style={{ color: COLORS[NAMES.indexOf(c.siteId)] }}>{c.siteId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <nav className="more-demos" aria-label="Other demos">
        <span>more demos</span>
        {MORE_DEMOS.map(([repo, label]) => <a key={repo} href={`https://apollo-2006.github.io/${repo}/`}>{label}</a>)}
        <a className="all" href="https://abirdeol.tech/projects?filter=live">all projects →</a>
      </nav>
      <footer>nexus_editor by <a href="https://abirdeol.tech">Abir Deol</a> · run the Go relay locally and open this page with <span className="mono">?ws=ws://localhost:8080/ws</span> to edit across windows</footer>
    </div>
  );
}

// One editor connected to the Go relay, for running locally across windows.
function RelayEditor({ url }: { url: string }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const crdt = useMemo(() => new CRDT(), []);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    const socket = new WebSocket(url);
    ws.current = socket;
    socket.onopen = () => setStatus('connected');
    socket.onclose = () => setStatus('disconnected');
    socket.onmessage = (event) => {
      applyKeepingCursor(crdt, JSON.parse(event.data) as Operation, box.current);
      rerender();
    };
    return () => socket.close();
  }, [url, crdt]);

  const text = crdt.getText();
  return (
    <div className="wrap">
      <header className="masthead">
        <div>
          <p className="eyebrow">nexus_editor · relay mode</p>
          <h1>Editing through {url}</h1>
          <p className="lede">Open this page in more windows. <span className="mono">{status}</span></p>
        </div>
      </header>
      <textarea
        ref={box}
        rows={20}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          for (const op of diffToOperations(crdt, text, e.target.value)) {
            if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(op));
          }
          rerender();
        }}
      />
    </div>
  );
}

export default function App() {
  const url = new URLSearchParams(location.search).get('ws');
  return url ? <RelayEditor url={url} /> : <Demo />;
}
