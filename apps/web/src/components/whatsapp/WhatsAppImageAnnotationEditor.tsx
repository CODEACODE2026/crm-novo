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
import { Check, Crop, Pencil, RotateCcw, Send, Trash2, Undo2, X } from 'lucide-react';

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
export type ImageCropRect = { x: number; y: number; width: number; height: number };

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

export function imageCropOutputName(fileName: string, mimeType: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'imagem';
  return `${baseName}-recortada.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
}

export function imageCropRectFromPoints(
  start: ImageAnnotationPoint,
  end: ImageAnnotationPoint,
): ImageCropRect {
  const first = clampImageAnnotationPoint(start);
  const last = clampImageAnnotationPoint(end);
  return {
    x: Math.min(first.x, last.x),
    y: Math.min(first.y, last.y),
    width: Math.abs(last.x - first.x),
    height: Math.abs(last.y - first.y),
  };
}

export function isImageCropRectValid(rect: ImageCropRect | null) {
  return Boolean(rect && rect.width >= 0.02 && rect.height >= 0.02);
}

export function imageCropPixelRect(
  crop: ImageCropRect,
  naturalWidth: number,
  naturalHeight: number,
) {
  if (
    !isImageCropRectValid(crop) ||
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }

  const left = Math.min(1, Math.max(0, crop.x));
  const top = Math.min(1, Math.max(0, crop.y));
  const right = Math.min(1, Math.max(0, crop.x + crop.width));
  const bottom = Math.min(1, Math.max(0, crop.y + crop.height));
  const x = Math.floor(left * naturalWidth);
  const y = Math.floor(top * naturalHeight);
  const rightPixel = Math.ceil(right * naturalWidth);
  const bottomPixel = Math.ceil(bottom * naturalHeight);
  const width = rightPixel - x;
  const height = bottomPixel - y;

  return width > 0 && height > 0 ? { x, y, width, height } : null;
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

export async function exportCroppedImageFile(
  file: File,
  image: HTMLImageElement,
  crop: ImageCropRect,
) {
  const pixels = imageCropPixelRect(crop, image.naturalWidth, image.naturalHeight);
  if (!pixels) {
    throw new Error('Selecione uma área válida para recortar.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const context = canvas.getContext('2d');
  if (!context || canvas.width <= 0 || canvas.height <= 0) {
    throw new Error('Não foi possível preparar o recorte desta imagem.');
  }

  context.drawImage(
    image,
    pixels.x,
    pixels.y,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await canvasToBlob(canvas, mimeType, mimeType === 'image/jpeg' ? 0.92 : undefined);
  return new File([blob], imageCropOutputName(file.name, mimeType), {
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
  onSend: (file: File, caption: string) => Promise<string | null>;
}) {
  const [workingFile, setWorkingFile] = useState(file);
  const [objectUrl, setObjectUrl] = useState('');
  const [color, setColor] = useState<string>(imageAnnotationColors[0].value);
  const [strokes, setStrokes] = useState<ImageAnnotationStroke[]>([]);
  const [caption, setCaption] = useState('');
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<ImageCropRect | null>(null);
  const [cropping, setCropping] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [imageReady, setImageReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const activePointerRef = useRef<number | null>(null);
  const pointerCapturedRef = useRef(false);
  const cropStartRef = useRef<ImageAnnotationPoint | null>(null);
  const cropModeRef = useRef(cropMode);
  const strokesRef = useRef(strokes);
  const busy = cropping || exporting || sending;
  const busyRef = useRef(busy);
  const mountedRef = useRef(true);

  busyRef.current = busy;
  cropModeRef.current = cropMode;
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
    setWorkingFile(file);
    setStrokes([]);
    setCaption('');
    setCropMode(false);
    setCropRect(null);
    setColor(imageAnnotationColors[0].value);
    setError('');
    activePointerRef.current = null;
    cropStartRef.current = null;
    pointerCapturedRef.current = false;
  }, [file]);

  useEffect(() => {
    const nextObjectUrl = URL.createObjectURL(workingFile);
    setObjectUrl(nextObjectUrl);
    setImageReady(false);
    return () => URL.revokeObjectURL(nextObjectUrl);
  }, [workingFile]);

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
      if (cropModeRef.current) {
        setCropMode(false);
        setCropRect(null);
        activePointerRef.current = null;
        cropStartRef.current = null;
        pointerCapturedRef.current = false;
      } else {
        onCancelRef.current();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      activePointerRef.current = null;
      cropStartRef.current = null;
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
    if (cropMode) {
      cropStartRef.current = point;
      setCropRect(imageCropRectFromPoints(point, point));
    } else {
      setStrokes((current) => [...current, createImageAnnotationStroke(color, point)]);
    }
  }

  function continueStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== event.pointerId || busy || !imageReady) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromPointer(event);
    if (!point) return;
    if (cropMode) {
      const start = cropStartRef.current;
      if (start) setCropRect(imageCropRectFromPoints(start, point));
    } else {
      setStrokes((current) => appendImageAnnotationPoint(current, point));
    }
  }

  function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    cropStartRef.current = null;
    safelyReleaseImageAnnotationPointerCapture(event.currentTarget, event.pointerId);
    pointerCapturedRef.current = false;
  }

  function finishUncapturedStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!pointerCapturedRef.current) finishStroke(event);
  }

  function resetEditor() {
    activePointerRef.current = null;
    pointerCapturedRef.current = false;
    cropStartRef.current = null;
    setWorkingFile(file);
    setStrokes([]);
    setCaption('');
    setCropMode(false);
    setCropRect(null);
    setColor(imageAnnotationColors[0].value);
    setError('');
  }

  function startCrop() {
    if (busyRef.current || !imageReady) return;
    if (strokesRef.current.length > 0) {
      setError('Limpe ou resete o desenho antes de recortar a imagem.');
      return;
    }
    setError('');
    setCropMode(true);
    setCropRect(null);
  }

  function cancelCrop() {
    if (busyRef.current) return;
    activePointerRef.current = null;
    cropStartRef.current = null;
    pointerCapturedRef.current = false;
    setCropMode(false);
    setCropRect(null);
    setError('');
  }

  async function confirmCrop() {
    const image = imageRef.current;
    if (!image || !imageReady || !isImageCropRectValid(cropRect) || busyRef.current) {
      if (!isImageCropRectValid(cropRect)) setError('Selecione uma área válida para recortar.');
      return;
    }
    busyRef.current = true;
    setCropping(true);
    setError('');
    try {
      const croppedFile = await exportCroppedImageFile(workingFile, image, cropRect!);
      if (!mountedRef.current) return;
      setImageReady(false);
      setWorkingFile(croppedFile);
      setStrokes([]);
      setCropMode(false);
      setCropRect(null);
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught instanceof Error ? caught.message : 'Não foi possível recortar a imagem.');
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setCropping(false);
    }
  }

  async function sendAnnotatedImage() {
    const image = imageRef.current;
    if (!image || !imageReady || busyRef.current) return;
    busyRef.current = true;
    setExporting(true);
    setError('');
    try {
      const annotatedFile = await exportAnnotatedImageFile(workingFile, image, strokesRef.current);
      const sendError = await onSend(annotatedFile, caption.trim());
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
            <span>
              {cropMode ? 'Selecione a área do recorte' : 'Recorte, desenhe e adicione uma legenda'}
            </span>
          </div>
          <button
            aria-label="Enviar imagem anotada"
            className="conversation-image-annotation-send top"
            disabled={busy || !imageReady || cropMode}
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
              aria-label={
                cropMode ? 'Área de seleção do recorte' : 'Área de desenho sobre a imagem'
              }
              className="conversation-image-annotation-canvas"
              role="img"
              onLostPointerCapture={finishStroke}
              onPointerCancel={finishStroke}
              onPointerDown={startStroke}
              onPointerLeave={finishUncapturedStroke}
              onPointerMove={continueStroke}
              onPointerUp={finishStroke}
            />
            {cropMode && cropRect ? (
              <span
                aria-hidden="true"
                className="conversation-image-annotation-crop-selection"
                style={
                  {
                    '--crop-x': `${cropRect.x * 100}%`,
                    '--crop-y': `${cropRect.y * 100}%`,
                    '--crop-width': `${cropRect.width * 100}%`,
                    '--crop-height': `${cropRect.height * 100}%`,
                  } as CSSProperties
                }
              />
            ) : null}
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
            aria-pressed={!cropMode}
            className={!cropMode ? 'is-selected' : ''}
            disabled={busy || !imageReady || cropMode}
            type="button"
          >
            <Pencil aria-hidden="true" size={18} />
            <span>Lápis</span>
          </button>

          <button
            aria-label="Recortar imagem"
            aria-pressed={cropMode}
            className={cropMode ? 'is-selected' : ''}
            disabled={busy || !imageReady}
            type="button"
            onClick={startCrop}
          >
            <Crop aria-hidden="true" size={18} />
            <span>Recortar</span>
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
                  disabled={busy || cropMode}
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
            disabled={busy || cropMode || strokes.length === 0}
            type="button"
            onClick={() => setStrokes(undoImageAnnotationStroke)}
          >
            <Undo2 aria-hidden="true" size={18} />
            <span>Desfazer</span>
          </button>
          <button
            aria-label="Limpar todas as anotações"
            disabled={busy || cropMode || strokes.length === 0}
            type="button"
            onClick={() => setStrokes([])}
          >
            <Trash2 aria-hidden="true" size={18} />
            <span>Limpar</span>
          </button>
          <button
            aria-label="Resetar edição"
            disabled={
              busy ||
              (workingFile === file &&
                strokes.length === 0 &&
                caption.length === 0 &&
                color === imageAnnotationColors[0].value &&
                !cropMode)
            }
            type="button"
            onClick={resetEditor}
          >
            <RotateCcw aria-hidden="true" size={18} />
            <span>Resetar</span>
          </button>
        </div>

        {cropMode ? (
          <div
            aria-label="Controles de recorte"
            className="conversation-image-annotation-crop-controls"
            role="group"
          >
            <span>Arraste sobre a imagem para selecionar a área.</span>
            <button disabled={busy} type="button" onClick={cancelCrop}>
              Cancelar recorte
            </button>
            <button
              className="conversation-image-annotation-crop-confirm"
              disabled={busy || !isImageCropRectValid(cropRect)}
              type="button"
              onClick={() => void confirmCrop()}
            >
              <Check aria-hidden="true" size={17} />
              {cropping ? 'Recortando...' : 'Confirmar recorte'}
            </button>
          </div>
        ) : null}

        <label className="conversation-image-annotation-caption">
          <span>Legenda</span>
          <textarea
            disabled={busy}
            maxLength={2000}
            placeholder="Adicione uma legenda (opcional)"
            rows={2}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
        </label>

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
            disabled={busy || !imageReady || cropMode}
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
