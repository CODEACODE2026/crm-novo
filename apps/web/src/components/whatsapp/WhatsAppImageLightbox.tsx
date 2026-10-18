'use client';

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';

export const imageLightboxMinScale = 1;
export const imageLightboxMaxScale = 5;
export const imageLightboxZoomStep = 0.2;
const imageLightboxDoubleClickScale = 2;

export type ImageLightboxTransform = {
  scale: number;
  x: number;
  y: number;
};

type Point = { x: number; y: number };
type LightboxMeasurements = {
  imageHeight: number;
  imageWidth: number;
  stageHeight: number;
  stageWidth: number;
};

const initialImageLightboxTransform: ImageLightboxTransform = { scale: 1, x: 0, y: 0 };

export function clampImageLightboxScale(scale: number) {
  return Math.min(imageLightboxMaxScale, Math.max(imageLightboxMinScale, scale));
}

export function imageLightboxPanBounds(scale: number, measurements: LightboxMeasurements) {
  return {
    x: Math.max(0, (measurements.imageWidth * scale - measurements.stageWidth) / 2),
    y: Math.max(0, (measurements.imageHeight * scale - measurements.stageHeight) / 2),
  };
}

export function clampImageLightboxTransform(
  transform: ImageLightboxTransform,
  measurements: LightboxMeasurements,
): ImageLightboxTransform {
  const scale = clampImageLightboxScale(transform.scale);
  if (scale === imageLightboxMinScale) return initialImageLightboxTransform;

  const bounds = imageLightboxPanBounds(scale, measurements);
  return {
    scale,
    x: Math.min(bounds.x, Math.max(-bounds.x, transform.x)),
    y: Math.min(bounds.y, Math.max(-bounds.y, transform.y)),
  };
}

export function zoomImageLightboxAtPoint(
  current: ImageLightboxTransform,
  nextScaleValue: number,
  point: Point,
  measurements: LightboxMeasurements,
) {
  const nextScale = clampImageLightboxScale(nextScaleValue);
  if (nextScale === imageLightboxMinScale) return initialImageLightboxTransform;

  const ratio = nextScale / current.scale;
  return clampImageLightboxTransform(
    {
      scale: nextScale,
      x: point.x - (point.x - current.x) * ratio,
      y: point.y - (point.y - current.y) * ratio,
    },
    measurements,
  );
}

function pointerDistance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointerMidpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

