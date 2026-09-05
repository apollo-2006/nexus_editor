package main

import "fmt"

// The CRDT payload we expect from the React frontend
type Message struct {
	Character string  `json:"char"`
	Position  float64 `json:"position"`
	SiteID    string  `json:"siteId"` // Unique ID of the user typing
	Action    string  `json:"action"` // "insert" or "delete"
}

// Broadcast pairs a message with the client that sent it, so the hub can skip
// that client when fanning out. Without the sender the hub echoed every message
// back to its author, who then applied it a second time as a remote insert and
// saw each character duplicated.
type Broadcast struct {
	message Message
	sender  *Client
}

type Hub struct {
	// Registered clients connected to the document
	clients map[*Client]bool
	// Inbound messages from the clients, tagged with who sent them
	broadcast chan Broadcast
	// Register requests from the clients
	register chan *Client
	// Unregister requests from clients
	unregister chan *Client
}

func newHub() *Hub {
	return &Hub{
		broadcast:  make(chan Broadcast),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			fmt.Println("New user connected. Total:", len(h.clients))
			
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				fmt.Println("User disconnected.")
			}
			
		case b := <-h.broadcast:
			// A user typed a character. Broadcast it to every OTHER user; the
			// sender has already applied it locally.
			for client := range h.clients {
				if client == b.sender {
					continue
				}
				select {
				case client.send <- b.message:
				default:
					// Client is not draining its queue; drop it.
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
	}
}
