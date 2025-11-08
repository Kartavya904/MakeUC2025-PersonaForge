import React, { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <h1>PersonaForge — Where voice meets AI</h1>
      <p>Renderer is live. We’ll wire Electron next.</p>
      <button onClick={() => setCount(c => c + 1)}>Clicked {count} times</button>
    </div>
  );
}