export function WhatsAppImageLightbox({
  alt,
  onClose,
  src,
}: {
  alt: string;
  onClose: () => void;
  src: string;
}) {
  const [transform, setTransform] = useState<ImageLightboxTransform>(initialImageLightboxTransform);
  const [interacting, setInteracting] = useState(false);
  const transformRef = useRef(transform);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const panStartRef = useRef<{
    pointerId: number;
    point: Point;
    transform: ImageLightboxTransform;
  } | null>(null);
  const pinchStartRef = useRef<{
    distance: number;
    midpoint: Point;
    scale: number;
    transform: ImageLightboxTransform;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const commitTransform = useCallback((next: ImageLightboxTransform) => {
    transformRef.current = next;
    setTransform(next);
  }, []);

  const measurements = useCallback((): LightboxMeasurements => {
    const stage = stageRef.current;
    const image = imageRef.current;
    return {
      imageHeight: image?.clientHeight ?? 0,
      imageWidth: image?.clientWidth ?? 0,
      stageHeight: stage?.clientHeight ?? 0,
      stageWidth: stage?.clientWidth ?? 0,
    };
  }, []);

  const reset = useCallback(() => {
    commitTransform(initialImageLightboxTransform);
  }, [commitTransform]);

  const clampCurrentTransform = useCallback(() => {
    commitTransform(clampImageLightboxTransform(transformRef.current, measurements()));
  }, [commitTransform, measurements]);

  const stagePoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  }, []);

  const zoomAt = useCallback(
    (nextScale: number, point: Point = { x: 0, y: 0 }) => {
      commitTransform(
        zoomImageLightboxAtPoint(transformRef.current, nextScale, point, measurements()),
      );
    },
    [commitTransform, measurements],
  );

  const zoomBy = useCallback(
    (amount: number) => zoomAt(transformRef.current.scale + amount),
    [zoomAt],
  );

  useEffect(() => {
    reset();
    pointersRef.current.clear();
    panStartRef.current = null;
    pinchStartRef.current = null;
    suppressClickRef.current = false;
    setInteracting(false);
  }, [reset, src]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.matches('input, textarea, select')) return;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomBy(imageLightboxZoomStep);
      } else if (event.key === '-') {
        event.preventDefault();
        zoomBy(-imageLightboxZoomStep);
      } else if (event.key === '0') {
        event.preventDefault();
        reset();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, reset, zoomBy]);

  useEffect(() => {
    const stage = stageRef.current;
    const observer =
      stage && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(clampCurrentTransform)
        : null;
    if (stage) observer?.observe(stage);
    window.addEventListener('resize', clampCurrentTransform);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', clampCurrentTransform);
    };
  }, [clampCurrentTransform]);

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY === 0) return;
    zoomAt(
      transformRef.current.scale +
        (event.deltaY < 0 ? imageLightboxZoomStep : -imageLightboxZoomStep),
      stagePoint(event.clientX, event.clientY),
    );
  }

  function handleDoubleClick(event: ReactMouseEvent<HTMLImageElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (transformRef.current.scale > imageLightboxMinScale) {
      reset();
      return;
    }
    zoomAt(imageLightboxDoubleClickScale, stagePoint(event.clientX, event.clientY));
  }

  function startRemainingPointerPan() {
    const remaining = [...pointersRef.current.entries()][0];
    if (!remaining || transformRef.current.scale <= imageLightboxMinScale) {
      panStartRef.current = null;
      return;
    }
    panStartRef.current = {
      pointerId: remaining[0],
      point: remaining[1],
      transform: transformRef.current,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = stagePoint(event.clientX, event.clientY);
    pointersRef.current.set(event.pointerId, point);
    suppressClickRef.current = false;

    const points = [...pointersRef.current.values()];
    if (points.length >= 2) {
      suppressClickRef.current = true;
      const midpoint = pointerMidpoint(points[0]!, points[1]!);
      pinchStartRef.current = {
        distance: Math.max(1, pointerDistance(points[0]!, points[1]!)),
        midpoint,
        scale: transformRef.current.scale,
        transform: transformRef.current,
      };
      panStartRef.current = null;
      setInteracting(true);
    } else if (transformRef.current.scale > imageLightboxMinScale) {
      panStartRef.current = {
        pointerId: event.pointerId,
        point,
        transform: transformRef.current,
      };
      setInteracting(true);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    const point = stagePoint(event.clientX, event.clientY);
    pointersRef.current.set(event.pointerId, point);

    const pinchStart = pinchStartRef.current;
    const points = [...pointersRef.current.values()];
    if (pinchStart && points.length >= 2) {
      const midpoint = pointerMidpoint(points[0]!, points[1]!);
      const distance = pointerDistance(points[0]!, points[1]!);
      const nextScale = clampImageLightboxScale(
        pinchStart.scale * (distance / pinchStart.distance),
      );
      const ratio = nextScale / pinchStart.scale;
      commitTransform(
        clampImageLightboxTransform(
          {
            scale: nextScale,
            x: midpoint.x - (pinchStart.midpoint.x - pinchStart.transform.x) * ratio,
            y: midpoint.y - (pinchStart.midpoint.y - pinchStart.transform.y) * ratio,
          },
          measurements(),
        ),
      );
      suppressClickRef.current = true;
      return;
    }

    const panStart = panStartRef.current;
    if (
      !panStart ||
      panStart.pointerId !== event.pointerId ||
      transformRef.current.scale <= imageLightboxMinScale
    ) {
      return;
    }
    commitTransform(
      clampImageLightboxTransform(
        {
          scale: panStart.transform.scale,
          x: panStart.transform.x + point.x - panStart.point.x,
          y: panStart.transform.y + point.y - panStart.point.y,
        },
        measurements(),
      ),
    );
    suppressClickRef.current = true;
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pinchStartRef.current = null;
    startRemainingPointerPan();
    if (pointersRef.current.size === 0) setInteracting(false);
  }

  function handleStageClick(event: ReactMouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (event.target === event.currentTarget) onClose();
  }

  const percent = Math.round(transform.scale * 100);
  const canZoomOut = transform.scale > imageLightboxMinScale;
  const canZoomIn = transform.scale < imageLightboxMaxScale;

  return createPortal(
    <div
      aria-label="Imagem da conversa"
      aria-modal="true"
      className="conversation-image-lightbox"
      role="dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget && !suppressClickRef.current) onClose();
      }}
    >
      <button
        ref={closeRef}
        aria-label="Fechar imagem"
        className="conversation-image-lightbox-close"
        type="button"
        onClick={onClose}
      >
        <X size={22} aria-hidden="true" />
      </button>

      <div
        ref={stageRef}
        className="conversation-image-lightbox-stage"
        data-dragging={interacting ? 'true' : 'false'}
        data-zoomed={transform.scale > imageLightboxMinScale ? 'true' : 'false'}
        onClick={handleStageClick}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerCancel={finishPointer}
        onPointerDown={handlePointerDown}
        onLostPointerCapture={finishPointer}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onWheel={handleWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          alt={alt}
          draggable={false}
          src={src}
          style={{
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          }}
          onDoubleClick={handleDoubleClick}
          onLoad={clampCurrentTransform}
        />
      </div>

      <div
        aria-label="Controles de zoom"
        className="conversation-image-lightbox-controls"
        role="group"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          aria-label="Diminuir zoom"
          disabled={!canZoomOut}
          type="button"
          onClick={() => zoomBy(-imageLightboxZoomStep)}
        >
          <Minus size={18} aria-hidden="true" />
        </button>
        <button aria-label="Redefinir zoom" disabled={!canZoomOut} type="button" onClick={reset}>
          <RotateCcw size={16} aria-hidden="true" />
          <span aria-live="polite">{percent}%</span>
        </button>
        <button
          aria-label="Aumentar zoom"
          disabled={!canZoomIn}
          type="button"
          onClick={() => zoomBy(imageLightboxZoomStep)}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
