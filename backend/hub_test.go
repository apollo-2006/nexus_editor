package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	hub := newHub()
	go hub.run()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade: %v", err)
			return
		}
		client := &Client{hub: hub, conn: conn, send: make(chan Message, 256)}
		hub.register <- client
		go client.writePump()
		go client.readPump()
	}))
	t.Cleanup(srv.Close)
	return srv
}

func dial(t *testing.T, srv *httptest.Server) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func TestRelayForwardsToOthersButNotTheSender(t *testing.T) {
	srv := newTestServer(t)
	alice, bob := dial(t, srv), dial(t, srv)
	time.Sleep(50 * time.Millisecond) // let both registrations reach the hub

	op := `{"action":"insert","char":{"char":"x","position":"i1abc","siteId":"alice"}}`
	if err := alice.WriteMessage(websocket.TextMessage, []byte(op)); err != nil {
		t.Fatal(err)
	}

	bob.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, got, err := bob.ReadMessage()
	if err != nil {
		t.Fatalf("bob read: %v", err)
	}
	// Forwarded unchanged: the relay does not decode operations.
	if strings.TrimSpace(string(got)) != op {
		t.Fatalf("bob got %s, want %s", got, op)
	}

	// The sender already applied its own edit; an echo would apply it twice.
	alice.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	if _, echo, err := alice.ReadMessage(); err == nil {
		t.Fatalf("sender received its own message back: %s", echo)
	}
}
