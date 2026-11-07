'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Draw-to-sign pad. Works with a finger or stylus (touch / pen pointer events) and a mouse.
 * `touch-action: none` stops the page scrolling while a parent signs on a phone.
 * Calls onChange with a PNG data URL (or '' when cleared).
 */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef(0);
  const [empty, setEmpty] = useState(true);

  const setup = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const { width, height } = c.getBoundingClientRect();
    // Keep what's drawn when the canvas resizes (e.g. phone rotation).
    const prev = strokes.current ? c.toDataURL() : null;
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#201e1d';
    if (prev) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = prev;
    }
  }, []);

  useEffect(() => {
    setup();
    const ro = new ResizeObserver(() => setup());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [setup]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.beginPath();
    ctx.fillStyle = '#201e1d';
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext('2d')!;
    const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    const r = e.currentTarget.getBoundingClientRect();
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      const pressure = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5;
      ctx.lineWidth = 1.4 + pressure * 2.4;
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
    }
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    strokes.current += 1;
    setEmpty(false);
    onChange(e.currentTarget.toDataURL('image/png'));
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    strokes.current = 0;
    setEmpty(true);
    onChange('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="sigpad">
        <canvas
          ref={canvasRef}
          aria-label="Signature pad. Draw your signature with your finger, a stylus or a mouse."
          role="img"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={(e) => drawing.current && up(e)}
        />
        <div className="sigpad-x">×</div>
        <div className="sigpad-line" />
        {empty && <div className="sigpad-hint">Sign here with your finger, a stylus or your mouse</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="ink60" style={{ fontSize: 12 }}>{empty ? 'Not signed yet' : 'Signature captured'}</span>
        <button type="button" className="btn btn-ghost" style={{ color: 'var(--color-accent-700)' }} onClick={clear} disabled={empty}>Clear</button>
      </div>
    </div>
  );
}
