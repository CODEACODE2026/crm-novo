import type { WhatsAppConnection } from './crm-api';

export const whatsappQrStatus = {
  preparing: 'Preparando conexão...',
  waiting: 'Aguardando leitura do QR Code...',
  connecting: 'Conectando ao WhatsApp...',
  connected: 'WhatsApp conectado com sucesso.',
  expired: 'QR Code expirado. Gerando um novo...',
  timeout: 'Tempo limite da conexão atingido. Tente novamente.',
} as const;

export const defaultWhatsAppQrPolling = {
  intervalMs: 2500,
  qrRenewAfterMs: 45000,
  timeoutMs: 120000,
  maxQrRenewAttempts: 3,
} as const;

type TimerId = number | ReturnType<typeof setTimeout>;

export interface WhatsAppQrPollerOptions {
  refreshStatus: () => Promise<WhatsAppConnection>;
  fetchQrCode: () => Promise<string>;
  onConnection: (connection: WhatsAppConnection) => void;
  onQrCode: (qrCode: string) => void;
  onStatus: (status: string) => void;
  onConnected: (connection: WhatsAppConnection) => void;
  onError: (message: string) => void;
  intervalMs?: number;
  qrRenewAfterMs?: number;
  timeoutMs?: number;
  maxQrRenewAttempts?: number;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => TimerId;
  cancel?: (timer: TimerId) => void;
}

export interface WhatsAppQrPoller {
  start: () => void;
  stop: () => void;
  isActive: () => boolean;
}

export interface StartWhatsAppConnectionFlowOptions {
  currentConnection: WhatsAppConnection | null;
  connectionName: string;
  createConnection: (payload: { name: string }) => Promise<WhatsAppConnection>;
  connect: () => Promise<WhatsAppConnection>;
  getQrCode: () => Promise<{ qrCode: string }>;
  onConnection: (connection: WhatsAppConnection) => void;
  onQrCode: (qrCode: string) => void;
  onStatus: (status: string) => void;
}

export interface StartWhatsAppConnectionFlowResult {
  connection: WhatsAppConnection;
  provisioned: boolean;
  qrOpened: boolean;
}

export async function startWhatsAppConnectionFlow({
  currentConnection,
  connectionName,
  createConnection,
  connect,
  getQrCode,
  onConnection,
  onQrCode,
  onStatus,
}: StartWhatsAppConnectionFlowOptions): Promise<StartWhatsAppConnectionFlowResult> {
  let connection = currentConnection;
  let provisioned = false;

  onStatus(whatsappQrStatus.preparing);

  if (!connection) {
    connection = await createConnection({ name: connectionName.trim() || 'CRM Principal' });
    provisioned = true;
    onConnection(connection);
  }

  if (connection.status === 'CONNECTED') {
    onStatus(whatsappQrStatus.connected);
    return { connection, provisioned, qrOpened: false };
  }

  connection = await connect();
  onConnection(connection);

  if (connection.status === 'CONNECTED') {
    onStatus(whatsappQrStatus.connected);
    return { connection, provisioned, qrOpened: false };
  }

  const payload = await getQrCode();
  onQrCode(payload.qrCode);
  onStatus(whatsappQrStatus.waiting);

  return { connection, provisioned, qrOpened: true };
}

export function createWhatsAppQrPoller(options: WhatsAppQrPollerOptions): WhatsAppQrPoller {
  const intervalMs = options.intervalMs ?? defaultWhatsAppQrPolling.intervalMs;
  const qrRenewAfterMs = options.qrRenewAfterMs ?? defaultWhatsAppQrPolling.qrRenewAfterMs;
  const timeoutMs = options.timeoutMs ?? defaultWhatsAppQrPolling.timeoutMs;
  const maxQrRenewAttempts =
    options.maxQrRenewAttempts ?? defaultWhatsAppQrPolling.maxQrRenewAttempts;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;

  let active = false;
  let timer: TimerId | null = null;
  let inFlight = false;
  let startedAt = 0;
  let qrIssuedAt = 0;
  let qrRenewAttempts = 0;

  function stop() {
    active = false;

    if (timer) {
      cancel(timer);
      timer = null;
    }
  }

  function queue(delay = intervalMs) {
    if (!active || timer) return;

    timer = schedule(() => {
      timer = null;
      void tick();
    }, delay);
  }

  async function renewQrCode() {
    options.onStatus(whatsappQrStatus.expired);
    qrRenewAttempts += 1;

    const qrCode = await options.fetchQrCode();
    qrIssuedAt = now();
    options.onQrCode(qrCode);
    options.onStatus(whatsappQrStatus.waiting);
  }

  async function tick() {
    if (!active || inFlight) return;

    inFlight = true;
    options.onStatus(whatsappQrStatus.connecting);

    try {
      const connection = await options.refreshStatus();
      options.onConnection(connection);

      if (connection.status === 'CONNECTED') {
        options.onStatus(whatsappQrStatus.connected);
        stop();
        options.onConnected(connection);
        return;
      }

      const elapsedMs = now() - startedAt;

      if (elapsedMs >= timeoutMs) {
        options.onStatus(whatsappQrStatus.timeout);
        stop();
        options.onError(whatsappQrStatus.timeout);
        return;
      }

      if (now() - qrIssuedAt >= qrRenewAfterMs) {
        if (qrRenewAttempts >= maxQrRenewAttempts) {
          options.onStatus(whatsappQrStatus.timeout);
          stop();
          options.onError(whatsappQrStatus.timeout);
          return;
        }

        await renewQrCode();
      } else {
        options.onStatus(whatsappQrStatus.waiting);
      }

      queue();
    } catch (error) {
      stop();
      options.onError(
        error instanceof Error ? error.message : 'Nao foi possivel conectar WhatsApp.',
      );
    } finally {
      inFlight = false;
    }
  }

  return {
    start() {
      if (active) return;

      active = true;
      startedAt = now();
      qrIssuedAt = startedAt;
      qrRenewAttempts = 0;
      options.onStatus(whatsappQrStatus.waiting);
      queue();
    },
    stop,
    isActive() {
      return active;
    },
  };
}

export function shouldRequestWhatsAppQr(connection: WhatsAppConnection | null) {
  return connection?.status !== 'CONNECTED';
}
