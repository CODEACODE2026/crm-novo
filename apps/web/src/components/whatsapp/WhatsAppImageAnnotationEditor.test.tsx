import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  appendImageAnnotationPoint,
  clampImageAnnotationPoint,
  createImageAnnotationStroke,
  drawImageAnnotationStrokes,
  exportAnnotatedImageFile,
  exportCroppedImageFile,
  imageAnnotationCanvasBytes,
  imageAnnotationLineWidth,
  imageAnnotationOutputName,
  imageAnnotationPointFromRect,
  imageCropOutputName,
  imageCropPixelRect,
  imageCropRectFromPoints,
  isImageCropRectValid,
  safelyReleaseImageAnnotationPointerCapture,
  safelySetImageAnnotationPointerCapture,
  undoImageAnnotationStroke,
} from './WhatsAppImageAnnotationEditor';

const currentDir = dirname(fileURLToPath(import.meta.url));
const editorSource = readFileSync(join(currentDir, 'WhatsAppImageAnnotationEditor.tsx'), 'utf8');
const inboxSource = readFileSync(join(currentDir, 'WhatsAppInbox.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../../app/globals.css'), 'utf8');

describe('CHAT-MEDIA-ANNOTATE1 image annotation editor', () => {
  it('normalizes pointer coordinates and creates a stroke with the selected color', () => {
    expect(clampImageAnnotationPoint({ x: -0.5, y: 1.8 })).toEqual({ x: 0, y: 1 });
    expect(createImageAnnotationStroke('#3b82f6', { x: 0.25, y: 0.75 })).toEqual({
      color: '#3b82f6',
      points: [{ x: 0.25, y: 0.75 }],
    });
  });

  it('snapshots finite pointer coordinates before a React event can be invalidated', () => {
    const point = imageAnnotationPointFromRect(
      { left: 100, top: 50, width: 400, height: 200 },
      300,
      100,
    );

    expect(point).toEqual({ x: 0.5, y: 0.25 });
    const startStrokeSource = editorSource.slice(
      editorSource.indexOf('function startStroke'),
      editorSource.indexOf('function continueStroke'),
    );
    expect(startStrokeSource.indexOf('const point = pointFromPointer(event)')).toBeLessThan(
      startStrokeSource.indexOf('setStrokes((current)'),
    );
    expect(startStrokeSource).not.toContain('pointFromPointer(event))');
  });

  it('rejects zero-sized or non-finite pointer geometry without creating invalid strokes', () => {
    expect(imageAnnotationPointFromRect({ left: 0, top: 0, width: 0, height: 100 }, 1, 1)).toBe(
      null,
    );
    expect(
      imageAnnotationPointFromRect({ left: 0, top: 0, width: 100, height: 100 }, Number.NaN, 1),
    ).toBe(null);
    expect(clampImageAnnotationPoint({ x: Number.NaN, y: Number.POSITIVE_INFINITY })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('appends pointer/touch movement only to the current stroke', () => {
    const first = createImageAnnotationStroke('#ef4444', { x: 0.1, y: 0.2 });
    const second = createImageAnnotationStroke('#22c55e', { x: 0.4, y: 0.5 });
    const result = appendImageAnnotationPoint([first, second], { x: 0.8, y: 0.9 });

    expect(result[0]).toEqual(first);
    expect(result[1]).toEqual({
      color: '#22c55e',
      points: [
        { x: 0.4, y: 0.5 },
        { x: 0.8, y: 0.9 },
      ],
    });
  });

  it('removes exactly the latest stroke and supports repeated undo down to zero', () => {
    const first = createImageAnnotationStroke('#ef4444', { x: 0.1, y: 0.2 });
    const second = createImageAnnotationStroke('#22c55e', { x: 0.4, y: 0.5 });

    expect(undoImageAnnotationStroke([first, second])).toEqual([first]);
    expect(undoImageAnnotationStroke([first])).toEqual([]);
    expect(undoImageAnnotationStroke([])).toEqual([]);
  });

  it('draws normalized strokes at preview or natural image resolution', () => {
    const lineTo = vi.fn();
    const moveTo = vi.fn();
    const stroke = vi.fn();
    const context = {
      beginPath: vi.fn(),
      lineTo,
      moveTo,
      stroke,
      lineCap: '',
      lineJoin: '',
      lineWidth: 0,
      strokeStyle: '',
    } as unknown as CanvasRenderingContext2D;

    drawImageAnnotationStrokes(
      context,
      [
        {
          color: '#facc15',
          points: [
            { x: 0.25, y: 0.5 },
            { x: 0.75, y: 0.8 },
          ],
        },
      ],
      800,
      600,
    );

    expect(moveTo).toHaveBeenCalledWith(200, 300);
    expect(lineTo).toHaveBeenCalledWith(600, 480);
    expect(stroke).toHaveBeenCalledOnce();
    expect(context.strokeStyle).toBe('#facc15');
    expect(context.lineWidth).toBe(imageAnnotationLineWidth(800, 600));
  });

  it('keeps the original file when the user sends without drawing', async () => {
    const file = new File(['image'], 'foto.png', { type: 'image/png' });
    const result = await exportAnnotatedImageFile(file, {} as HTMLImageElement, []);
    expect(result).toBe(file);
  });

  it('creates deterministic annotated output names for PNG and JPEG', () => {
    expect(imageAnnotationOutputName('foto.png', 'image/png')).toBe('foto-anotada.png');
    expect(imageAnnotationOutputName('camera.jpeg', 'image/jpeg')).toBe('camera-anotada.jpg');
  });

  it('exports annotation on a natural-resolution canvas entirely in the frontend', () => {
    expect(editorSource).toContain('canvas.width = image.naturalWidth');
    expect(editorSource).toContain('canvas.height = image.naturalHeight');
    expect(editorSource).toContain('context.drawImage(image, 0, 0, canvas.width, canvas.height)');
    expect(editorSource).toContain('new File([blob], imageAnnotationOutputName');
    expect(editorSource).not.toContain('fetch(');
  });

  it('documents natural-resolution RGBA memory cost for large mobile photos', () => {
    expect(imageAnnotationCanvasBytes(4000, 3000)).toBe(48_000_000);
    expect(imageAnnotationCanvasBytes(6000, 4000)).toBe(96_000_000);
  });

  it('keeps browser-decoded EXIF orientation aligned between preview and drawImage export', () => {
    expect(stylesSource).toMatch(
      /\.conversation-image-annotation-surface img \{[\s\S]*?image-orientation: from-image;/,
    );
    expect(editorSource).toContain('canvas.width = image.naturalWidth');
    expect(editorSource).toContain('context.drawImage(image, 0, 0, canvas.width, canvas.height)');
  });

  it('uses guarded Pointer Events for mouse, touch and pen drawing', () => {
    expect(editorSource).toContain('safelySetImageAnnotationPointerCapture(');
    expect(editorSource).toContain('onPointerDown={startStroke}');
    expect(editorSource).toContain('onPointerMove={continueStroke}');
    expect(editorSource).toContain('onPointerCancel={finishStroke}');
    expect(editorSource).toContain('onLostPointerCapture={finishStroke}');
    expect(editorSource).toContain('onPointerLeave={finishUncapturedStroke}');
    expect(editorSource).not.toContain('event.buttons');
    expect(stylesSource).toMatch(
      /\.conversation-image-annotation-canvas \{[\s\S]*?touch-action: none;/,
    );
  });

  it('captures and releases a pointer when the browser supports it', () => {
    const element = {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    };

    expect(safelySetImageAnnotationPointerCapture(element, 7)).toBe(true);
    expect(safelyReleaseImageAnnotationPointerCapture(element, 7)).toBe(true);
    expect(element.setPointerCapture).toHaveBeenCalledWith(7);
    expect(element.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it('keeps drawing available when pointer capture is missing or throws', () => {
    expect(safelySetImageAnnotationPointerCapture({}, 3)).toBe(false);
    expect(safelyReleaseImageAnnotationPointerCapture({}, 3)).toBe(false);
    expect(
      safelySetImageAnnotationPointerCapture(
        {
          setPointerCapture: () => {
            throw new DOMException('inactive pointer');
          },
        },
        3,
      ),
    ).toBe(false);
    expect(
      safelyReleaseImageAnnotationPointerCapture(
        {
          hasPointerCapture: () => {
            throw new DOMException('capture lost');
          },
          releasePointerCapture: vi.fn(),
        },
        3,
      ),
    ).toBe(false);
  });

  it('blocks drawing until the image is ready and handles a missing 2d context locally', () => {
    expect(editorSource).toContain('if (busy || !imageReady || activePointerRef.current !== null)');
    expect(editorSource).toContain('setImageReady(true)');
    expect(editorSource).toContain('setImageReady(false)');
    expect(editorSource).toContain("current || 'Não foi possível iniciar a edição desta imagem.'");
    expect(editorSource).toContain('aria-disabled={!imageReady}');
    expect(editorSource).toContain('Preparando imagem...');
  });

  it('creates the natural-resolution export canvas only during Send, never on pointerdown', () => {
    const startStrokeSource = editorSource.slice(
      editorSource.indexOf('function startStroke'),
      editorSource.indexOf('function continueStroke'),
    );
    expect(startStrokeSource).not.toContain('document.createElement');
    expect(startStrokeSource).not.toContain('naturalWidth');
    expect(editorSource.indexOf("document.createElement('canvas')")).toBeLessThan(
      editorSource.indexOf('function WhatsAppImageAnnotationEditor'),
    );
  });

  it('provides pencil, color, undo, clear and reset controls', () => {
    expect(editorSource).toContain('aria-label="Lápis selecionado"');
    expect(editorSource).toContain('aria-label={`Usar cor ${option.label}`}');
    expect(editorSource).toContain('aria-label="Desfazer último traço"');
    expect(editorSource).toContain('setStrokes(undoImageAnnotationStroke)');
    expect(editorSource).toContain('aria-label="Limpar todas as anotações"');
    expect(editorSource).toContain('aria-label="Resetar edição"');
    expect(editorSource).toContain('setColor(imageAnnotationColors[0].value)');
  });

  it('opens a portal dialog, locks body scroll, handles Escape and cleans resources', () => {
    expect(editorSource).toContain('createPortal(');
    expect(editorSource).toContain('aria-modal="true"');
    expect(editorSource).toContain('role="dialog"');
    expect(editorSource).toContain("document.body.style.overflow = 'hidden'");
    expect(editorSource).toContain('document.body.style.overflow = previousOverflow');
    expect(editorSource).toContain("event.key !== 'Escape'");
    expect(editorSource).toContain('URL.revokeObjectURL(nextObjectUrl)');
    expect(editorSource).toContain('cancelRef.current?.focus()');
  });

  it('routes only IMAGE attachments into the editor', () => {
    expect(inboxSource).toMatch(
      /if \(validation\.kind === 'IMAGE'\) \{\s+setPendingImageAnnotation\(file\);/,
    );
    expect(inboxSource).toContain('return createConversationComposerMedia(file, validation.kind);');
    expect(inboxSource).toContain('<WhatsAppImageAnnotationEditor');
    expect(inboxSource).toContain("mediaOverride: { file, kind: 'IMAGE', previewUrl: null }");
  });

  it('funnels picker, paste and drop through the same image entry point', () => {
    expect(inboxSource).toContain('onSelectMedia={selectComposerMedia}');
    expect(inboxSource).toContain('handleIncomingFileList(event.dataTransfer.files)');
    expect(inboxSource).toContain('const files = clipboardIncomingFiles(event.clipboardData)');
    expect(inboxSource).toContain('return handleIncomingFile(file, { notice });');
  });

  it('cancels without sending and reuses the existing media send path on confirmation', () => {
    const cancelStart = inboxSource.indexOf('function cancelImageAnnotation()');
    const sendStart = inboxSource.indexOf(
      'async function sendAnnotatedImage(file: File, caption: string)',
    );
    const cancelSource = inboxSource.slice(cancelStart, sendStart);
    const sendSource = inboxSource.slice(
      sendStart,
      inboxSource.indexOf('async function', sendStart + 20),
    );

    expect(cancelSource).toContain('setPendingImageAnnotation(null)');
    expect(cancelSource).not.toContain('sendWhatsAppConversationMedia');
    expect(sendSource).toContain('sendCurrentMessage(undefined');
    expect(inboxSource).toContain('await sendWhatsAppConversationMedia(selectedConversation.id');
    expect(cancelSource).not.toContain('setDrafts');
    expect(cancelSource).not.toContain('setReplyTarget');
  });

  it('preserves PNG alpha and emits coherent JPEG/PNG MIME extensions', () => {
    expect(editorSource).not.toContain('context.fillRect(');
    expect(editorSource).toContain(
      "const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';",
    );
    expect(editorSource).toContain("mimeType === 'image/jpeg' ? 0.92 : undefined");
    expect(imageAnnotationOutputName('alpha.png', 'image/png')).toBe('alpha-anotada.png');
    expect(imageAnnotationOutputName('photo.jpg', 'image/jpeg')).toBe('photo-anotada.jpg');
  });

  it('revalidates the generated file and keeps export failures visible without fallback send', () => {
    expect(inboxSource).toContain(
      "classifyConversationIncomingFile(file, { expectedKind: 'IMAGE' })",
    );
    expect(editorSource).toContain("reject(new Error('Não foi possível gerar a imagem anotada.'))");
    expect(editorSource).toContain(
      "setError('Não foi possível carregar esta imagem para edição.')",
    );
    expect(editorSource).not.toContain('catch (caught) {\n      await onSend(file)');
  });

  it('closes the synchronous double-submit window before canvas composition starts', () => {
    expect(editorSource).toContain('if (!image || !imageReady || busyRef.current) return;');
    expect(editorSource).toContain('busyRef.current = true;');
    expect(editorSource).toContain('disabled={busy}');
  });

  it('limits editable formats to the safe JPEG and PNG contract already accepted by composer', () => {
    expect(inboxSource).toContain(
      "const allowedConversationImageMimeTypes = new Set(['image/jpeg', 'image/png']);",
    );
    expect(inboxSource).toContain("export const conversationImageAccept = 'image/jpeg,image/png';");
    expect(editorSource).toContain("file.type === 'image/png' ? 'image/png' : 'image/jpeg'");
  });

  it('resets editor state for new images and prevents post-unmount updates', () => {
    expect(inboxSource).toContain(
      'key={`${pendingImageAnnotation.name}:${pendingImageAnnotation.size}:${pendingImageAnnotation.lastModified}`}',
    );
    expect(inboxSource).toContain('setPendingImageAnnotation(null)');
    expect(editorSource).toContain('mountedRef.current = true');
    expect(editorSource).toContain('mountedRef.current = false');
    expect(editorSource).toContain('const nextObjectUrl = URL.createObjectURL(workingFile)');
    expect(editorSource).toContain('if (mountedRef.current) setExporting(false)');
  });

  it('keeps mobile and desktop controls accessible inside safe viewport bounds', () => {
    expect(stylesSource).toContain('.conversation-image-annotation-editor');
    expect(stylesSource).toContain('min-height: 100dvh;');
    expect(stylesSource).toContain('env(safe-area-inset-top)');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toMatch(
      /\.conversation-image-annotation-toolbar button,[\s\S]*?\{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/,
    );
    expect(editorSource).toContain('aria-label="Cancelar edição da imagem"');
    expect(editorSource).toContain('aria-label="Enviar imagem anotada"');
    expect(stylesSource).toContain('outline: 3px solid #38bdf8;');
  });
});

describe('CHAT-MEDIA-ANNOTATE2 caption and crop', () => {
  it('normalizes crop geometry for every drag direction and rejects unsafe tiny selections', () => {
    expect(imageCropRectFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 })).toEqual({
      x: 0.2,
      y: 0.1,
      width: 0.6000000000000001,
      height: 0.6,
    });
    expect(imageCropRectFromPoints({ x: -1, y: 2 }, { x: 2, y: -1 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(isImageCropRectValid({ x: 0, y: 0, width: 0.5, height: 0.5 })).toBe(true);
    expect(isImageCropRectValid({ x: 0, y: 0, width: 0.01, height: 0.5 })).toBe(false);
    expect(isImageCropRectValid(null)).toBe(false);
  });

  it('creates coherent crop output names for PNG and JPEG', () => {
    expect(imageCropOutputName('alpha.png', 'image/png')).toBe('alpha-recortada.png');
    expect(imageCropOutputName('camera.jpeg', 'image/jpeg')).toBe('camera-recortada.jpg');
  });

  it('maps visual crop coordinates to natural pixels for every image proportion', () => {
    const crop = { x: 0.25, y: 0.2, width: 0.5, height: 0.6 };
    expect(imageCropPixelRect(crop, 1000, 1000)).toEqual({
      x: 250,
      y: 200,
      width: 500,
      height: 600,
    });
    expect(imageCropPixelRect(crop, 4000, 2000)).toEqual({
      x: 1000,
      y: 400,
      width: 2000,
      height: 1200,
    });
    expect(imageCropPixelRect(crop, 600, 1200)).toEqual({
      x: 150,
      y: 240,
      width: 300,
      height: 720,
    });
    expect(imageCropPixelRect(crop, 20, 10)).toEqual({
      x: 5,
      y: 2,
      width: 10,
      height: 6,
    });
  });

  it('clamps crop pixels at image borders and rejects rectangles outside the image', () => {
    expect(imageCropPixelRect({ x: -0.2, y: 0.9, width: 0.7, height: 0.3 }, 101, 99)).toEqual({
      x: 0,
      y: 89,
      width: 51,
      height: 10,
    });
    expect(imageCropPixelRect({ x: 2, y: 2, width: 0.5, height: 0.5 }, 100, 100)).toBe(null);
    expect(imageCropPixelRect({ x: 0, y: 0, width: 0.01, height: 1 }, 100, 100)).toBe(null);
  });

  it('exports the selected source rectangle without a network request or PNG background fill', () => {
    const cropExportSource = editorSource.slice(
      editorSource.indexOf('export async function exportCroppedImageFile'),
      editorSource.indexOf('export function WhatsAppImageAnnotationEditor'),
    );
    expect(exportCroppedImageFile).toBeTypeOf('function');
    expect(cropExportSource).toContain('context.drawImage(');
    expect(cropExportSource).toContain('imageCropPixelRect(');
    expect(cropExportSource).toContain('pixels.x');
    expect(cropExportSource).toContain('pixels.y');
    expect(cropExportSource).toContain('imageCropOutputName');
    expect(cropExportSource).not.toContain('fetch(');
    expect(cropExportSource).not.toContain('fillRect(');
  });

  it('composes a cropped PNG with the expected natural canvas dimensions and source rectangle', async () => {
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback, mimeType?: string) => {
      callback(new Blob(['cropped'], { type: mimeType ?? '' }));
    });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob,
      })),
    });

    try {
      const file = new File(['original'], 'alpha.png', { type: 'image/png' });
      const image = { naturalWidth: 800, naturalHeight: 600 } as HTMLImageElement;
      const result = await exportCroppedImageFile(file, image, {
        x: 0.25,
        y: 0.1,
        width: 0.5,
        height: 0.75,
      });

      expect(drawImage).toHaveBeenCalledWith(image, 200, 60, 400, 450, 0, 0, 400, 450);
      expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined);
      expect(result.name).toBe('alpha-recortada.png');
      expect(result.type).toBe('image/png');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('offers an optional editable caption and sends its trimmed final value', () => {
    expect(editorSource).toContain('placeholder="Adicione uma legenda (opcional)"');
    expect(editorSource).toContain('maxLength={2000}');
    expect(editorSource).toContain('value={caption}');
    expect(editorSource).toContain('setCaption(event.target.value)');
    expect(editorSource).toContain('onSend(annotatedFile, caption.trim())');
    expect(editorSource).not.toContain('onBlur={sendAnnotatedImage}');
  });

  it('routes image captions through the existing media send path without consuming composer state', () => {
    const sendStart = inboxSource.indexOf('async function sendCurrentMessage(');
    const sendEnd = inboxSource.indexOf('function cancelImageAnnotation()', sendStart);
    const sendSource = inboxSource.slice(sendStart, sendEnd);
    expect(sendSource).toContain('mediaCaptionOverride?: string');
    expect(sendSource).toContain(
      'const body = (mediaCaptionOverride ?? bodyOverride ?? selectedDraft).trim()',
    );
    expect(sendSource).toContain('caption: body');
    expect(sendSource).toContain('bodyOverride === undefined && !hasMediaCaptionOverride');
    expect(inboxSource).toContain('mediaCaptionOverride: caption');
  });

  it('supports crop enter, confirm, cancel and Escape without sending', () => {
    expect(editorSource).toContain('aria-label="Recortar imagem"');
    expect(editorSource).toContain('aria-label="Controles de recorte"');
    expect(editorSource).toContain('void confirmCrop()');
    expect(editorSource).toContain('onClick={cancelCrop}');
    expect(editorSource).toContain('if (cropModeRef.current)');
    expect(editorSource).toContain('setCropMode(false)');
    expect(editorSource).toContain('setCropRect(null)');
  });

  it('requires crop before drawing and preserves drawing after a confirmed crop', () => {
    expect(editorSource).toContain(
      "setError('Limpe ou resete o desenho antes de recortar a imagem.')",
    );
    expect(editorSource).toContain('setWorkingFile(croppedFile)');
    expect(editorSource).toContain('exportAnnotatedImageFile(');
    expect(editorSource).toContain('workingFile,');
    expect(editorSource).toContain('disabled={busy || !imageReady || cropMode}');
  });

  it('resets crop, drawing, color and caption back to the original file', () => {
    const resetStart = editorSource.indexOf('function resetEditor()');
    const resetEnd = editorSource.indexOf('function startCrop()', resetStart);
    const resetSource = editorSource.slice(resetStart, resetEnd);
    expect(resetSource).toContain('setWorkingFile(file)');
    expect(resetSource).toContain('setStrokes([])');
    expect(resetSource).toContain("setCaption('')");
    expect(resetSource).toContain('setCropMode(false)');
    expect(resetSource).toContain('setCropRect(null)');
  });

  it('guards crop and send against double activation and stale unmounted updates', () => {
    expect(editorSource).toContain('busyRef.current = true');
    expect(editorSource).toContain('if (!mountedRef.current) return');
    expect(editorSource).toContain('if (mountedRef.current) setCropping(false)');
    expect(editorSource).toContain('if (mountedRef.current) setExporting(false)');
  });

  it('keeps crop and caption usable within mobile safe-area layout', () => {
    expect(stylesSource).toContain('.conversation-image-annotation-crop-selection');
    expect(stylesSource).toContain('pointer-events: none;');
    expect(stylesSource).toContain('.conversation-image-annotation-crop-controls');
    expect(stylesSource).toContain('.conversation-image-annotation-caption textarea');
    expect(stylesSource).toContain('max-height: calc(100dvh - 310px');
    expect(stylesSource).toContain('env(safe-area-inset-left)');
    expect(stylesSource).toContain('overflow-y: auto;');
    expect(stylesSource).toContain('overscroll-behavior: contain;');
  });
});
