import type { Operation } from './CrdtEngine';

// The network between the replicas on the demo page. It carries the same JSON
// the Go relay forwards, with the hazards a real network has: every message is
// delayed, delays vary so messages overtake each other, and a replica can drop
// offline and exchange nothing until it comes back.

export interface NetworkSettings {
  latencyMs: number;
  jitterMs: number;
}

type Deliver = (to: number, op: Operation) => void;

export class SimulatedNetwork {
  settings: NetworkSettings = { latencyMs: 400, jitterMs: 600 };
  private offline = new Set<number>();
  private outbox = new Map<number, Operation[]>(); // sent while the sender was offline
  private inbox = new Map<number, Operation[]>();  // arrived while the receiver was offline
  private inFlight = 0;

  constructor(
    private readonly peers: number,
    private readonly deliver: Deliver,
    private readonly onChange: () => void,
  ) {
    for (let p = 0; p < peers; p++) { this.outbox.set(p, []); this.inbox.set(p, []); }
  }

  /** Messages sent but not yet applied anywhere. */
  get pending(): number {
    let n = this.inFlight;
    for (let p = 0; p < this.peers; p++) n += this.outbox.get(p)!.length + this.inbox.get(p)!.length;
    return n;
  }

  queuedFor(peer: number): { out: number; in: number } {
    return { out: this.outbox.get(peer)!.length, in: this.inbox.get(peer)!.length };
  }

  isOffline(peer: number): boolean {
    return this.offline.has(peer);
  }

  setOffline(peer: number, off: boolean): void {
    if (off) {
      this.offline.add(peer);
    } else {
      this.offline.delete(peer);
      const incoming = this.inbox.get(peer)!.splice(0);
      for (const op of incoming) this.deliver(peer, op);
      const outgoing = this.outbox.get(peer)!.splice(0);
      for (const op of outgoing) this.broadcast(peer, op);
    }
    this.onChange();
  }

  broadcast(from: number, op: Operation): void {
    if (this.offline.has(from)) {
      this.outbox.get(from)!.push(op);
      this.onChange();
      return;
    }
    for (let to = 0; to < this.peers; to++) {
      if (to === from) continue;
      this.inFlight++;
      const delay = this.settings.latencyMs + Math.random() * this.settings.jitterMs;
      setTimeout(() => {
        this.inFlight--;
        if (this.offline.has(to)) this.inbox.get(to)!.push(op);
        else this.deliver(to, op);
        this.onChange();
      }, delay);
    }
    this.onChange();
  }
}
