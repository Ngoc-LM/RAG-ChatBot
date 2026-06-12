import { useState, useRef, useEffect } from "react";

export default function ChatPanel({ messages, loading, onSend, hasDocuments, onClearChat }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef();
  const textareaRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSubmit = () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    onSend(msg);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }, [input]);

  const turnCount = messages.filter((m) => m.role === "user").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-sm font-medium text-gray-200">Trợ lý Nghiên cứu</span>

        {!hasDocuments && (
          <span className="text-xs text-amber-400 bg-amber-950/40 px-2 py-1 rounded-full">
            ⚠️ Chưa có tài liệu
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {turnCount > 0 && (
            <span className="text-xs text-gray-500">{turnCount} lượt hội thoại</span>
          )}
          {messages.length > 1 && onClearChat && (
            <button
              onClick={onClearChat}
              className="text-xs text-gray-500 hover:text-gray-300 transition"
              title="Xóa lịch sử chat"
            >
              Xóa chat
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs flex-shrink-0 mr-2 mt-0.5">
                🤖
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : msg.content.startsWith("⚠️")
                  ? "bg-red-950/60 text-red-300 rounded-bl-sm"
                  : "bg-gray-800 text-gray-100 rounded-bl-sm"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs flex-shrink-0 mr-2 mt-0.5">
              🤖
            </div>
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-800">
        <div className="flex gap-2 items-end bg-gray-800 rounded-2xl px-4 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              hasDocuments
                ? "Đặt câu hỏi về tài liệu của bạn..."
                : "Upload tài liệu để bắt đầu..."
            }
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none outline-none py-1 max-h-[120px]"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition flex-shrink-0 mb-0.5"
            title="Gửi (Enter)"
          >
            <svg className="w-4 h-4 text-white rotate-90" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-600 text-center mt-2">
          Enter để gửi · Shift+Enter xuống dòng
        </p>
      </div>
    </div>
  );
}
