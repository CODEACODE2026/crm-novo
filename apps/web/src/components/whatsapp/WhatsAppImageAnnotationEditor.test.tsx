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
  imageAnnotationCanvasBytes,
  imageAnnotationLineWidth,
  imageAnnotationOutputName,
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

  it('uses captured Pointer Events for mouse, touch and pen drawing', () => {
    expect(editorSource).toContain('setPointerCapture(event.pointerId)');
    expect(editorSource).toContain('onPointerDown={startStroke}');
    expect(editorSource).toContain('onPointerMove={continueStroke}');
    expect(editorSource).toContain('onPointerCancel={finishStroke}');
    expect(editorSource).toContain('onLostPointerCapture={finishStroke}');
    expect(stylesSource).toMatch(
      /\.conversation-image-annotation-canvas \{[\s\S]*?touch-action: none;/,
    );
  });

  it('provides pencil, color, undo, clear and reset controls', () => {
    expect(editorSource).toContain('aria-label="Lápis selecionado"');
    expect(editorSource).toContain('aria-label={`Usar cor ${option.label}`}');
    expect(editorSource).toContain('aria-label="Desfazer último traço"');
    expect(editorSource).toContain('setStrokes(undoImageAnnotationStroke)');
    expect(editorSource).toContain('aria-label="Limpar todas as anotações"');
    expect(editorSource).toContain('aria-label="Resetar desenho"');
    expect(editorSource).toContain('setColor(imageAnnotationColors[0].value)');
  });

  it('opens a portal dialog, locks body scroll, handles Escape and cleans resources', () => {
    expect(editorSource).toContain('createPortal(');
    expect(editorSource).toContain('aria-modal="true"');
    expect(editorSource).toContain('role="dialog"');
    expect(editorSource).toContain("document.body.style.overflow = 'hidden'");
    expect(editorSource).toContain('document.body.style.overflow = previousOverflow');
    expect(editorSource).toContain("event.key !== 'Escape'");
    expect(editorSource).toContain('URL.revokeObjectURL(objectUrl)');
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
    const sendStart = inboxSource.indexOf('async function sendAnnotatedImage(file: File)');
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
    expect(editorSource).toContain('if (!image || busyRef.current) return;');
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
    expect(editorSource).toContain('mountedRef.current = false');
    expect(editorSource).toContain('if (mountedRef.current) setExporting(false)');
  });

  it('keeps mobile and desktop controls accessible inside safe viewport bounds', () => {
    expect(stylesSource).toContain('.conversation-image-annotation-editor');
    expect(stylesSource).toContain('min-height: 100dvh;');
    expect(stylesSource).toContain('env(safe-area-inset-top)');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toMatch(
      /\.conversation-image-annotation-toolbar button \{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/,
    );
    expect(editorSource).toContain('aria-label="Cancelar edição da imagem"');
    expect(editorSource).toContain('aria-label="Enviar imagem anotada"');
    expect(stylesSource).toContain('outline: 3px solid #38bdf8;');
  });
});
