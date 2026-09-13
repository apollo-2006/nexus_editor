# nexus_editor

[![demo](https://github.com/apollo-2006/nexus_editor/actions/workflows/pages.yml/badge.svg)](https://github.com/apollo-2006/nexus_editor/actions/workflows/pages.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A real-time collaborative text editor built from scratch. Several people type into the
same document at the same time, over a network that delays, reorders and drops them
offline, and every copy converges on the same text, with no locking, no operational
transform server, and no "who typed first" arbitration.

**[Type into three editors at once in your browser →](https://apollo-2006.github.io/nexus_editor/)**
Three replicas on one page exchange the same JSON operations the Go relay forwards, over a
simulated network with adjustable latency and jitter and a per-replica offline switch. A
status bar shows when they have converged, and a table shows every character's position.

## The problem

Two users type into the same position at the same instant. A REST API resolves this by
making one of them lose: last write wins, and a keystroke vanishes. Locking resolves it by
making one of them wait, which is unusable at typing latency.

A CRDT resolves it by making the question meaningless: if every operation commutes, the
order they arrive in does not matter, and every replica that has seen the same set of
operations holds the same document. No server arbitration, and no round trip before your
own character appears.

## How it works

### Fractional positions, as strings

Every character gets a position rather than an array index, and a new character's
position is generated strictly between its neighbours' (`frontend/src/position.ts`).
Nobody's insert renumbers anybody else's character, so concurrent inserts never invalidate
each other: a merge is a sorted insert, not a transformation of every operation that came
before.

Positions are digit strings compared lexicographically. The first version used a float
and took the midpoint, and repeatedly typing into the same gap halves it every keystroke:
a float64 runs out of bits after about 50 of those and two characters collide. A string
has no floor; when there is no digit left between two positions it just grows one digit
longer. `positionBetween` never returns a string ending in `0`, because nothing sorts
strictly between `"k"` and `"k0"`, and allowing one would eventually create a gap that
cannot be split.

### A total order, and never reusing a key

Characters sort on `(position, siteId)`. Two users typing into the same gap at once can
still generate the same position, and without the site tie-break each replica would order
them by arrival and diverge. Each site also appends a short tag derived from its id to the
positions it generates, so in practice positions from different sites do not collide at
all.

Generation is deterministic, which caused the one bug the convergence test found: delete a
character and type into the same gap, and the new character got the deleted one's exact
key back. The other replicas hold that key as a tombstone and dropped the new character,
so the typist saw it and nobody else did. A site now steps past any key it has ever used.

### Deletes are tombstones

A delete records the character's key in a tombstone set before removing it. The network
may deliver a delete before the insert it targets; the insert then arrives, finds its key
tombstoned, and stays deleted. Both operations are idempotent, so replaying anything after
a reconnect is safe.

### Edits come from a diff

`diffToOperations` compares the text box before and after a change, finds the one
replaced range, and emits deletes and inserts for it. That covers typing anywhere,
backspace, cut and paste. Remote edits keep the local cursor anchored to the character it
sat after rather than to a numeric offset.

### The relay (Go)

The server forwards operations byte for byte and never parses them; merging is entirely
the clients' job. One hub goroutine owns the client set and all mutation goes through
channels, so there is no mutex on the client map. Each connection gets a read goroutine
and a write goroutine with a buffered send channel, so one slow client cannot block the
broadcast; if its buffer fills it is dropped rather than stalling everyone. Broadcasts
skip the sender, who has already applied its own edit.

## Tests

```bash
cd frontend && npm test     # CRDT
cd backend && go test ./... # relay
```

The CRDT suite includes a randomized convergence test: three replicas make 120 random
concurrent inserts and deletes each round, operations are delivered in random order and
sometimes twice, and after everything arrives all three documents must match, across 60
seeds. It also checks that `positionBetween` stays strictly between its bounds, keeps
splitting one gap 2000 times where a float failed after about 50, and that a delete which
arrives before its insert still wins. The relay test connects two WebSocket clients and
checks a message reaches the other client unchanged and is not echoed to its sender.

## Build & run locally

Requires [Go 1.22+](https://go.dev/) and Node.js.

```bash
cd backend && go run .              # relay on ws://localhost:8080/ws
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173/` for the three-replica demo, or
`http://localhost:5173/?ws=ws://localhost:8080/ws` in several windows to edit through the
relay. GitHub Actions runs both test suites, builds the frontend, and publishes the demo to
Pages on every push to `main`.

## Known limits

* **Concurrent runs can interleave.** If two people type words into the same gap at the
  same moment, the characters can alternate: `[ada]` and `[linus]` typed at once came out
  as `[[aldia]nus]` in the demo. Every replica agrees on the
  result, which is all convergence promises, but it is not what either typed. This is a
  known weakness of fractional-index CRDTs; sequence CRDTs such as RGA and Fugue are
  designed to prevent it. The demo's race button reproduces it.
* **Tombstones are never collected.** The set of deleted keys only grows.
* **Positions grow with edit history.** Heavy editing in one spot lengthens the position
  strings there.
* **No persistence or late join.** Documents live only in each client's memory, and the
  relay stores nothing, so a client that connects late starts empty.
* **One global room**, and `CheckOrigin` accepts every origin, which is fine on localhost
  and not anywhere else. There is no ping/pong or read deadline either, so a connection
  dropped without a close frame lingers.

## Layout

```
backend/main.go                  WebSocket upgrade, read and write pumps
backend/hub.go                   the fan-out hub
frontend/src/position.ts         string fractional positions
frontend/src/CrdtEngine.ts       the CRDT: insert, delete, tombstones, diffing
frontend/src/SimulatedNetwork.ts delayed, reordering, disconnecting network for the demo
frontend/src/App.tsx             three-replica demo, and single-editor relay mode
```

## License

MIT. See [LICENSE](LICENSE).

## Author

**Abir Deol** · [abirdeol.tech](https://abirdeol.tech)
