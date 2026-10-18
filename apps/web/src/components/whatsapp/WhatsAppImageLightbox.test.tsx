import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  clampImageLightboxScale,
  clampImageLightboxTransform,
  imageLightboxMaxScale,
  imageLightboxMinScale,
  imageLightboxPanBounds,
  zoomImageLightboxAtPoint,
} from './WhatsAppImageLightbox';

const currentDir = dirname(fileURLToPath(import.meta.url));
const lightboxSource = readFileSync(join(currentDir, 'WhatsAppImageLightbox.tsx'), 'utf8');
const inboxSource = readFileSync(join(currentDir, 'WhatsAppInbox.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../../app/globals.css'), 'utf8');
const measurements = {
  imageHeight: 600,
  imageWidth: 800,
  stageHeight: 600,
  stageWidth: 800,
};

describe('CHAT-MEDIA-ZOOM1 image lightbox', () => {
  it('clamps wheel, controls and pinch scales between one and five', () => {
    expect(clampImageLightboxScale(0.2)).toBe(imageLightboxMinScale);
    expect(clampImageLightboxScale(2.4)).toBe(2.4);
    expect(clampImageLightboxScale(9)).toBe(imageLightboxMaxScale);
    expect(lightboxSource).toContain('event.deltaY < 0');
    expect(lightboxSource).toContain('pinchStart.scale * (distance / pinchStart.distance)');
  });

  it('resets translation whenever scale returns to one', () => {
    expect(clampImageLightboxTransform({ scale: 1, x: 200, y: -140 }, measurements)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });

  it('computes deterministic pan bounds and clamps every edge', () => {
    expect(imageLightboxPanBounds(2, measurements)).toEqual({ x: 400, y: 300 });
    expect(clampImageLightboxTransform({ scale: 2, x: 999, y: -999 }, measurements)).toEqual({
      scale: 2,
      x: 400,
      y: -300,
    });
  });

  it('keeps small scaled images centered until they exceed the stage', () => {
    expect(
      imageLightboxPanBounds(2, {
        imageHeight: 120,
        imageWidth: 160,
        stageHeight: 600,
        stageWidth: 800,
      }),
    ).toEqual({ x: 0, y: 0 });
  });

  it('zooms around the cursor and clamps the resulting translation', () => {
    expect(
      zoomImageLightboxAtPoint({ scale: 1, x: 0, y: 0 }, 2, { x: 200, y: 100 }, measurements),
    ).toEqual({ scale: 2, x: -200, y: -100 });
  });

  it('supports drag only while zoomed and suppresses backdrop close after gestures', () => {
    expect(lightboxSource).toContain('transformRef.current.scale > imageLightboxMinScale');
    expect(lightboxSource).toContain('suppressClickRef.current = true');
    expect(lightboxSource).toMatch(
      /if \(points\.length >= 2\) \{\s+suppressClickRef\.current = true;/,
    );
    expect(lightboxSource).toContain('if (suppressClickRef.current)');
    expect(lightboxSource).toContain('event.target === event.currentTarget');
  });

  it('supports double click zoom/reset and explicit accessible controls', () => {
    expect(lightboxSource).toContain('imageLightboxDoubleClickScale');
    expect(lightboxSource).toContain('aria-label="Aumentar zoom"');
    expect(lightboxSource).toContain('aria-label="Diminuir zoom"');
    expect(lightboxSource).toContain('aria-label="Redefinir zoom"');
    expect(lightboxSource).toContain('aria-live="polite"');
  });

  it('uses captured Pointer Events for mouse, touch, pen, pinch and mobile pan', () => {
    expect(lightboxSource).toContain('setPointerCapture(event.pointerId)');
    expect(lightboxSource).toContain('onPointerCancel={finishPointer}');
    expect(lightboxSource).toContain('onLostPointerCapture={finishPointer}');
    expect(lightboxSource).toContain('pointersRef.current');
    expect(lightboxSource).toContain('pointerMidpoint');
    expect(stylesSource).toContain('touch-action: none;');
  });

  it('locks body scroll, handles keyboard commands and cleans every listener', () => {
    expect(lightboxSource).toContain("document.body.style.overflow = 'hidden'");
    expect(lightboxSource).toContain('document.body.style.overflow = previousOverflow');
    expect(lightboxSource).toContain("event.key === 'Escape'");
    expect(lightboxSource).toContain("event.key === '+' || event.key === '='");
    expect(lightboxSource).toContain("event.key === '-'");
    expect(lightboxSource).toContain("event.key === '0'");
    expect(lightboxSource).toContain("window.removeEventListener('keydown', handleKeyDown)");
  });

  it('reclamps on image load, ResizeObserver and viewport resize', () => {
    expect(lightboxSource).toContain('new ResizeObserver(clampCurrentTransform)');
    expect(lightboxSource).toContain("window.addEventListener('resize', clampCurrentTransform)");
    expect(lightboxSource).toContain('onLoad={clampCurrentTransform}');
    expect(lightboxSource).toContain('observer?.disconnect()');
  });

  it('clears pointer, drag and click-suppression state when the image source changes', () => {
    expect(lightboxSource).toContain('pointersRef.current.clear()');
    expect(lightboxSource).toContain('panStartRef.current = null');
    expect(lightboxSource).toContain('pinchStartRef.current = null');
    expect(lightboxSource).toContain('suppressClickRef.current = false');
    expect(lightboxSource).toContain('setInteracting(false)');
  });

  it('isolates GPU transforms in an image-only portal without changing video or stickers', () => {
    expect(inboxSource).toContain("if (message.type === 'IMAGE')");
    expect(inboxSource).toContain('<WhatsAppImageLightbox');
    expect(inboxSource).toContain("if (message.type === 'STICKER')");
    expect(inboxSource).toContain('<video className="conversation-video-media"');
    expect(lightboxSource).toContain('createPortal(');
    expect(lightboxSource).toContain('translate3d(');
    expect(stylesSource).toContain('will-change: transform;');
    expect(stylesSource).toContain('-webkit-user-drag: none;');
  });

  it('keeps scale-one image fit and mobile safe-area viewport constraints', () => {
    expect(stylesSource).toContain('object-fit: contain;');
    expect(stylesSource).toContain('env(safe-area-inset-top)');
    expect(stylesSource).toContain('env(safe-area-inset-bottom)');
    expect(stylesSource).toContain('min-height: 100dvh;');
    expect(stylesSource).toContain('@media (max-width: 620px)');
  });
});
