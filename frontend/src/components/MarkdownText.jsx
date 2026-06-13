function parseInline(text) {
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2] !== undefined) {
      parts.push(<strong key={match.index} style={{ fontWeight: 600, color: "#1e2060" }}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      parts.push(<em key={match.index} className="italic">{match[3]}</em>);
    } else if (match[4] !== undefined) {
      parts.push(
        <code key={match.index} style={{ background: "#eef1fc", color: "#3730a3", padding: "1px 6px", borderRadius: 4, fontSize: "0.8em", fontFamily: "monospace" }}>
          {match[4]}
        </code>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : [text];
}

export default function MarkdownText({ content }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements = [];
  let i = 0;
  let keyCounter = 0;
  const k = () => keyCounter++;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={k()} style={{ background: "#f4f7ff", border: "0.5px solid #dde3f5", borderRadius: 8, padding: "10px 12px", margin: "8px 0", overflowX: "auto" }}>
          <code style={{ color: "#3730a3", fontSize: "0.8em", fontFamily: "monospace", whiteSpace: "pre" }}>
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
        <p key={k()} style={{ fontWeight: 600, fontSize: sizes[level - 1], color: "#1e2060", margin: level === 1 ? "12px 0 4px" : "8px 0 2px" }}>
          {parseInline(headingMatch[2])}
        </p>
      );
      i++;
      continue;
    }

    // Bullet list
    if (/^[\s]*[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[\s]*[-*]\s/.test(lines[i])) {
        items.push(
          <li key={k()} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 3 }}>
            <span style={{ color: "#4338ca", flexShrink: 0, marginTop: 1, fontWeight: 600 }}>·</span>
            <span>{parseInline(lines[i].replace(/^[\s]*[-*]\s/, ""))}</span>
          </li>
        );
        i++;
      }
      elements.push(<ul key={k()} style={{ margin: "6px 0", padding: 0, listStyle: "none", fontSize: "0.875rem", lineHeight: 1.6 }}>{items}</ul>);
      continue;
    }

    // Numbered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      const items = [];
      let num = 1;
      while (i < lines.length && /^[\s]*\d+\.\s/.test(lines[i])) {
        items.push(
          <li key={k()} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 3 }}>
            <span style={{ color: "#4338ca", flexShrink: 0, fontFamily: "monospace", fontSize: "0.8em", marginTop: 2, minWidth: "1.2rem" }}>{num}.</span>
            <span>{parseInline(lines[i].replace(/^[\s]*\d+\.\s/, ""))}</span>
          </li>
        );
        i++;
        num++;
      }
      elements.push(<ol key={k()} style={{ margin: "6px 0", padding: 0, listStyle: "none", fontSize: "0.875rem", lineHeight: 1.6 }}>{items}</ol>);
      continue;
    }

    // HR
    if (/^[-*]{3,}$/.test(line.trim())) {
      elements.push(<hr key={k()} style={{ border: "none", borderTop: "0.5px solid #dde3f5", margin: "8px 0" }} />);
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
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{elements}</div>;
}
