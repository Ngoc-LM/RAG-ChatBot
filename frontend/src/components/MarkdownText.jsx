/**
 * Lightweight markdown renderer for LLM responses.
 * Handles: **bold**, *italic*, `inline code`, ```code blocks```,
 * - bullet lists, numbered lists, and line breaks.
 * No dependencies needed.
 */

function parseInline(text) {
  // Split by bold (**...**), italic (*...*), inline code (`...`)
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Plain text before this match
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }

    if (match[2] !== undefined) {
      // **bold**
      parts.push(<strong key={match.index} className="font-semibold text-white">{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      // *italic*
      parts.push(<em key={match.index} className="italic">{match[3]}</em>);
    } else if (match[4] !== undefined) {
      // `inline code`
      parts.push(
        <code key={match.index} className="bg-gray-700 text-emerald-300 px-1.5 py-0.5 rounded text-xs font-mono">
          {match[4]}
        </code>
      );
    }

    last = match.index + match[0].length;
  }

  // Remaining plain text
  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length > 0 ? parts : [text];
}

export default function MarkdownText({ content, isUser }) {
  if (!content) return null;

  // Split into lines first to handle code blocks, lists, headings
  const lines = content.split("\n");
  const elements = [];
  let i = 0;
  let keyCounter = 0;
  const k = () => keyCounter++;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ```...``` ──────────────────────────────────────
    if (line.trimStart().startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={k()} className="bg-gray-900 border border-gray-700 rounded-lg p-3 my-2 overflow-x-auto">
          <code className="text-emerald-300 text-xs font-mono whitespace-pre">
            {codeLines.join("\n")}
          </code>
        </pre>
      );
      i++; // skip closing ```
      continue;
    }

    // ── Heading ### ──────────────────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls = level === 1
        ? "text-base font-bold text-white mt-3 mb-1"
        : level === 2
        ? "text-sm font-bold text-white mt-2 mb-1"
        : "text-sm font-semibold text-gray-200 mt-2 mb-0.5";
      elements.push(
        <p key={k()} className={cls}>{parseInline(headingMatch[2])}</p>
      );
      i++;
      continue;
    }

    // ── Bullet list - or * ───────────────────────────────────────────────
    if (/^[\s]*[-*]\s/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^[\s]*[-*]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[\s]*[-*]\s/, "");
        listItems.push(
          <li key={k()} className="flex gap-2 items-start">
            <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
            <span>{parseInline(itemText)}</span>
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={k()} className="space-y-1 my-1.5 text-sm">
          {listItems}
        </ul>
      );
      continue;
    }

    // ── Numbered list 1. 2. ──────────────────────────────────────────────
    if (/^[\s]*\d+\.\s/.test(line)) {
      const listItems = [];
      let num = 1;
      while (i < lines.length && /^[\s]*\d+\.\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[\s]*\d+\.\s/, "");
        listItems.push(
          <li key={k()} className="flex gap-2 items-start">
            <span className="text-indigo-400 flex-shrink-0 font-mono text-xs mt-0.5 min-w-[1.2rem]">{num}.</span>
            <span>{parseInline(itemText)}</span>
          </li>
        );
        i++;
        num++;
      }
      elements.push(
        <ol key={k()} className="space-y-1 my-1.5 text-sm">
          {listItems}
        </ol>
      );
      continue;
    }

    // ── Horizontal rule --- ──────────────────────────────────────────────
    if (/^[-*]{3,}$/.test(line.trim())) {
      elements.push(<hr key={k()} className="border-gray-600 my-2" />);
      i++;
      continue;
    }

    // ── Empty line → small spacer ────────────────────────────────────────
    if (line.trim() === "") {
      // Only add spacer if not first/last and previous wasn't already a spacer
      const prev = elements[elements.length - 1];
      if (elements.length > 0 && prev?.type !== "div") {
        elements.push(<div key={k()} className="h-2" />);
      }
      i++;
      continue;
    }

    // ── Normal paragraph ─────────────────────────────────────────────────
    elements.push(
      <p key={k()} className="text-sm leading-relaxed">
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}
