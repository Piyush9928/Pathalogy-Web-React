import { useRef, useState } from 'react';

export default function SignaturePad({ onCapture }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function start(e) {
    drawing.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#1b2c47';
    ctx.lineWidth = 2;
    ctx.stroke();
    setHasDrawn(true);
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function capture() {
    if (!hasDrawn) return;
    onCapture(canvasRef.current.toDataURL('image/png'));
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={500}
        height={160}
        style={{ border: '1px dashed var(--lsp-border-strong)', borderRadius: 'var(--lsp-r-sm)', background: '#fff', touchAction: 'none', cursor: 'crosshair', width: '100%', maxWidth: 500 }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="d-flex gap-2 mt-2">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clear}>Clear</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={capture} disabled={!hasDrawn}>Use This Signature</button>
      </div>
    </div>
  );
}
