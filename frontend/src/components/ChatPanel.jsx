import { useState, useRef, useEffect } from "react";
import MarkdownText from "./MarkdownText";

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="transition-all duration-150 opacity-0 group-hover:opacity-100 p-1 rounded-md"
      style={{ color: copied ? "#4338ca" : "#a8afc8" }}
      onMouseEnter={e => e.currentTarget.style.background = "#ebedf2"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      title="Sao chép"
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20,6 9,17 4,12"/>
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  );
}

function AssistantAvatar() {
  return (
    <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#4338ca" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
        <circle cx="9" cy="14" r="1" fill="white" stroke="none"/>
        <circle cx="15" cy="14" r="1" fill="white" stroke="none"/>
      </svg>
    </div>
  );
}

// ── File type icon ─────────────────────────────────────────────────────────
const EXT_COLORS = {
  pdf:  "#c0392b", docx: "#1d4ed8", txt: "#15803d",
  md:   "#7e22ce", csv: "#c2410c",
};

function SourceBadges({ sources }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {sources.map((src) => {
        const ext = src.filename.split(".").pop().toLowerCase();
        const color = EXT_COLORS[ext] || "#475569";
        return (
          <span
            key={src.doc_id}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: "#ebedf2", color: "#4338ca", border: "0.5px solid #d0d4de" }}
            title={src.filename}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
            <span style={{ color: "#5b6af5", fontWeight: 500, maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
              {src.filename}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export default function ChatPanel({ messages, loading, onSend, hasDocuments, onClearChat, onOpenSidebar }) {
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
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; }
  }, [input]);

  const turnCount = messages.filter((m) => m.role === "user").length;

  return (
    <div className="flex flex-col h-full" style={{ background: "#f0f1f6" }}>

      {/* Header */}
      <div
        className="px-4 md:px-6 py-3.5 flex items-center gap-3"
        style={{ background: "#ffffff", borderBottom: "0.5px solid #d0d4de" }}
      >
        {/* Hamburger — mobile only */}
        <button
          className="md:hidden p-1.5 rounded-lg flex-shrink-0 transition-all"
          onClick={onOpenSidebar}
          style={{ color: "#8892b8" }}
          onMouseEnter={e => e.currentTarget.style.background = "#ebedf2"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          aria-label="Mở menu"
        >
          <MenuIcon />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#22c55e" }}>
            <div className="w-2 h-2 rounded-full animate-ping" style={{ background: "#22c55e", opacity: 0.4 }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: "#1e2060" }}>Trợ lý Nghiên cứu</span>
          {!hasDocuments && (
            <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: "#fff7ed", color: "#c2410c", border: "0.5px solid #fed7aa" }}>
              Chưa có tài liệu
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {turnCount > 0 && (
            <span className="hidden sm:inline text-xs" style={{ color: "#a8afc8" }}>{turnCount} lượt</span>
          )}
          {messages.length > 1 && onClearChat && (
            <button
              onClick={onClearChat}
              className="text-xs px-2.5 py-1 rounded-lg transition-all font-medium"
              style={{ color: "#8892b8", border: "0.5px solid #d0d4de", background: "transparent" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#e8eaef"; e.currentTarget.style.color = "#4338ca"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#8892b8"; }}
            >
              Xóa chat
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-5">

        {/* Empty state */}
        {messages.length === 1 && messages[0].role === "assistant" && !loading && (
          <div className="flex flex-col items-center justify-center h-full pb-16 gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#dde0f0" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
            </div>
            <div className="text-center px-4">
              <p className="text-sm font-semibold mb-1" style={{ color: "#1e2060" }}>{messages[0].content}</p>
              <p className="text-xs" style={{ color: "#8892b8" }}>
                {hasDocuments ? "Hãy đặt câu hỏi bên dưới" : "Upload tài liệu để bắt đầu"}
              </p>
            </div>
            {hasDocuments && (
              <div className="flex flex-wrap gap-2 justify-center mt-2 px-4">
                {["Tóm tắt tài liệu này", "Những điểm chính là gì?", "Giải thích chi tiết hơn"].map((q) => (
                  <button key={q} onClick={() => onSend(q)}
                    className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                    style={{ background: "#f5f5f8", color: "#4338ca", border: "0.5px solid #a5b4fc" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#ebedf2"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#f5f5f8"; }}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message list */}
        {(messages.length > 1 || messages[0].role !== "assistant") && messages.map((msg, i) => (
          <div key={i} className={`flex items-end gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && <AssistantAvatar />}

            <div className={`group relative ${msg.role === "user" ? "max-w-[76%]" : "flex-1 min-w-0"}`}>
              <div
                className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
                style={
                  msg.role === "user"
                    ? { background: "#4338ca", color: "#ffffff", borderRadius: "16px 16px 4px 16px" }
                    : msg.content.startsWith("⚠️")
                    ? { background: "#fff0f0", color: "#c0392b", border: "0.5px solid #fecaca", borderRadius: "16px 16px 16px 4px" }
                    : { background: "#ffffff", color: "#1e2060", border: "0.5px solid #d0d4de", borderRadius: "16px 16px 16px 4px" }
                }
              >
                {msg.role === "user" ? (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                ) : (
                  <MarkdownText content={msg.content} />
                )}

                {/* Source badges — inside bubble, below answer text */}
                {msg.role === "assistant" && !msg.content.startsWith("⚠️") && (
                  <SourceBadges sources={msg.sources} />
                )}
              </div>

              {/* Copy button */}
              {msg.role === "assistant" && !msg.content.startsWith("⚠️") && (
                <div className="absolute -bottom-5 left-1">
                  <CopyButton text={msg.content} />
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex items-end gap-2.5 justify-start">
            <AssistantAvatar />
            <div className="rounded-2xl px-4 py-3"
              style={{ background: "#ffffff", border: "0.5px solid #d0d4de", borderRadius: "16px 16px 16px 4px" }}>
              <div className="flex gap-1 items-center h-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: "#a5b4fc", animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 md:px-5 py-4" style={{ background: "#ffffff", borderTop: "0.5px solid #d0d4de" }}>
        <div
          className="flex gap-3 items-end rounded-2xl px-4 py-3 transition-all"
          style={{ background: "#ebedf2", border: "0.5px solid #d0d4de" }}
          onFocusCapture={e => e.currentTarget.style.borderColor = "#a5b4fc"}
          onBlurCapture={e => e.currentTarget.style.borderColor = "#d0d4de"}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasDocuments ? "Đặt câu hỏi về tài liệu của bạn..." : "Upload tài liệu để bắt đầu..."}
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none py-0.5 max-h-[120px]"
            style={{ color: "#1e2060", caretColor: "#4338ca" }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 flex-shrink-0"
            style={{ background: input.trim() && !loading ? "#4338ca" : "#dde0f0", color: input.trim() && !loading ? "#ffffff" : "#a5b4fc" }}
            title="Gửi (Enter)"
          >
            <SendIcon />
          </button>
        </div>
        <p className="text-center text-xs mt-2" style={{ color: "#c0c5d4" }}>
          Enter để gửi · Shift+Enter xuống dòng
        </p>
      </div>
    </div>
  );
}
