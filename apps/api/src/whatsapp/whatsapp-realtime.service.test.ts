import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { WhatsAppRealtimeService } from './whatsapp-realtime.service';

function sseClient() {
  const request = new EventEmitter();
  const response = Object.assign(new EventEmitter(), {
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
  });

  return { request, response };
}

describe('WhatsAppRealtimeService', () => {
  it('connects an SSE subscriber with safe headers and removes it on disconnect', () => {
    const service = new WhatsAppRealtimeService();
    const { request, response } = sseClient();

    service.subscribe(request as never, response as never);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
    expect(response.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(service.subscriberCount()).toBe(1);

    request.emit('close');

    expect(service.subscriberCount()).toBe(0);
  });

  it('broadcasts minimal message and conversation events to multiple subscribers', () => {
    const service = new WhatsAppRealtimeService();
    const first = sseClient();
    const second = sseClient();

    service.subscribe(first.request as never, first.response as never);
    service.subscribe(second.request as never, second.response as never);
    service.emitMessageCreated('conversation-1', 'message-1');

    for (const client of [first, second]) {
      const writes = client.response.write.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(writes).toContain('event: message.created');
      expect(writes).toContain('"conversationId":"conversation-1"');
      expect(writes).toContain('"messageId":"message-1"');
      expect(writes).not.toContain('phone');
      expect(writes).not.toContain('text');
      expect(writes).not.toContain('media');
    }
  });

  it('sends heartbeat pings without message payload data', () => {
    vi.useFakeTimers();
    const service = new WhatsAppRealtimeService();
    const { request, response } = sseClient();

    service.subscribe(request as never, response as never);
    vi.advanceTimersByTime(25000);

    const writes = response.write.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(writes).toContain('event: ping');
    expect(writes).toContain('data: {}');
    expect(writes).not.toContain('conversationId');

    service.onModuleDestroy();
    vi.useRealTimers();
  });
});
