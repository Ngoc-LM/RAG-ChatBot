import { useState, useRef, useEffect } from "react";
import UploadPanel from "./components/UploadPanel";
import ChatPanel from "./components/ChatPanel";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Xin chào! Tôi là trợ lý nghiên cứu của bạn. Hãy upload tài liệu và đặt câu hỏi nhé. 👋",
    },
  ]);
  const [loading, setLoading] = useState(false);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE}/documents`);
      const data = await res.json();
      setDocuments(data);
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
    const res = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Upload failed");
    }
    const doc = await res.json();
    setDocuments((prev) => [...prev, doc]);
    return doc;
  };

  const handleDelete = async (docId) => {
    await fetch(`${API_BASE}/documents/${docId}`, { method: "DELETE" });
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  const handleSend = async (message) => {
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer || data.detail || "Lỗi không xác định." },
      ]);
    } catch (e) {
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
      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📚</span>
            <div>
              <h1 className="font-bold text-white text-sm">RAG Research Assistant</h1>
              <p className="text-xs text-gray-400">Powered by Qwen + Jina AI</p>
            </div>
          </div>
        </div>
        <UploadPanel
          documents={documents}
          onUpload={handleUpload}
          onDelete={handleDelete}
        />
      </aside>

      {/* Main Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <ChatPanel
          messages={messages}
          loading={loading}
          onSend={handleSend}
          hasDocuments={documents.length > 0}
        />
      </main>
    </div>
  );
}
