import { useState, useRef } from "react";

const ALLOWED = ["pdf", "docx", "txt", "md", "csv"];

const EXT_COLORS = {
  pdf:  { bg: "#fff0f0", text: "#c0392b", label: "PDF" },
  docx: { bg: "#eff6ff", text: "#1d4ed8", label: "DOC" },
  txt:  { bg: "#f0fdf4", text: "#15803d", label: "TXT" },
  md:   { bg: "#faf5ff", text: "#7e22ce", label: "MD"  },
  csv:  { bg: "#fff7ed", text: "#c2410c", label: "CSV" },
};

function FileBadge({ filename }) {
  const ext = filename.split(".").pop().toLowerCase();
  const style = EXT_COLORS[ext] || { bg: "#f1f5f9", text: "#475569", label: ext.toUpperCase() };
  return (
    <span
      className="text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ background: style.bg, color: style.text, fontSize: "10px", letterSpacing: "0.03em" }}
    >
      {style.label}
    </span>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UploadPanel({ documents, onUpload, onDelete }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const inputRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!ALLOWED.includes(ext)) {
      setError(`Định dạng không hỗ trợ: .${ext}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File vượt quá 10MB.");
      return;
    }
    setError("");
    setUploading(true);
    setProgress("Đang phân tích...");
    try {
      setTimeout(() => setProgress("Đang tạo embeddings..."), 1200);
      await onUpload(file);
      setProgress("");
    } catch (e) {
      setError(e.message);
      setProgress("");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleDeleteConfirm = async (docId) => {
    setConfirmDelete(null);
    await onDelete(docId);
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden" style={{ background: "#f2f3f7" }}>

      {/* Drop zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="rounded-xl p-4 text-center cursor-pointer transition-all duration-200 mb-4"
        style={{
          border: dragOver ? "1.5px dashed #4338ca" : "1.5px dashed #c0c5d4",
          background: dragOver ? "#ebedf2" : "#ebedf2",
          opacity: uploading ? 0.7 : 1,
          cursor: uploading ? "wait" : "pointer",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-1">
            {/* Progress bar */}
            <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: "#d0d4de" }}>
              <div
                className="h-1.5 rounded-full animate-pulse"
                style={{ background: "#4338ca", width: "60%" }}
              />
            </div>
            <p className="text-xs font-medium" style={{ color: "#4338ca" }}>{progress}</p>
          </div>
        ) : (
          <div className="py-1">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2"
              style={{ background: "#dde0f0" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17,8 12,3 7,8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: "#1e2060" }}>
              Kéo thả hoặc nhấp để upload
            </p>
            <p className="text-xs" style={{ color: "#8892b8" }}>PDF · DOCX · TXT · MD · CSV</p>
            <p className="text-xs mt-0.5" style={{ color: "#a8afc8" }}>Tối đa 10MB</p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="text-xs rounded-lg px-3 py-2 mb-3 flex items-center gap-2"
          style={{ background: "#fff0f0", color: "#c0392b", border: "0.5px solid #fecaca" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {/* Document list */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#8892b8", letterSpacing: "0.08em" }}>
            Tài liệu
          </p>
          <span
            className="text-xs font-semibold px-1.5 py-0.5 rounded-md"
            style={{ background: "#dde0f0", color: "#3730a3" }}
          >
            {documents.length}
          </span>
        </div>

        {documents.length === 0 && (
          <div className="text-center py-8">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2"
              style={{ background: "#e8eaef" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a8afc8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
            </div>
            <p className="text-xs" style={{ color: "#a8afc8" }}>Chưa có tài liệu nào</p>
          </div>
        )}

        <div className="space-y-1.5">
          {documents.map((doc) => (
            <div key={doc.id}>
              {confirmDelete === doc.id ? (
                <div
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: "#fff0f0", border: "0.5px solid #fecaca" }}
                >
                  <p className="text-xs font-medium mb-2" style={{ color: "#c0392b" }}>
                    Xóa tài liệu này?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeleteConfirm(doc.id)}
                      className="flex-1 text-xs py-1 rounded-lg font-medium transition-all"
                      style={{ background: "#c0392b", color: "#fff" }}
                    >
                      Xóa
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="flex-1 text-xs py-1 rounded-lg font-medium transition-all"
                      style={{ background: "#e8eaef", color: "#4338ca", border: "0.5px solid #d0d4de" }}
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 group transition-all duration-150"
                  style={{ background: "#ffffff", border: "0.5px solid #d0d4de" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#a5b4fc"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#d0d4de"}
                >
                  <FileBadge filename={doc.filename} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "#1e2060" }}>
                      {doc.filename}
                    </p>
                    <p className="text-xs" style={{ color: "#a8afc8" }}>
                      {doc.chunk_count} đoạn văn
                    </p>
                  </div>
                  <button
                    onClick={() => setConfirmDelete(doc.id)}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-150 p-1 rounded-lg"
                    style={{ color: "#a8afc8" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#c0392b"; e.currentTarget.style.background = "#fff0f0"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "#a8afc8"; e.currentTarget.style.background = "transparent"; }}
                    title="Xóa tài liệu"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1V6"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
