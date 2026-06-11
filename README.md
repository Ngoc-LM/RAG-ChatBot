# 📚 RAG Research Assistant

Chatbot nghiên cứu thông minh — upload tài liệu và hỏi đáp bằng tiếng Việt hoặc tiếng Anh.

## 🏗️ Kiến trúc

```
Frontend (Vercel)  →  Backend (Railway)
                          ├── Jina AI (Embedding)
                          ├── Upstash Vector (Vector Store)
                          ├── Supabase Storage (File Storage)
                          └── OpenRouter / Qwen (LLM)
```

## 📁 Cấu trúc project

```
rag-chatbot/
├── backend/
│   ├── main.py           # FastAPI app
│   ├── parser.py         # Document parser
│   ├── vector_store.py   # Jina + Upstash
│   ├── storage.py        # Supabase Storage
│   ├── llm.py            # OpenRouter / Qwen
│   ├── requirements.txt
│   └── railway.toml
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   └── components/
    │       ├── UploadPanel.jsx
    │       └── ChatPanel.jsx
    ├── package.json
    └── vercel.json
```

---

## 🚀 Hướng dẫn Deploy

### Bước 1: Chuẩn bị GitHub

1. Tạo repo mới trên GitHub (vd: `rag-chatbot`)
2. Push code lên:

```bash
cd rag-chatbot
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/rag-chatbot.git
git push -u origin main
```

---

### Bước 2: Deploy Backend lên Railway

1. Truy cập [railway.app](https://railway.app) → **Sign up with GitHub**
2. Click **New Project** → **Deploy from GitHub repo**
3. Chọn repo `rag-chatbot` → chọn folder **`backend`**
4. Railway sẽ tự detect Python và cài requirements
5. Vào tab **Variables** → **Add Variables**:

```
OPENROUTER_API_KEY=sk-or-v1-...
JINA_API_KEY=jina_...
UPSTASH_VECTOR_REST_URL=https://...
UPSTASH_VECTOR_REST_TOKEN=...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=sb_secret_...
```

6. Vào tab **Settings** → **Networking** → **Generate Domain**
7. Copy URL backend (vd: `https://rag-chatbot-backend.up.railway.app`)

---

### Bước 3: Deploy Frontend lên Vercel

1. Truy cập [vercel.com](https://vercel.com) → **Sign up with GitHub**
2. Click **Add New Project** → Import repo `rag-chatbot`
3. **Root Directory**: chọn `frontend`
4. **Framework Preset**: Vite (tự detect)
5. Vào **Environment Variables**:

```
VITE_API_URL=https://rag-chatbot-backend.up.railway.app
```
*(URL backend từ bước 2)*

6. Click **Deploy** → chờ ~2 phút
7. Copy URL frontend (vd: `https://rag-chatbot.vercel.app`)

---

### Bước 4: Tạo Supabase Storage Bucket

1. Vào Supabase Dashboard → **Storage** → **New Bucket**
2. Name: `documents`, Public: **OFF**
3. Click **Create bucket**

---

## ✅ Kiểm tra hoạt động

1. Mở URL frontend
2. Upload một file PDF nhỏ
3. Đặt câu hỏi về nội dung file
4. Nhận câu trả lời từ Qwen 🎉

---

## 🔒 Bảo mật

- **Không commit file `.env`** — đã có trong `.gitignore`
- Revoke và tạo lại keys nếu đã lộ
- Upstash free tier: 10K vectors (~50-100 tài liệu nhỏ)
- Supabase free tier: 1GB storage

---

## 🛠️ Chạy local (để test)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env.local
# Sửa VITE_API_URL=http://localhost:8000 trong .env.local
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000)
