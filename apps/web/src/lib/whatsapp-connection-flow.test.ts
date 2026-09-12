import { describe, expect, it, vi } from 'vitest';
import type { WhatsAppConnection } from './crm-api';
import {
  createWhatsAppQrPoller,
  shouldRequestWhatsAppQr,
  startWhatsAppConnectionFlow,
  whatsappQrStatus,
} from './whatsapp-connection-flow';

function connection(status: WhatsAppConnection['status']): WhatsAppConnection {
  return {
    id: 'connection-id',
    name: 'CRM Principal',
    provider: 'KIRAGO',
    providerUserId: 'kirago-user',
    phone: status === 'CONNECTED' ? '5544999999999' : null,
    status,
    connected: status === 'CONNECTED',
    loggedIn: status === 'CONNECTED',
    webhookConfigured: true,
    lastStatusAt: '2026-09-12T14:00:00.000Z',
    connectedAt: status === 'CONNECTED' ? '2026-09-12T14:00:00.000Z' : null,
    createdAt: '2026-09-12T13:00:00.000Z',
    updatedAt: '2026-09-12T14:00:00.000Z',
  };
}

describe('WhatsApp connection flow', () => {
  it('provisions, connects, receives QR and opens the automatic flow with no connection', async () => {
    const created = connection('DISCONNECTED');
    const connecting = connection('QR_REQUIRED');
    const createConnection = vi.fn().mockResolvedValue(created);
    const connect = vi.fn().mockResolvedValue(connecting);
    const onConnection = vi.fn();
    const onQrCode = vi.fn();
    const onStatus = vi.fn();

    const result = await startWhatsAppConnectionFlow({
      currentConnection: null,
      connectionName: ' CRM Principal ',
      createConnection,
      connect,
      getQrCode: vi.fn().mockResolvedValue({ qrCode: 'data:image/png;base64,qr' }),
      onConnection,
      onQrCode,
      onStatus,
    });

    expect(createConnection).toHaveBeenCalledWith({ name: 'CRM Principal' });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(onConnection).toHaveBeenNthCalledWith(1, created);
    expect(onConnection).toHaveBeenNthCalledWith(2, connecting);
    expect(onQrCode).toHaveBeenCalledWith('data:image/png;base64,qr');
    expect(onStatus).toHaveBeenLastCalledWith(whatsappQrStatus.waiting);
    expect(result).toEqual({ connection: connecting, provisioned: true, qrOpened: true });
  });

  it('reconnects an existing disconnected connection without reprovisioning', async () => {
    const reconnected = connection('QR_REQUIRED');
    const createConnection = vi.fn();

    const result = await startWhatsAppConnectionFlow({
      currentConnection: connection('DISCONNECTED'),
      connectionName: 'CRM Principal',
      createConnection,
      connect: vi.fn().mockResolvedValue(reconnected),
      getQrCode: vi.fn().mockResolvedValue({ qrCode: 'data:image/png;base64,qr' }),
      onConnection: vi.fn(),
      onQrCode: vi.fn(),
      onStatus: vi.fn(),
    });

    expect(createConnection).not.toHaveBeenCalled();
    expect(result).toMatchObject({ provisioned: false, qrOpened: true });
  });

  it('creates a clean new connection when the existing local connection lost its remote instance', async () => {
    const created = connection('DISCONNECTED');
    const connecting = connection('QR_REQUIRED');
    const createConnection = vi.fn().mockResolvedValue(created);

    const result = await startWhatsAppConnectionFlow({
      currentConnection: { ...connection('ERROR'), name: 'CRM Antiga' },
      connectionName: 'CRM Principal',
      createConnection,
      connect: vi.fn().mockResolvedValue(connecting),
      getQrCode: vi.fn().mockResolvedValue({ qrCode: 'data:image/png;base64,qr' }),
      onConnection: vi.fn(),
      onQrCode: vi.fn(),
      onStatus: vi.fn(),
    });

    expect(createConnection).toHaveBeenCalledWith({ name: 'CRM Antiga' });
    expect(result).toMatchObject({ provisioned: true, qrOpened: true });
  });

  it('does not request QR for an already connected connection', async () => {
    const createConnection = vi.fn();
    const connect = vi.fn();
    const getQrCode = vi.fn();

    const result = await startWhatsAppConnectionFlow({
      currentConnection: connection('CONNECTED'),
      connectionName: 'CRM Principal',
      createConnection,
      connect,
      getQrCode,
      onConnection: vi.fn(),
      onQrCode: vi.fn(),
      onStatus: vi.fn(),
    });

    expect(createConnection).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(getQrCode).not.toHaveBeenCalled();
    expect(result).toMatchObject({ provisioned: false, qrOpened: false });
  });

  it('does not request QR when the connection is already connected', () => {
    expect(shouldRequestWhatsAppQr(connection('CONNECTED'))).toBe(false);
    expect(shouldRequestWhatsAppQr(null)).toBe(true);
    expect(shouldRequestWhatsAppQr(connection('DISCONNECTED'))).toBe(true);
  });

  it('polls until DISCONNECTED becomes CONNECTED and then stops', async () => {
    let now = 0;
    const timers: Array<() => void> = [];
    const refreshStatus = vi
      .fn()
      .mockResolvedValueOnce(connection('DISCONNECTED'))
      .mockResolvedValueOnce(connection('CONNECTED'));
    const onConnected = vi.fn();
    const onStatus = vi.fn();
    const poller = createWhatsAppQrPoller({
      refreshStatus,
      fetchQrCode: vi.fn(),
      onConnection: vi.fn(),
      onQrCode: vi.fn(),
      onStatus,
      onConnected,
      onError: vi.fn(),
      now: () => now,
      schedule: (callback) => {
        timers.push(callback);
        return timers.length;
      },
      cancel: vi.fn(),
    });

    poller.start();
    poller.start();
    expect(timers).toHaveLength(1);

    timers.shift()?.();
    await Promise.resolve();
    expect(refreshStatus).toHaveBeenCalledTimes(1);
    expect(poller.isActive()).toBe(true);
    expect(timers).toHaveLength(1);

    now = 2500;
    timers.shift()?.();
    await Promise.resolve();
    expect(refreshStatus).toHaveBeenCalledTimes(2);
    expect(onConnected).toHaveBeenCalledWith(expect.objectContaining({ status: 'CONNECTED' }));
    expect(onStatus).toHaveBeenLastCalledWith(whatsappQrStatus.connected);
    expect(poller.isActive()).toBe(false);
    expect(timers).toHaveLength(0);
  });

  it('stops polling when the modal is closed', () => {
    const cancel = vi.fn();
    const poller = createWhatsAppQrPoller({
      refreshStatus: vi.fn(),
      fetchQrCode: vi.fn(),
      onConnection: vi.fn(),
      onQrCode: vi.fn(),
      onStatus: vi.fn(),
      onConnected: vi.fn(),
      onError: vi.fn(),
      schedule: vi.fn(() => 1),
      cancel,
    });

    poller.start();
    poller.stop();

    expect(poller.isActive()).toBe(false);
    expect(cancel).toHaveBeenCalledWith(1);
  });

  it('renews an expired QR code without creating a new connection', async () => {
    let now = 0;
    const timers: Array<() => void> = [];
    const fetchQrCode = vi.fn().mockResolvedValue('data:image/png;base64,next');
    const onQrCode = vi.fn();
    const onStatus = vi.fn();
    const poller = createWhatsAppQrPoller({
      refreshStatus: vi.fn().mockResolvedValue(connection('QR_REQUIRED')),
      fetchQrCode,
      onConnection: vi.fn(),
      onQrCode,
      onStatus,
      onConnected: vi.fn(),
      onError: vi.fn(),
      qrRenewAfterMs: 1000,
      now: () => now,
      schedule: (callback) => {
        timers.push(callback);
        return timers.length;
      },
      cancel: vi.fn(),
    });

    poller.start();
    now = 1000;
    timers.shift()?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchQrCode).toHaveBeenCalledTimes(1);
    expect(onQrCode).toHaveBeenCalledWith('data:image/png;base64,next');
    expect(onStatus).toHaveBeenCalledWith(whatsappQrStatus.expired);
  });

  it('reports API errors and stops polling', async () => {
    const onError = vi.fn();
    const timers: Array<() => void> = [];
    const poller = createWhatsAppQrPoller({
      refreshStatus: vi.fn().mockRejectedValue(new Error('Falha de API')),
      fetchQrCode: vi.fn(),
      onConnection: vi.fn(),
      onQrCode: vi.fn(),
      onStatus: vi.fn(),
      onConnected: vi.fn(),
      onError,
      schedule: (callback) => {
        timers.push(callback);
        return timers.length;
      },
      cancel: vi.fn(),
    });

    poller.start();
    timers.shift()?.();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith('Falha de API');
    expect(poller.isActive()).toBe(false);
  });
});
