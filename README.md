# nexus_editor

A real-time collaborative editor built from scratch. Two people type into the same
document at the same time and both converge on the same text, with no locking, no
operational transform server, and no "who typed first" arbitration.

> **Status: prototype.** The CRDT merge, the fractional index, and the Go fan-out work.
> Insert-at-cursor and delete do not — see [What isn't here](#what-isnt-here). Treat this
> as the consensus mechanism working, not a usable editor.

## The problem

Two users type into the same position at the same instant. A REST API resolves this by
making one of them lose — last write wins, and a keystroke vanishes. Locking resolves it
by making one of them wait, which is unusable at typing latency.

A CRDT resolves it by making the question meaningless: if every operation commutes, the
order they arrive in does not matter, and every replica that has seen the same set of
operations holds the same document. No server arbitration, and no round trip before your
own character appears.

## How it works

### Fractional indexing

Every character gets a fractional position rather than an array index. Inserting between
positions `1.0` and `2.0` generates `1.5`; inserting between `1.0` and `1.5` generates
`1.25`. Because nobody's insert renumbers anybody else's character, concurrent inserts
never invalidate each other — a merge is a push and a sort, not a transformation of every
operation that came before.

### Ties are broken on site ID

Position alone is not a total order. Two users typing into the same gap concurrently
generate the *same* fractional position, and sorting a tie falls back on array order,
which is arrival order, which differs per machine. Two replicas would then order the tie
differently and diverge — the exact failure a CRDT exists to prevent.

Each character therefore sorts on `(position, siteId)`. The site ID is unique per client,
so the key is globally unique and every replica agrees on the same total order.

### Idempotent merges

`remoteInsert` ignores a character it already holds under the same `(position, siteId)`
key, so replaying an operation is a no-op. That is what makes it safe to re-send on
reconnect.

### The fan-out (Go)

One hub goroutine owns the client set; all mutation goes through channels, so there is no
mutex on the client map. Each connection gets a read goroutine and a write goroutine with
a buffered send channel, so one slow client cannot block the broadcast — if its buffer
fills, it is dropped rather than stalling everyone.

Broadcasts are tagged with the sending client and skipped for that client. The sender has
already applied its own character locally; echoing it back made every keystroke appear
twice on the machine that typed it.

## Build & run

### Backend

Requires [Go 1.22+](https://go.dev/).

```bash
cd backend
go mod download
go run .
```

Listens on `ws://localhost:8080/ws`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite serves on `http://localhost:5173`. Open it in two windows and type in one.

## What isn't here

* **Insert is append-only.** `handleInput` takes the last character of the textarea and
  assumes it was appended. Typing in the middle of the document inserts at the end
  instead. Real cursor offsets are the missing piece, and the CRDT below already supports
  them — `localInsert` takes an index.
* **There is no delete.** The `"delete"` action exists in the Go message type and is
  never sent or handled. Worse, backspacing currently re-inserts the new final character,
  because `handleInput` cannot tell an insert from a deletion. A tombstone-based delete is
  the next thing to build.
* **Fractional positions run out of precision.** Repeatedly inserting between the same two
  characters halves the gap each time, and a float64 exhausts its mantissa after about 50
  such inserts, at which point two characters collide. Production systems use an unbounded
  list of digits (LSEQ, Logoot) rather than a single float.
* **No persistence.** The document lives only in each client's memory. The server routes
  operations and stores nothing, so a client joining late sees an empty document.
* **One global room.** Every connection shares one document; there is no room or document
  ID.
* **`CheckOrigin` returns true.** Every origin is accepted, which is fine on localhost and
  not fine anywhere else.
* **No ping/pong or read deadline.** A connection dropped without a close frame lingers.

## Stack

Go with `gorilla/websocket`; React 18, TypeScript and Vite; JSON over WebSocket.

## Author

**Abir Deol**
