import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  formatAttendanceAnalyticsDuration,
  formatAttendanceAnalyticsPercentage,
} from '../../components/whatsapp/WhatsAppAttendanceAnalytics';

const currentDir = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(
  join(currentDir, '../../components/whatsapp/WhatsAppAttendanceAnalytics.tsx'),
  'utf8',
);
const pageSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const apiSource = readFileSync(join(currentDir, '../../lib/crm-api.ts'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');

describe('ATENDIMENTO2 analytics UI', () => {
  it('formats durations without deceptive rounding', () => {
    expect(formatAttendanceAnalyticsDuration(45)).toBe('45s');
    expect(formatAttendanceAnalyticsDuration(134)).toBe('2m 14s');
    expect(formatAttendanceAnalyticsDuration(4080)).toBe('1h 08m');
    expect(formatAttendanceAnalyticsDuration(183600)).toBe('2d 3h');
  });

  it('formats integer and decimal resolution rates', () => {
    expect(formatAttendanceAnalyticsPercentage(0)).toBe('0%');
    expect(formatAttendanceAnalyticsPercentage(85)).toBe('85%');
    expect(formatAttendanceAnalyticsPercentage(83.3)).toBe('83.3%');
  });

  it('adds a dedicated authenticated navigation view and API filters', () => {
    expect(pageSource).toContain("| 'attendances'");
    expect(pageSource).toContain("{ id: 'attendances', label: 'Atendimentos'");
    expect(pageSource).toContain("view === 'attendances'");
    expect(pageSource).toContain('<WhatsAppAttendanceAnalyticsView');
    expect(apiSource).toContain('/whatsapp/attendances/analytics');
    expect(apiSource).toContain("params.set('connectionId'");
    expect(apiSource).toContain("params.set('categoryId'");
    expect(apiSource).toContain("params.set('status'");
  });

  it('covers all summary KPIs and message totals', () => {
    for (const label of [
      'Abertos',
      'Pendentes',
      'Em atendimento',
      'Resolvidos',
      'Primeira resposta média',
      'Resolução média',
      'Taxa de resolução',
      'Resolvidos hoje',
      'Mensagens recebidas',
      'Respostas manuais',
    ]) {
      expect(componentSource).toContain(label);
    }
    expect(componentSource).toContain(
      'Indicadores de status consideram atendimentos abertos no período selecionado.',
    );
    expect(componentSource).toContain('Estado atual · sem limite do período');
  });

  it('provides period, connection, category and status filters', () => {
    expect(componentSource).toContain("'today'");
    expect(componentSource).toContain("'seven'");
    expect(componentSource).toContain("'thirty'");
    expect(componentSource).toContain("'month'");
    expect(componentSource).toContain("'custom'");
    expect(componentSource).toContain('listWhatsAppConnections');
    expect(componentSource).toContain('listWhatsAppAttendanceCategories');
    expect(componentSource).toContain('<option value="PENDING">');
    expect(componentSource).toContain('<option value="IN_PROGRESS">');
    expect(componentSource).toContain('<option value="RESOLVED">');
  });

  it('renders volume, status, categories, hourly, weekday and operational sections', () => {
    for (const section of [
      'Atendimentos por período',
      'Distribuição por status',
      'Categorias mais frequentes',
      'Horários de maior movimento',
      'Volume por dia da semana',
      'Clientes que mais solicitam atendimento',
      'Aguardando primeira resposta',
      'Atendimentos abertos mais antigos',
    ]) {
      expect(componentSource).toContain(section);
    }
    expect(componentSource).toContain('onOpenClient(item.clientId)');
  });

  it('has explicit loading, error, retry and empty states', () => {
    expect(componentSource).toContain('<AttendanceAnalyticsSkeleton />');
    expect(componentSource).toContain('attendance-analytics-error');
    expect(componentSource).toContain('Tentar novamente');
    expect(componentSource).toContain('Ainda não há atendimentos no período selecionado.');
    expect(componentSource).not.toMatch(/resolutionNote|message\.text|rawMetadata/);
  });

  it('uses responsive two-column mobile cards and collapses safely at 390px', () => {
    expect(stylesSource).toContain('.attendance-kpi-grid');
    expect(stylesSource).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(stylesSource).toContain('@media (max-width: 390px)');
    expect(stylesSource).toContain('grid-template-columns: 1fr');
  });
});
