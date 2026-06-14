import { useState, useEffect } from "react";
import UploadPanel from "./components/UploadPanel";
import ChatPanel from "./components/ChatPanel";
import DotMatrixBackground from "./components/DotMatrixBackground";
import { getSessionId, resetSession } from "./session";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MAX_HISTORY_TURNS = 6;

const INITIAL_MESSAGE = {
  role: "assistant",
  content: "Xin chào! Tôi là trợ lý nghiên cứu của bạn. Upload tài liệu và bắt đầu đặt câu hỏi nhé.",
};

function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      "X-Session-ID": getSessionId(),
    },
  });
}

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [loading, setLoading] = useState(false);

  const fetchDocuments = async () => {
    try {
      const res = await apiFetch("/documents");
      if (!res.ok) return;
      setDocuments(await res.json());
    } catch (e) {
      console.error("Failed to fetch documents:", e);
    }
  };

  useEffect(() => { fetchDocuments(); }, []);

  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiFetch("/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Upload failed");
    }
    const doc = await res.json();
    setDocuments((prev) => [...prev, doc]);
    return doc;
  };

  const handleDelete = async (docId) => {
    await apiFetch(`/documents/${docId}`, { method: "DELETE" });
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  const handleClearChat = () => setMessages([INITIAL_MESSAGE]);

  const handleNewSession = () => {
    resetSession();
    setDocuments([]);
    setMessages([INITIAL_MESSAGE]);
  };

  const handleSend = async (message) => {
    const newMessages = [...messages, { role: "user", content: message }];
    setMessages(newMessages);
    setLoading(true);

    const historySource = newMessages.slice(1, -1);
    const trimmed = historySource.slice(-MAX_HISTORY_TURNS * 2);
    const history = trimmed.map(({ role, content }) => ({ role, content }));

    try {
      const res = await apiFetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      const answer = res.ok ? data.answer : `⚠️ ${data.detail || "Lỗi không xác định."}`;
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Không thể kết nối đến server. Vui lòng thử lại." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen" style={{ background: "#e8eaef" }}>
      {/* Sidebar */}
      <aside
        className="w-72 flex-shrink-0 flex flex-col"
        style={{ background: "#f2f3f7", borderRight: "0.5px solid #d0d4de" }}
      >
        {/* Logo area */}
        <div className="p-5" style={{ borderBottom: "0.5px solid #d0d4de" }}>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "#4338ca" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate" style={{ color: "#1e2060" }}>
                Research Assistant
              </h1>
              <p className="text-xs truncate" style={{ color: "#8892b8" }}>
                Cohere · Upstash · OpenRouter
              </p>
            </div>
          </div>

          <button
            onClick={handleNewSession}
            className="w-full text-xs py-2 rounded-lg transition-all duration-150 font-medium"
            style={{
              border: "0.5px solid #d0d4de",
              color: "#4338ca",
              background: "#f2f3f7",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#ebedf2"; e.currentTarget.style.borderColor = "#a5b4fc"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#f2f3f7"; e.currentTarget.style.borderColor = "#d0d4de"; }}
          >
            + Phiên làm việc mới
          </button>
        </div>

        <UploadPanel
          documents={documents}
          onUpload={handleUpload}
          onDelete={handleDelete}
        />
      </aside>

      {/* Main — position relative so canvas sits behind chat */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <DotMatrixBackground />
        <div className="relative z-10 flex flex-col flex-1 min-h-0">
          <ChatPanel
            messages={messages}
            loading={loading}
            onSend={handleSend}
            hasDocuments={documents.length > 0}
            onClearChat={handleClearChat}
          />
        </div>
      </main>
    </div>
  );
}
