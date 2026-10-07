import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Request, Response } from 'express';

export type WhatsAppRealtimeEventType =
  'conversation.updated' | 'message.created' | 'message.updated';

export interface WhatsAppRealtimeEvent {
  type: WhatsAppRealtimeEventType;
  conversationId: string;
  messageId?: string;
  occurredAt: string;
}

interface WhatsAppRealtimeSubscriber {
  id: number;
  response: Response;
  heartbeat: NodeJS.Timeout;
}

@Injectable()
export class WhatsAppRealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppRealtimeService.name);
  private readonly subscribers = new Map<number, WhatsAppRealtimeSubscriber>();
  private nextSubscriberId = 1;

  subscribe(request: Request, response: Response) {
    const subscriberId = this.nextSubscriberId++;

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
    response.write('retry: 5000\n\n');

    const heartbeat = setInterval(() => {
      this.writePing(subscriberId);
    }, 25000);

    this.subscribers.set(subscriberId, {
      id: subscriberId,
      response,
      heartbeat,
    });

    this.logger.log(`SSE connected subscriber=${subscriberId} count=${this.subscribers.size}`);

    const cleanup = () => this.unsubscribe(subscriberId);
    request.on('close', cleanup);
    request.on('aborted', cleanup);
    response.on('close', cleanup);

    return subscriberId;
  }

  emitConversationUpdated(conversationId: string) {
    this.emit({
      type: 'conversation.updated',
      conversationId,
      occurredAt: new Date().toISOString(),
    });
  }

  emitMessageCreated(conversationId: string, messageId: string) {
    this.emit({
      type: 'message.created',
      conversationId,
      messageId,
      occurredAt: new Date().toISOString(),
    });
  }

  emitMessageUpdated(conversationId: string, messageId: string) {
    this.emit({
      type: 'message.updated',
      conversationId,
      messageId,
      occurredAt: new Date().toISOString(),
    });
  }

  emit(event: WhatsAppRealtimeEvent) {
    for (const subscriberId of this.subscribers.keys()) {
      this.write(subscriberId, event.type, event);
    }
  }

  subscriberCount() {
    return this.subscribers.size;
  }

  onModuleDestroy() {
    for (const subscriberId of this.subscribers.keys()) {
      this.unsubscribe(subscriberId);
    }
  }

  private write(subscriberId: number, eventName: string, event: WhatsAppRealtimeEvent) {
    const subscriber = this.subscribers.get(subscriberId);

    if (!subscriber) {
      return;
    }

    try {
      subscriber.response.write(`event: ${eventName}\n`);
      subscriber.response.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (error) {
      this.logger.warn(
        `SSE write failed subscriber=${subscriberId} count=${this.subscribers.size} message=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      this.unsubscribe(subscriberId);
    }
  }

  private writePing(subscriberId: number) {
    const subscriber = this.subscribers.get(subscriberId);

    if (!subscriber) {
      return;
    }

    try {
      subscriber.response.write('event: ping\n');
      subscriber.response.write('data: {}\n\n');
    } catch (error) {
      this.logger.warn(
        `SSE ping failed subscriber=${subscriberId} count=${this.subscribers.size} message=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      this.unsubscribe(subscriberId);
    }
  }

  private unsubscribe(subscriberId: number) {
    const subscriber = this.subscribers.get(subscriberId);

    if (!subscriber) {
      return;
    }

    clearInterval(subscriber.heartbeat);
    this.subscribers.delete(subscriberId);
    this.logger.log(`SSE disconnected subscriber=${subscriberId} count=${this.subscribers.size}`);
  }
}
