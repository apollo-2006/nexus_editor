package main

import (
	"log"
	"net/http"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all CORS requests for prototyping
	},
}

// Client is a middleman between the websocket connection and the hub
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan Message
}

func main() {
	hub := newHub()
	go hub.run() // Run the hub in a concurrent Goroutine

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("Upgrade error:", err)
			return
		}
		
		client := &Client{hub: hub, conn: conn, send: make(chan Message, 256)}
		client.hub.register <- client

		// Spin up Goroutines to handle reading and writing simultaneously
		go client.writePump()
		go client.readPump()
	})

	log.Println("Nexus Editor Backend running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	for {
		var msg Message
		err := c.conn.ReadJSON(&msg)
		if err != nil {
			break
		}
		// Send the typed character to the Hub for broadcasting
		c.hub.broadcast <- msg
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()
	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.WriteJSON(message)
		}
	}
}
