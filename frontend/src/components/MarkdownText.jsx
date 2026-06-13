import katex from "katex";
import "katex/dist/katex.min.css";

// ── KaTeX helpers ─────────────────────────────────────────────────────────────

function renderKatex(tex, displayMode = false) {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return tex;
  }
}

function KatexBlock({ tex }) {
  return (
    <div
      style={{ overflowX: "auto", margin: "10px 0", textAlign: "center" }}
      dangerouslySetInnerHTML={{ __html: renderKatex(tex, true) }}
    />
  );
}

function KatexInline({ tex }) {
  return (
    <span dangerouslySetInnerHTML={{ __html: renderKatex(tex, false) }} />
  );
}

// ── Inline parser (bold / italic / code / inline-math) ───────────────────────
// Order matters: $...$ must be matched before * to avoid conflicts.

function parseInline(text, keyPrefix = "") {
  const parts = [];
  // Groups: 1=$$block(skip,handled above), 2=$inline$, 3=**bold**, 4=*italic*, 5=`code`
  const regex = /(\$\$[\s\S]+?\$\$|\$([^$\n]+?)\$|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let match;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }

    const key = `${keyPrefix}-${idx++}`;

    if (match[0].startsWith("$$")) {
      // $$...$$ inside inline context — render as inline anyway
      const tex = match[0].slice(2, -2).trim();
      parts.push(<KatexInline key={key} tex={tex} />);
    } else if (match[2] !== undefined) {
      // $...$
      parts.push(<KatexInline key={key} tex={match[2]} />);
    } else if (match[3] !== undefined) {
      // **bold**
      parts.push(
        <strong key={key} style={{ fontWeight: 600, color: "#1e2060" }}>
          {match[3]}
        </strong>
      );
    } else if (match[4] !== undefined) {
      // *italic*
      parts.push(<em key={key}>{match[4]}</em>);
    } else if (match[5] !== undefined) {
      // `code`
      parts.push(
        <code
          key={key}
          style={{
            background: "#ebedf2",
            color: "#3730a3",
            padding: "1px 6px",
            borderRadius: 4,
            fontSize: "0.8em",
            fontFamily: "monospace",
          }}
        >
          {match[5]}
        </code>
      );
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : [text];
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MarkdownText({ content }) {
  if (!content) return null;

  // Pre-pass: split content into segments — either $$...$$ blocks or regular text.
  // This lets us handle multi-line display math before line-by-line parsing.
  const segments = [];
  const blockMathRegex = /\$\$([\s\S]+?)\$\$/g;
  let lastIdx = 0;
  let bm;

  while ((bm = blockMathRegex.exec(content)) !== null) {
    if (bm.index > lastIdx) {
      segments.push({ type: "text", value: content.slice(lastIdx, bm.index) });
    }
    segments.push({ type: "math_block", value: bm[1].trim() });
    lastIdx = bm.index + bm[0].length;
  }
  if (lastIdx < content.length) {
    segments.push({ type: "text", value: content.slice(lastIdx) });
  }

  // Render each segment
  const elements = [];
  let keyCounter = 0;
  const k = () => keyCounter++;

  for (const seg of segments) {
    if (seg.type === "math_block") {
      elements.push(<KatexBlock key={k()} tex={seg.value} />);
      continue;
    }

    // Regular text segment — line-by-line markdown parsing
    const lines = seg.value.split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block
      if (line.trimStart().startsWith("```")) {
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        elements.push(
          <pre
            key={k()}
            style={{
              background: "#ebedf2",
              border: "0.5px solid #d0d4de",
              borderRadius: 8,
              padding: "10px 12px",
              margin: "8px 0",
              overflowX: "auto",
            }}
          >
            <code
              style={{
                color: "#3730a3",
                fontSize: "0.8em",
                fontFamily: "monospace",
                whiteSpace: "pre",
              }}
            >
              {codeLines.join("\n")}
            </code>
          </pre>
        );
        i++;
        continue;
      }

      // Heading
      const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const sizes = ["1em", "0.9em", "0.875em"];
        elements.push(
          <p
            key={k()}
            style={{
              fontWeight: 600,
              fontSize: sizes[level - 1],
              color: "#1e2060",
              margin: level === 1 ? "12px 0 4px" : "8px 0 2px",
            }}
          >
            {parseInline(headingMatch[2], k())}
          </p>
        );
        i++;
        continue;
      }

      // Bullet list
      if (/^[\s]*[-*]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^[\s]*[-*]\s/.test(lines[i])) {
          const key = k();
          items.push(
            <li key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 3 }}>
              <span style={{ color: "#4338ca", flexShrink: 0, marginTop: 1, fontWeight: 600 }}>·</span>
              <span>{parseInline(lines[i].replace(/^[\s]*[-*]\s/, ""), key)}</span>
            </li>
          );
          i++;
        }
        elements.push(
          <ul key={k()} style={{ margin: "6px 0", padding: 0, listStyle: "none", fontSize: "0.875rem", lineHeight: 1.6 }}>
            {items}
          </ul>
        );
        continue;
      }

      // Numbered list
      if (/^[\s]*\d+\.\s/.test(line)) {
        const items = [];
        let num = 1;
        while (i < lines.length && /^[\s]*\d+\.\s/.test(lines[i])) {
          const key = k();
          items.push(
            <li key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 3 }}>
              <span style={{ color: "#4338ca", flexShrink: 0, fontFamily: "monospace", fontSize: "0.8em", marginTop: 2, minWidth: "1.2rem" }}>
                {num}.
              </span>
              <span>{parseInline(lines[i].replace(/^[\s]*\d+\.\s/, ""), key)}</span>
            </li>
          );
          i++;
          num++;
        }
        elements.push(
          <ol key={k()} style={{ margin: "6px 0", padding: 0, listStyle: "none", fontSize: "0.875rem", lineHeight: 1.6 }}>
            {items}
          </ol>
        );
        continue;
      }

      // HR
      if (/^[-*]{3,}$/.test(line.trim())) {
        elements.push(<hr key={k()} style={{ border: "none", borderTop: "0.5px solid #d0d4de", margin: "8px 0" }} />);
        i++;
        continue;
      }

      // Empty line spacer
      if (line.trim() === "") {
        const prev = elements[elements.length - 1];
        if (elements.length > 0 && prev?.type !== "div") {
          elements.push(<div key={k()} style={{ height: 6 }} />);
        }
        i++;
        continue;
      }

      // Normal paragraph
      elements.push(
        <p key={k()} style={{ fontSize: "0.875rem", lineHeight: 1.65, margin: 0, color: "#1e2060" }}>
          {parseInline(line, k())}
        </p>
      );
      i++;
    }
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{elements}</div>;
}
