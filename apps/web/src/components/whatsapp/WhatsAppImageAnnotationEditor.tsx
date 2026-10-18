'use client';

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Pencil, RotateCcw, Send, Trash2, Undo2, X } from 'lucide-react';

export type ImageAnnotationPoint = { x: number; y: number };
export type ImageAnnotationStroke = {
  color: string;
  points: ImageAnnotationPoint[];
};
export type ImageAnnotationRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const imageAnnotationColors = [
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Amarelo', value: '#facc15' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Azul', value: '#3b82f6' },
] as const;

export function clampImageAnnotationPoint(point: ImageAnnotationPoint): ImageAnnotationPoint {
  const x = Number.isFinite(point.x) ? point.x : 0;
  const y = Number.isFinite(point.y) ? point.y : 0;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

export function imageAnnotationPointFromRect(
  rect: ImageAnnotationRect,
  clientX: number,
  clientY: number,
) {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null;
  }

  return clampImageAnnotationPoint({
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  });
}

type PointerCaptureElement = Partial<
  Pick<HTMLElement, 'hasPointerCapture' | 'releasePointerCapture' | 'setPointerCapture'>
>;

export function safelySetImageAnnotationPointerCapture(
  element: PointerCaptureElement,
  pointerId: number,
) {
  if (typeof element.setPointerCapture !== 'function') return false;
  try {
    element.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

export function safelyReleaseImageAnnotationPointerCapture(
  element: PointerCaptureElement,
  pointerId: number,
) {
  if (
    typeof element.hasPointerCapture !== 'function' ||
    typeof element.releasePointerCapture !== 'function'
  ) {
    return false;
  }
  try {
    if (!element.hasPointerCapture(pointerId)) return false;
    element.releasePointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

export function imageAnnotationOutputName(fileName: string, mimeType: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'imagem';
  return `${baseName}-anotada.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
}

export function imageAnnotationLineWidth(width: number, height: number) {
  return Math.max(4, Math.min(width, height) * 0.008);
}

export function imageAnnotationCanvasBytes(width: number, height: number) {
  return Math.max(0, width) * Math.max(0, height) * 4;
}

export function createImageAnnotationStroke(
  color: string,
  point: ImageAnnotationPoint,
): ImageAnnotationStroke {
  return { color, points: [clampImageAnnotationPoint(point)] };
}

export function appendImageAnnotationPoint(
  strokes: ImageAnnotationStroke[],
  point: ImageAnnotationPoint,
) {
  const lastIndex = strokes.length - 1;
  if (lastIndex < 0) return strokes;
  const normalizedPoint = clampImageAnnotationPoint(point);
  return strokes.map((stroke, index) =>
    index === lastIndex ? { ...stroke, points: [...stroke.points, normalizedPoint] } : stroke,
  );
}

export function undoImageAnnotationStroke(strokes: ImageAnnotationStroke[]) {
  return strokes.slice(0, -1);
}

export function drawImageAnnotationStrokes(
  context: CanvasRenderingContext2D,
  strokes: ImageAnnotationStroke[],
  width: number,
  height: number,
) {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = imageAnnotationLineWidth(width, height);

  for (const stroke of strokes) {
    const first = stroke.points[0];
    if (!first) continue;

    context.beginPath();
    context.strokeStyle = stroke.color;
    context.moveTo(first.x * width, first.y * height);

    if (stroke.points.length === 1) {
      context.lineTo(first.x * width + 0.01, first.y * height + 0.01);
    } else {
      for (const point of stroke.points.slice(1)) {
        context.lineTo(point.x * width, point.y * height);
      }
    }
    context.stroke();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Não foi possível gerar a imagem anotada.'));
      },
      mimeType,
      quality,
    );
  });
}

export async function exportAnnotatedImageFile(
  file: File,
  image: HTMLImageElement,
  strokes: ImageAnnotationStroke[],
) {
  if (strokes.length === 0) return file;

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context || canvas.width === 0 || canvas.height === 0) {
    throw new Error('Não foi possível preparar a imagem para envio.');
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  drawImageAnnotationStrokes(context, strokes, canvas.width, canvas.height);

  const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await canvasToBlob(canvas, mimeType, mimeType === 'image/jpeg' ? 0.92 : undefined);
  return new File([blob], imageAnnotationOutputName(file.name, mimeType), {
    type: mimeType,
    lastModified: Date.now(),
  });
}

export function WhatsAppImageAnnotationEditor({
  file,
  sending,
  onCancel,
  onSend,
}: {
  file: File;
  sending: boolean;
  onCancel: () => void;
  onSend: (file: File) => Promise<string | null>;
}) {
  const [objectUrl, setObjectUrl] = useState('');
  const [color, setColor] = useState<string>(imageAnnotationColors[0].value);
  const [strokes, setStrokes] = useState<ImageAnnotationStroke[]>([]);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [imageReady, setImageReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const activePointerRef = useRef<number | null>(null);
  const pointerCapturedRef = useRef(false);
  const strokesRef = useRef(strokes);
  const busy = exporting || sending;
  const busyRef = useRef(busy);
  const mountedRef = useRef(true);

  busyRef.current = busy;
  onCancelRef.current = onCancel;

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const nextObjectUrl = URL.createObjectURL(file);
    setObjectUrl(nextObjectUrl);
    setImageReady(false);
    setStrokes([]);
    setColor(imageAnnotationColors[0].value);
    setError('');
    activePointerRef.current = null;
    pointerCapturedRef.current = false;
    return () => URL.revokeObjectURL(nextObjectUrl);
  }, [file]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageReady) return;
    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.round(rect.width * pixelRatio));
    const pixelHeight = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
      setError((current) => current || 'Não foi possível iniciar a edição desta imagem.');
      return;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    drawImageAnnotationStrokes(context, strokesRef.current, rect.width, rect.height);
  }, [imageReady]);

  useEffect(() => {
    redraw();
  }, [redraw, strokes]);

  useEffect(() => {
    const image = imageRef.current;
    const observer =
      image && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(redraw) : null;
    if (image) observer?.observe(image);
    return () => observer?.disconnect();
  }, [redraw]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || busyRef.current) return;
      event.preventDefault();
      onCancelRef.current();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      activePointerRef.current = null;
      pointerCapturedRef.current = false;
    };
  }, []);

  function pointFromPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return imageAnnotationPointFromRect(rect, event.clientX, event.clientY);
  }

  function startStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (busy || !imageReady || activePointerRef.current !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromPointer(event);
    if (!point) {
      setError('Não foi possível iniciar a edição desta imagem.');
      return;
    }
    pointerCapturedRef.current = safelySetImageAnnotationPointerCapture(
      event.currentTarget,
      event.pointerId,
    );
    activePointerRef.current = event.pointerId;
    setStrokes((current) => [...current, createImageAnnotationStroke(color, point)]);
  }

  function continueStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== event.pointerId || busy || !imageReady) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromPointer(event);
    if (!point) return;
    setStrokes((current) => appendImageAnnotationPoint(current, point));
  }

  function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    safelyReleaseImageAnnotationPointerCapture(event.currentTarget, event.pointerId);
    pointerCapturedRef.current = false;
  }

  function finishUncapturedStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!pointerCapturedRef.current) finishStroke(event);
  }

  function resetEditor() {
    activePointerRef.current = null;
    pointerCapturedRef.current = false;
    setStrokes([]);
    setColor(imageAnnotationColors[0].value);
    setError('');
  }

  async function sendAnnotatedImage() {
    const image = imageRef.current;
    if (!image || !imageReady || busyRef.current) return;
    busyRef.current = true;
    setExporting(true);
    setError('');
    try {
      const annotatedFile = await exportAnnotatedImageFile(file, image, strokesRef.current);
      const sendError = await onSend(annotatedFile);
      if (sendError && mountedRef.current) setError(sendError);
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught instanceof Error ? caught.message : 'Não foi possível preparar a imagem.');
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setExporting(false);
    }
  }

  return createPortal(
    <div
      aria-label="Editar imagem antes de enviar"
      aria-modal="true"
      className="conversation-image-annotation-editor"
      role="dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busyRef.current) onCancelRef.current();
      }}
    >
      <div className="conversation-image-annotation-panel">
        <header className="conversation-image-annotation-header">
          <button
            ref={cancelRef}
            aria-label="Cancelar edição da imagem"
            disabled={busy}
            type="button"
            onClick={() => {
              if (!busyRef.current) onCancelRef.current();
            }}
          >
            <X aria-hidden="true" size={21} />
          </button>
          <div>
            <strong>Editar imagem</strong>
            <span>Desenhe sobre a foto antes de enviar</span>
          </div>
          <button
            aria-label="Enviar imagem anotada"
            className="conversation-image-annotation-send top"
            disabled={busy || !imageReady}
            type="button"
            onClick={() => void sendAnnotatedImage()}
          >
            <Send aria-hidden="true" size={18} />
            <span>{busy ? 'Enviando...' : 'Enviar'}</span>
          </button>
        </header>

        <div className="conversation-image-annotation-preview">
          <div className="conversation-image-annotation-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              alt="Prévia da imagem para anotação"
              draggable={false}
              src={objectUrl || undefined}
              onError={() => {
                setImageReady(false);
                setError('Não foi possível carregar esta imagem para edição.');
              }}
              onLoad={() => {
                setImageReady(true);
                setError('');
              }}
            />
            <canvas
              ref={canvasRef}
              aria-disabled={!imageReady}
              aria-label="Área de desenho sobre a imagem"
              className="conversation-image-annotation-canvas"
              role="img"
              onLostPointerCapture={finishStroke}
              onPointerCancel={finishStroke}
              onPointerDown={startStroke}
              onPointerLeave={finishUncapturedStroke}
              onPointerMove={continueStroke}
              onPointerUp={finishStroke}
            />
            {!imageReady && !error ? (
              <span className="conversation-image-annotation-loading" role="status">
                Preparando imagem...
              </span>
            ) : null}
          </div>
        </div>

        <div className="conversation-image-annotation-toolbar" aria-label="Ferramentas de edição">
          <button
            aria-label="Lápis selecionado"
            aria-pressed="true"
            className="is-selected"
            disabled={busy || !imageReady}
            type="button"
          >
            <Pencil aria-hidden="true" size={18} />
            <span>Lápis</span>
          </button>

          <div className="conversation-image-annotation-colors" aria-label="Cor do lápis">
            {imageAnnotationColors.map((option) => {
              const selected = option.value === color;
              return (
                <button
                  key={option.value}
                  aria-label={`Usar cor ${option.label}`}
                  aria-pressed={selected}
                  className={selected ? 'is-selected' : ''}
                  disabled={busy}
                  style={{ '--annotation-color': option.value } as CSSProperties}
                  type="button"
                  onClick={() => setColor(option.value)}
                >
                  <span className="conversation-image-annotation-color-dot" aria-hidden="true" />
                  <span className="sr-only">{option.label}</span>
                  {selected ? <Check aria-hidden="true" size={13} /> : null}
                </button>
              );
            })}
          </div>

          <button
            aria-label="Desfazer último traço"
            disabled={busy || strokes.length === 0}
            type="button"
            onClick={() => setStrokes(undoImageAnnotationStroke)}
          >
            <Undo2 aria-hidden="true" size={18} />
            <span>Desfazer</span>
          </button>
          <button
            aria-label="Limpar todas as anotações"
            disabled={busy || strokes.length === 0}
            type="button"
            onClick={() => setStrokes([])}
          >
            <Trash2 aria-hidden="true" size={18} />
            <span>Limpar</span>
          </button>
          <button
            aria-label="Resetar desenho"
            disabled={busy || (strokes.length === 0 && color === imageAnnotationColors[0].value)}
            type="button"
            onClick={resetEditor}
          >
            <RotateCcw aria-hidden="true" size={18} />
            <span>Resetar</span>
          </button>
        </div>

        {error ? (
          <div className="notice danger conversation-image-annotation-error" role="alert">
            {error}
          </div>
        ) : null}

        <footer className="conversation-image-annotation-footer">
          <button
            disabled={busy}
            type="button"
            onClick={() => {
              if (!busyRef.current) onCancelRef.current();
            }}
          >
            Cancelar
          </button>
          <button
            className="conversation-image-annotation-send"
            disabled={busy || !imageReady}
            type="button"
            onClick={() => void sendAnnotatedImage()}
          >
            <Send aria-hidden="true" size={18} />
            {busy ? 'Enviando...' : 'Enviar'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
