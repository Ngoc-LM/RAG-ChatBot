import { useState, useRef } from "react";

const ALLOWED = ["pdf", "docx", "txt", "md", "csv"];

export default function UploadPanel({ documents, onUpload, onDelete }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
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
    try {
      await onUpload(file);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const getIcon = (filename) => {
    const ext = filename.split(".").pop().toLowerCase();
    const icons = { pdf: "📄", docx: "📝", txt: "📃", md: "📋", csv: "📊" };
    return icons[ext] || "📁";
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 mb-4 ${
          dragOver
            ? "border-indigo-400 bg-indigo-950/40"
            : "border-gray-700 hover:border-gray-500"
        } ${uploading ? "opacity-50 cursor-wait" : ""}`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-indigo-300">Đang xử lý...</p>
          </div>
        ) : (
          <div className="py-2">
            <p className="text-2xl mb-1">⬆️</p>
            <p className="text-xs text-gray-300 font-medium">Upload tài liệu</p>
            <p className="text-xs text-gray-500 mt-1">PDF, DOCX, TXT, MD, CSV</p>
            <p className="text-xs text-gray-600">tối đa 10MB</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 mb-3 bg-red-950/40 rounded-lg px-3 py-2">
          ⚠️ {error}
        </p>
      )}

      {/* Document list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Tài liệu ({documents.length})
        </p>
        {documents.length === 0 && (
          <p className="text-xs text-gray-600 text-center py-4">
            Chưa có tài liệu nào
          </p>
        )}
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-start gap-2 bg-gray-800/60 rounded-lg px-3 py-2 group hover:bg-gray-800 transition"
          >
            <span className="text-base mt-0.5 flex-shrink-0">{getIcon(doc.filename)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-200 truncate font-medium">{doc.filename}</p>
              <p className="text-xs text-gray-500">{doc.chunk_count} chunks</p>
            </div>
            <button
              onClick={() => onDelete(doc.id)}
              className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition text-xs flex-shrink-0 mt-0.5"
              title="Xóa tài liệu"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
