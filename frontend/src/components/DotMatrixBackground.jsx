import { useEffect, useRef } from "react";

/**
 * Animated dot-matrix background with connecting lines.
 *
 * Two-layer effect:
 * 1. Static grid of dots — all pulse with a diagonal sine wave.
 * 2. "Signal" pulses — a small number of highlighted dots travel
 *    along random grid paths, drawing lines between adjacent nodes
 *    as they move. Fades out as the signal passes.
 *
 * Performance: single rAF loop, no external deps, cleans up on unmount.
 */
export default function DotMatrixBackground() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // ── Config ────────────────────────────────────────────────────────────
    const SPACING     = 28;
    const DOT_RADIUS  = 1.3;
    const COLOR       = "59, 68, 158";   // indigo tint #3B449E
    const SPEED       = 0.0006;
    const WAVE_SCALE  = 0.012;
    const MIN_ALPHA   = 0.06;
    const MAX_ALPHA   = 0.26;

    // Lines / signals
    const MAX_SIGNALS   = 6;    // concurrent animated signals
    const SIGNAL_STEPS  = 14;   // how many grid hops per signal path
    const SIGNAL_SPEED  = 0.018; // fraction of path travelled per frame
    const LINE_ALPHA    = 0.18;  // max line opacity
    const GLOW_ALPHA    = 0.55;  // bright dot at signal head

    // ── State ─────────────────────────────────────────────────────────────
    let width = 0, height = 0, cols = 0, rows = 0;

    // Each signal: { path: [{col,row}], progress: 0..path.length-1 }
    let signals = [];

    const resize = () => {
      width  = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width  = width  * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      cols = Math.ceil(width  / SPACING) + 1;
      rows = Math.ceil(height / SPACING) + 1;
      signals = [];
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Signal generation ─────────────────────────────────────────────────
    // Build a random walk path along grid edges (4-connected, no reversal).
    const DIRS = [{ dc: 1, dr: 0 }, { dc: -1, dr: 0 },
                  { dc: 0, dr: 1 }, { dc:  0, dr: -1 }];

    function makeSignal() {
      const startCol = Math.floor(Math.random() * cols);
      const startRow = Math.floor(Math.random() * rows);
      const path     = [{ col: startCol, row: startRow }];
      let prevDir    = null;

      for (let s = 0; s < SIGNAL_STEPS; s++) {
        const last = path[path.length - 1];
        // Prefer continuing same direction (70%) to look more intentional
        const candidates = DIRS.filter(d => {
          if (prevDir && d.dc === -prevDir.dc && d.dr === -prevDir.dr) return false; // no U-turn
          const nc = last.col + d.dc;
          const nr = last.row + d.dr;
          return nc >= 0 && nc < cols && nr >= 0 && nr < rows;
        });
        if (!candidates.length) break;

        let chosen;
        if (prevDir && Math.random() < 0.7) {
          const straight = candidates.find(d => d.dc === prevDir.dc && d.dr === prevDir.dr);
          chosen = straight || candidates[Math.floor(Math.random() * candidates.length)];
        } else {
          chosen = candidates[Math.floor(Math.random() * candidates.length)];
        }

        prevDir = chosen;
        path.push({ col: last.col + chosen.dc, row: last.row + chosen.dr });
      }

      return { path, progress: 0 };
    }

    // Seed initial signals
    for (let i = 0; i < MAX_SIGNALS; i++) signals.push(makeSignal());

    // ── Draw helpers ──────────────────────────────────────────────────────
    const gridX = (col) => col * SPACING;
    const gridY = (row) => row * SPACING;

    // Draw the trail of a signal up to its current progress
    function drawSignal(sig) {
      const { path, progress } = sig;
      const headIdx  = Math.floor(progress);          // integer segment index
      const subT     = progress - headIdx;            // 0..1 within segment

      // Draw each completed edge in the trail
      // Fade older segments out
      const trailLen = Math.min(headIdx + 1, path.length - 1);
      for (let i = 0; i < trailLen; i++) {
        const a = path[i];
        const b = path[i + 1];
        // Age: 0 = head (bright), trailLen-1 = tail (dim)
        const age      = trailLen - 1 - i;
        const fadeRatio = 1 - age / (SIGNAL_STEPS * 0.7);
        if (fadeRatio <= 0) continue;

        // If this is the leading segment, draw only up to subT
        const isHead  = i === headIdx;
        const bx      = isHead ? gridX(a.col) + (gridX(b.col) - gridX(a.col)) * subT : gridX(b.col);
        const by      = isHead ? gridY(a.row) + (gridY(b.row) - gridY(a.row)) * subT : gridY(b.row);

        ctx.beginPath();
        ctx.moveTo(gridX(a.col), gridY(a.row));
        ctx.lineTo(bx, by);
        ctx.strokeStyle = `rgba(${COLOR}, ${LINE_ALPHA * fadeRatio})`;
        ctx.lineWidth   = 0.8;
        ctx.stroke();
      }

      // Glowing dot at signal head
      const headNode = path[Math.min(headIdx, path.length - 1)];
      const nextNode = path[Math.min(headIdx + 1, path.length - 1)];
      const hx = gridX(headNode.col) + (gridX(nextNode.col) - gridX(headNode.col)) * subT;
      const hy = gridY(headNode.row) + (gridY(nextNode.row) - gridY(headNode.row)) * subT;

      // Outer glow
      const grd = ctx.createRadialGradient(hx, hy, 0, hx, hy, 6);
      grd.addColorStop(0,   `rgba(${COLOR}, ${GLOW_ALPHA})`);
      grd.addColorStop(0.4, `rgba(${COLOR}, ${GLOW_ALPHA * 0.4})`);
      grd.addColorStop(1,   `rgba(${COLOR}, 0)`);
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Solid core dot
      ctx.beginPath();
      ctx.arc(hx, hy, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${COLOR}, ${GLOW_ALPHA})`;
      ctx.fill();
    }

    // ── Main loop ─────────────────────────────────────────────────────────
    let startTime = null;

    const draw = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = (timestamp - startTime) * SPEED;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw static dot grid with wave pulse
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x    = gridX(col);
          const y    = gridY(row);
          const wave = Math.sin(elapsed + (col + row) * WAVE_SCALE * SPACING);
          const alpha = MIN_ALPHA + ((wave + 1) / 2) * (MAX_ALPHA - MIN_ALPHA);

          ctx.beginPath();
          ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${COLOR}, ${alpha})`;
          ctx.fill();
        }
      }

      // 2. Draw and advance signals
      for (let i = signals.length - 1; i >= 0; i--) {
        const sig = signals[i];
        drawSignal(sig);

        // Advance
        sig.progress += SIGNAL_SPEED;

        // Recycle when signal finishes its path
        if (sig.progress >= sig.path.length - 1) {
          signals[i] = makeSignal();
        }
      }

      // Keep signal count stable (in case resize cleared them)
      while (signals.length < MAX_SIGNALS) signals.push(makeSignal());

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        display: "block",
      }}
      aria-hidden="true"
    />
  );
}
