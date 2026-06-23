import React, { useEffect, useState, useRef } from 'react';
import { CRDT, Char } from './CrdtEngine';

const App: React.FC = () => {
  const [text, setText] = useState("");
  const crdtRef = useRef(new CRDT());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to the Golang backend
    wsRef.current = new WebSocket("ws://localhost:8080/ws");

    wsRef.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.action === "insert") {
        // Another user typed! Merge their character into our local math model.
        crdtRef.current.remoteInsert(msg);
        setText(crdtRef.current.getText());
      }
    };

    return () => wsRef.current?.close();
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    
    // For prototyping, we assume append at the end. 
    // A production app calculates cursor offsets to find the exact index.
    const lastCharTyped = newText[newText.length - 1];
    
    if (lastCharTyped) {
      // 1. Update local math
      const charPayload = crdtRef.current.localInsert(newText.length - 1, lastCharTyped);
      setText(crdtRef.current.getText());

      // 2. Fire the math over the network to other users
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          ...charPayload,
          action: "insert"
        }));
      }
    }
  };

  return (
    <div style={{ padding: "40px", fontFamily: "monospace" }}>
      <h2>Nexus Collaborative Editor</h2>
      <textarea 
        value={text}
        onChange={handleInput}
        rows={20}
        cols={80}
        style={{ fontSize: "16px", padding: "10px", backgroundColor: "#1e1e1e", color: "#d4d4d4" }}
      />
    </div>
  );
};

export default App;
