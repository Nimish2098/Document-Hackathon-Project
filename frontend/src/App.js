import React, { useState, useRef, useEffect } from "react";

const API_URL = "http://127.0.0.1:8000"; // change if backend is hosted elsewhere

export default function App() {
  // --- State ---
  const [query, setQuery] = useState("");
  const [chatHistory, setChatHistory] = useState([]); // { role: 'user'|'model', content: string, source?: string }
  const [isLoading, setIsLoading] = useState(false); // for non-streaming query
  const [isStreaming, setIsStreaming] = useState(false); // for streaming query
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const streamAbortRef = useRef(null); // to allow cancelling streaming queries

  // --- File upload handler ---
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleFileUpload = async (file) => {
    setStatusMessage("");
    if (!file) {
      setStatusMessage("No file selected.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);
    setStatusMessage("Uploading...");

    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        // Try to parse JSON error if possible
        let errText = `Upload failed: ${res.status}`;
        try {
          const errJson = await res.json();
          errText = errJson.detail || errJson.message || errText;
        } catch {}
        throw new Error(errText);
      }

      const data = await res.json();
      setUploadedFile(file);
      setStatusMessage(data.message || "File processed and indexed.");
    } catch (err) {
      console.error("Upload error:", err);
      setStatusMessage(`Upload error: ${err.message}`);
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // --- Non-streaming query (single response) ---
  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!query.trim() || isLoading || isUploading || isStreaming) return;

    const userMsg = { role: "user", content: query };
    setChatHistory((p) => [...p, userMsg]);
    setQuery("");
    setIsLoading(true);
    setStatusMessage("");

    try {
      // Note backend endpoint has trailing slash: /query/
      const res = await fetch(`${API_URL}/query/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        let errText = `Query failed: ${res.status}`;
        try {
          const errJson = await res.json();
          errText = errJson.detail || errJson.message || errText;
        } catch {}
        throw new Error(errText);
      }

      const data = await res.json(); // { answer, source_file }
      const modelMsg = {
        role: "model",
        content: data.answer,
        source: data.source_file,
      };
      setChatHistory((p) => [...p, modelMsg]);
    } catch (err) {
      console.error("Query error:", err);
      setChatHistory((p) => [
        ...p,
        { role: "model", content: `Error: ${err.message}`, source: "Error" },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Streaming query (reads chunks as they arrive) ---
  // This uses fetch + readable stream. Backend returns text/event-stream but yields raw chunks.
  const handleSubmitStream = async (e) => {
    e?.preventDefault?.();
    if (!query.trim() || isLoading || isUploading || isStreaming) return;

    const userMsg = { role: "user", content: query };
    setChatHistory((p) => [...p, userMsg]);

    // add an initial model message placeholder that we'll update
    const placeholder = { role: "model", content: "", source: "" };
    setChatHistory((p) => [...p, placeholder]);
    const modelIndex = chatHistory.length + 1; // approximate index of the placeholder
    setIsStreaming(true);
    setStatusMessage("Streaming response...");

    // Abort previous streaming if present
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
    }
    const controller = new AbortController();
    streamAbortRef.current = controller;

    try {
      const res = await fetch(`${API_URL}/query-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        let errText = `Stream failed: ${res.status}`;
        try {
          const errJson = await res.json();
          errText = errJson.detail || errJson.message || errText;
        } catch {}
        throw new Error(errText);
      }

      // Read the response body as a stream of text
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let accumulated = "";

      // As chunks come in, append them to the last model message
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunkText = decoder.decode(value, { stream: true });
          accumulated += chunkText;

          // Update the last model message in chatHistory step-by-step
          setChatHistory((prev) => {
            // copy prev array and update the last model message (search from end)
            const copy = [...prev];
            // find last index with role 'model'
            const idx = copy.map((m) => m.role).lastIndexOf("model");
            if (idx >= 0) {
              copy[idx] = {
                ...copy[idx],
                content: (copy[idx].content || "") + chunkText,
              };
            }
            return copy;
          });
        }
      }

      // when done, try to parse a source if backend appended one like "[Source:...]"
      const sourceMatch = accumulated.match(/\[Source:(.*?)\]\s*$/i);
      if (sourceMatch) {
        const sourceText = sourceMatch[1].trim();
        // remove source suffix from the model content and set the source field
        setChatHistory((prev) => {
          const copy = [...prev];
          const idx = copy.map((m) => m.role).lastIndexOf("model");
          if (idx >= 0) {
            const newContent = copy[idx].content.replace(/\[Source:.*\]\s*$/i, "");
            copy[idx] = { ...copy[idx], content: newContent, source: sourceText };
          }
          return copy;
        });
      }

      setStatusMessage("Streaming finished");
    } catch (err) {
      if (err.name === "AbortError") {
        setStatusMessage("Streaming aborted");
      } else {
        console.error("Streaming error:", err);
        setChatHistory((p) => [
          ...p,
          { role: "model", content: `Streaming error: ${err.message}`, source: "Error" },
        ]);
        setStatusMessage(`Streaming error: ${err.message}`);
      }
    } finally {
      setIsStreaming(false);
      streamAbortRef.current = null;
    }
  };

  // Cancel streaming (if user wants to)
  const cancelStreaming = () => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
      setIsStreaming(false);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  // auto-scroll to bottom when chat updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // --- UI render ---
  return (
    <div className="app-root" style={{ height: "100vh", display: "flex", fontFamily: "Inter, Arial, sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: 320, background: "#0f1724", color: "#e6eef8", padding: 20, boxSizing: "border-box" }}>
        <h2 style={{ margin: 0, marginBottom: 10 }}>DocuMind</h2>
        <p style={{ color: "#9aa6b2", fontSize: 13 }}>Upload a document to index it, then ask questions.</p>

        <input ref={fileInputRef} type="file" onChange={handleFileChange} accept=".pdf,.docx,.txt,.xlsx" style={{ display: "none" }} />
        <button onClick={triggerFileInput} disabled={isUploading} style={{ marginTop: 12, padding: "10px 14px", width: "100%", background: "#4f46e5", color: "white", border: "none", borderRadius: 8 }}>
          {isUploading ? "Uploading..." : "Upload Document"}
        </button>

        <div style={{ marginTop: 16, fontSize: 13, color: "#cbd5e1" }}>
          {uploadedFile ? <div>Uploaded: {uploadedFile.name}</div> : <div>No file uploaded</div>}
          {statusMessage && <div style={{ marginTop: 8, color: "#a3b0bd" }}>{statusMessage}</div>}
        </div>

        <hr style={{ marginTop: 16, borderColor: "#24303b" }} />

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: "#aebac6" }}>Backend</div>
          <div style={{ fontSize: 13, color: "#7f8a95", marginTop: 6 }}>URL: {API_URL}</div>
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, padding: 20, overflowY: "auto", background: "#071327" }}>
          {chatHistory.length === 0 ? (
            <div style={{ color: "#9aa6b2", textAlign: "center", marginTop: 40 }}>Upload a document and ask a question.</div>
          ) : (
            chatHistory.map((m, i) => <MessageBubble key={i} msg={m} />)
          )}
          <div ref={chatEndRef}></div>
        </div>

        {/* Input controls */}
        <div style={{ padding: 12, borderTop: "1px solid #15232b", background: "#031826", display: "flex", gap: 8, alignItems: "center" }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flex: 1, gap: 8 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question..."
              style={{ flex: 1, padding: 12, background: "#062233", color: "white", border: "1px solid #12303a", borderRadius: 8 }}
              disabled={isLoading || isUploading || isStreaming}
            />
            <button type="submit" disabled={isLoading || !query.trim() || isUploading || isStreaming} style={{ padding: "10px 12px", background: "#2563eb", color: "white", border: "none", borderRadius: 8 }}>
              {isLoading ? "..." : "Send"}
            </button>
          </form>

          {/* Streaming button */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSubmitStream}
              disabled={isStreaming || !query.trim() || isUploading || isLoading}
              style={{ padding: "10px 12px", background: "#6d28d9", color: "white", border: "none", borderRadius: 8 }}
            >
              {isStreaming ? "Streaming..." : "Stream"}
            </button>

            <button
              onClick={cancelStreaming}
              disabled={!isStreaming}
              style={{ padding: "10px 12px", background: "#ef4444", color: "white", border: "none", borderRadius: 8 }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// small message bubble component:
function MessageBubble({ msg }) {
  const isModel = msg.role === "model";
  const containerStyle = {
    display: "flex",
    justifyContent: isModel ? "flex-start" : "flex-end",
    marginBottom: 12,
  };
  const bubbleStyle = {
    maxWidth: "72%",
    padding: 12,
    borderRadius: 10,
    background: isModel ? "#0b2540" : "#3b82f6",
    color: isModel ? "#cfe8ff" : "white",
    whiteSpace: "pre-wrap",
    boxShadow: "0 3px 6px rgba(0,0,0,0.2)",
  };

  return (
    <div style={containerStyle}>
      <div style={bubbleStyle}>
        <div style={{ fontSize: 14 }}>{msg.content}</div>
        {isModel && msg.source ? <div style={{ marginTop: 8, fontSize: 12, color: "#9fb7d1" }}>Source: {msg.source}</div> : null}
      </div>
    </div>
  );
}
