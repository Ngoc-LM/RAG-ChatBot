/**
 * Session management — no auth required.
 *
 * Generates a UUID v4 on first visit and persists it in localStorage.
 * The same session_id is reused across page refreshes so the user's
 * documents remain available until they clear browser storage.
 */

const SESSION_KEY = "rag_session_id";

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function resetSession() {
  const id = generateUUID();
  localStorage.setItem(SESSION_KEY, id);
  return id;
}
