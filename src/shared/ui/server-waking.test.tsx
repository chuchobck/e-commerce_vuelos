// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient, SLOW_AFTER_MS } from '@/shared/api/http/client';
import { es } from '@/shared/i18n';
import { ServerWakingNotice } from './server-waking';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('aviso de servidor despertando', () => {
  it('aparece en una región aria-live polite si la petición tarda más de 3 s, y se va al responder', async () => {
    vi.useFakeTimers();
    let answer!: (r: Response) => void;
    const slowFetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
    const http = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: slowFetch as unknown as typeof fetch });

    const { container } = render(<ServerWakingNotice />);
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();

    const pending = http.request('POST', '/search', { body: {} });
    await act(async () => vi.advanceTimersByTime(SLOW_AFTER_MS - 1));
    expect(screen.queryByText(es.errors.waking)).toBeNull();

    await act(async () => vi.advanceTimersByTime(2));
    expect(region!.textContent).toContain(es.errors.waking);

    await act(async () => {
      answer(new Response('{}', { status: 200 }));
      await pending;
    });
    expect(screen.queryByText(es.errors.waking)).toBeNull();
  });
});
