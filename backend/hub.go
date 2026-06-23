package main

import "fmt"

// The CRDT payload we expect from the React frontend
type Message struct {
	Character string  `json:"char"`
	Position  float64 `json:"position"`
	SiteID    string  `json:"siteId"` // Unique ID of the user typing
	Action    string  `json:"action"` // "insert" or "delete"
}

type Hub struct {
	// Registered clients connected to the document
	clients map[*Client]bool
	// Inbound messages from the clients
	broadcast chan Message
	// Register requests from the clients
	register chan *Client
	// Unregister requests from clients
	unregister chan *Client
}

func newHub() *Hub {
	return &Hub{
		broadcast:  make(chan Message),
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
			
		case message := <-h.broadcast:
			// A user typed a character. Broadcast it to EVERY OTHER user.
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
	}
}
