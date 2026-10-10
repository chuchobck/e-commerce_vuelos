// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { es } from '@/shared/i18n';
import { QrCode } from './qr-code';

afterEach(cleanup);

const pathOf = () => document.querySelector('svg path')?.getAttribute('d') ?? '';

describe('código QR de los pases', () => {
  it('mientras carga la librería deja un recuadro con el mismo nombre accesible y tamaño', () => {
    render(<QrCode value="BCBP|QD7K2M" label="Código QR del pase" size={160} />);
    const box = screen.getByRole('img', { name: 'Código QR del pase' });
    expect(box.getAttribute('aria-busy')).toBe('true');
    expect((box as HTMLElement).style.width).toBe('160px');
  });

  it('dibuja un SVG negro sobre blanco con nombre accesible, sin innerHTML', async () => {
    render(<QrCode value="BCBP|QD7K2M|PAX1|UIO-GYE" label="Código QR del pase" />);
    const svg = await screen.findByRole('img', { name: 'Código QR del pase', busy: false });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#fff');
    expect(svg.querySelector('path')?.getAttribute('fill')).toBe('#000');
    expect(pathOf().length).toBeGreaterThan(100);
  });

  it('el mismo texto da el mismo dibujo y otro texto da otro (se codifica tal cual lo da la API)', async () => {
    const { unmount } = render(<QrCode value="PASE-A" label="uno" />);
    await screen.findByRole('img', { name: 'uno', busy: false });
    const a = pathOf();
    unmount();
    const again = render(<QrCode value="PASE-A" label="uno" />);
    await screen.findByRole('img', { name: 'uno', busy: false });
    expect(pathOf()).toBe(a);
    again.unmount();
    render(<QrCode value="PASE-B" label="dos" />);
    await screen.findByRole('img', { name: 'dos', busy: false });
    expect(pathOf()).not.toBe(a);
  });

  it('un texto que no cabe en un QR se avisa en vez de dibujar algo falso', async () => {
    render(<QrCode value={'x'.repeat(6000)} label="Código demasiado largo" />);
    expect(await screen.findByText(es.aftersale.passes.codeFailed)).toBeTruthy();
    expect(document.querySelector('svg')).toBeNull();
  });
});
