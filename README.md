# nexus_editor
A high-performance, real-time collaborative code editor built from scratch. Nexus resolves concurrent typing conflicts without centralized database locking by implementing a custom Conflict-free Replicated Data Type (CRDT) algorithm over full-duplex WebSockets.

## How It Works
* **The Math Engine (CRDT)**: Implements a fractional-indexing algorithm. Every character typed is assigned a universally unique, mathematically sortable identifier (e.g., typing between index 1.0 and 2.0 generates index 1.5). This allows divergent client states to merge concurrently without corrupting the document.
* **The Network Layer (Go)**: A lightweight WebSocket router utilizing Go's native concurrency model. Spawns isolated Goroutines per connected client to handle non-blocking binary payload broadcasts across hundreds of active sessions.
* **The Interface (React/TS)**: A strict TypeScript frontend powered by Vite, handling local state mutation and instant UI updates while seamlessly syncing remote payloads in the background.

## Why This Exists
Standard REST APIs fail when multiple users edit the same data simultaneously. Nexus bypasses this using distributed systems theory — the server never asks "who typed first." It blindly routes mathematical CRDT objects, guaranteeing eventual consistency across all connected clients.

## Tech Stack
* **Backend**: Go (Golang), `gorilla/websocket`
* **Frontend**: React 18, TypeScript, Vite
* **Protocol**: TCP WebSockets (JSON payload serialization)

## Build & Run

### Backend
Requires [Go 1.22+](https://go.dev/).
```bash
cd backend
go mod download
go run main.go hub.go
```
The WebSocket server will begin listening on `ws://localhost:8080`.

### Frontend
Requires [Node.js](https://nodejs.org/).
```bash
cd frontend
npm install
npm run dev
```
Vite will launch the dev server on `http://localhost:5173`.

### Testing Concurrency
Open the frontend URL in two separate browser windows. Type in one and watch the CRDT engine instantly replicate and resolve keystrokes in the other in real-time.

## Author
**Abir Deol**
