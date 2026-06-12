import { useState, useEffect } from "react";
import UploadPanel from "./components/UploadPanel";
import ChatPanel from "./components/ChatPanel";
import { getSessionId, resetSession } from "./session";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MAX_HISTORY_TURNS = 6;

const INITIAL_MESSAGE = {
  role: "assistant",
  content: "Xin chào! Tôi là trợ lý nghiên cứu của bạn. Hãy upload tài liệu và đặt câu hỏi nhé. 👋",
};

/** Attach session header to every fetch call */
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

  useEffect(() => {
    fetchDocuments();
  }, []);

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

  const handleClearChat = () => {
    setMessages([INITIAL_MESSAGE]);
  };

  /** Start a completely fresh session (new ID + clear state) */
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
    <div className="flex h-screen bg-gray-950 text-gray-100 font-sans">
      <aside className="w-72 flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📚</span>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-white text-sm">RAG Research Assistant</h1>
              <p className="text-xs text-gray-400">Cohere · Upstash · OpenRouter</p>
            </div>
          </div>
          {/* New session button */}
          <button
            onClick={handleNewSession}
            className="mt-3 w-full text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg py-1.5 transition"
            title="Xóa toàn bộ session hiện tại và bắt đầu lại"
          >
            + Phiên mới
          </button>
        </div>
        <UploadPanel
          documents={documents}
          onUpload={handleUpload}
          onDelete={handleDelete}
        />
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <ChatPanel
          messages={messages}
          loading={loading}
          onSend={handleSend}
          hasDocuments={documents.length > 0}
          onClearChat={handleClearChat}
        />
      </main>
    </div>
  );
}
