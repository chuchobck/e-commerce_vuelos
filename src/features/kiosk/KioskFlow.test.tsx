// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardingPass, CheckInResult, KioskFlight, KioskSession, KioskWindow } from '@/shared/api';
import { ApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';

const api = vi.hoisted(() => ({ kioskLookup: vi.fn(), kioskCheckIn: vi.fn(), kioskBoardingPasses: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));

import { KioskFlow } from './KioskFlow';
import { IDLE_MS, IDLE_WARNING_SECONDS } from './useIdleReset';

const t = es.kiosk;
const TOKEN = 'tok-secreto-del-kiosko-123';
const BOOKING_ID = 'booking-id-interno-777';
const PNR = 'ABC123';
const LAST_NAME = 'Pérez';

function flight(window: KioskWindow, checkedIn = false, extra: Partial<KioskFlight> = {}): KioskFlight {
  return {
    segmentId: 's1',
    flightNumber: 'LA1400',
    origin: 'UIO',
    destination: 'GYE',
    departureAt: '2026-11-12T06:30:00-05:00',
    arrivalAt: '2026-11-12T07:25:00-05:00',
    departureTerminal: null,
    status: 'SCHEDULED',
    checkIn: { window, opensAt: '2026-11-14T06:30:00-05:00', closesAt: '2026-11-12T05:30:00-05:00' },
    passengers: [{ passengerId: 'p1', seat: '14C', checkInStatus: checkedIn ? 'CHECKED_IN' : 'NOT_CHECKED_IN' }],
    ...extra,
  };
}

function session(flights: KioskFlight[]): KioskSession {
  return {
    token: TOKEN,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    booking: { id: BOOKING_ID, status: 'CONFIRMED', passengers: [{ id: 'p1', type: 'ADULT', firstName: 'Ana', lastName: 'Pérez' }], flights },
  };
}

const PASS: BoardingPass = { passengerId: 'p1', segmentId: 's1', seat: '14C', boardingGroup: 'B', boardingPosition: '22', barcode: 'M1PEREZ/ANA ABC123 UIOGYE LA1400 14C', barcodeType: 'QR' };
const CHECK_IN: CheckInResult = { bookingId: BOOKING_ID, status: 'COMPLETED', passengers: [{ passengerId: 'p1', status: 'CHECKED_IN', segments: [{ segmentId: 's1', seat: '14C', status: 'CHECKED_IN' }] }] };

function renderFlow() {
  return render(<KioskFlow renderPass={({ pass, passengerName }) => <p>{`pase ${passengerName} ${pass.seat} ${pass.barcode}`}</p>} />);
}

async function fillAndSubmit(pnr = 'abc123', lastName = LAST_NAME) {
  fireEvent.change(screen.getByLabelText(new RegExp(t.identify.pnr)), { target: { value: pnr } });
  fireEvent.change(screen.getByLabelText(new RegExp(t.identify.lastName)), { target: { value: lastName } });
  fireEvent.click(screen.getByRole('button', { name: t.identify.submit }));
}

const consoleSpies = () => (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));

beforeEach(() => {
  api.kioskLookup.mockReset();
  api.kioskCheckIn.mockReset();
  api.kioskBoardingPasses.mockReset();
  window.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('kiosko: paso 1, identificación', () => {
  it('el botón espera datos válidos, el código se pasa a mayúsculas y la búsqueda lleva código y apellido', async () => {
    api.kioskLookup.mockResolvedValue(session([flight('OPEN')]));
    renderFlow();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.identify.heading);
    const submit = screen.getByRole('button', { name: t.identify.submit });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(new RegExp(t.identify.pnr)), { target: { value: 'ab-c 12' } });
    expect((screen.getByLabelText(new RegExp(t.identify.pnr)) as HTMLInputElement).value).toBe('ABC12');
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await fillAndSubmit();
    await screen.findByRole('heading', { level: 1, name: t.booking.heading });
    expect(api.kioskLookup).toHaveBeenCalledWith(PNR, LAST_NAME);
  });
});

describe('kiosko: paso 2, la reserva según la ventana de cada vuelo', () => {
  async function open(flights: KioskFlight[]) {
    api.kioskLookup.mockResolvedValue(session(flights));
    renderFlow();
    await fillAndSubmit();
    await screen.findByRole('heading', { level: 1, name: t.booking.heading });
  }

  it('OPEN: muestra vuelo, ruta, hora local, asiento y estado, y ofrece «Hacer check-in»', async () => {
    await open([flight('OPEN')]);
    expect(screen.getByText(fmt(t.booking.flight, { flight: 'LA1400' }))).toBeTruthy();
    expect(screen.getByText(fmt(t.booking.route, { origin: 'UIO', destination: 'GYE' }))).toBeTruthy();
    expect(screen.getByText(/a las 06:30/)).toBeTruthy();
    expect(screen.getByText(fmt(t.booking.seat, { seat: '14C' }))).toBeTruthy();
    expect(screen.getByText(t.booking.checkInStatus.NOT_CHECKED_IN)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.booking.checkIn })).toBeTruthy();
  });

  it('NOT_YET_OPEN: dice cuándo abre y no ofrece el check-in', async () => {
    await open([flight('NOT_YET_OPEN')]);
    expect(screen.getByText(/El check-in abre el .* a las 06:30\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.booking.checkIn })).toBeNull();
  });

  it('CLOSED: dice que ya cerró y no ofrece el check-in', async () => {
    await open([flight('CLOSED')]);
    expect(screen.getByText(t.booking.windowClosed)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.booking.checkIn })).toBeNull();
  });

  it('un vuelo ya registrado muestra directamente «Ver pases»', async () => {
    await open([flight('CLOSED', true)]);
    expect(screen.getByRole('button', { name: t.booking.viewPasses })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.booking.checkIn })).toBeNull();
    expect(screen.getByText(t.booking.checkInStatus.CHECKED_IN)).toBeTruthy();
  });

  it('un pasajero con check-in fallido lo dice con texto', async () => {
    const f = flight('OPEN');
    f.passengers = [{ passengerId: 'p1', seat: null, checkInStatus: 'FAILED' }];
    await open([f]);
    expect(screen.getByText(t.booking.checkInStatus.FAILED)).toBeTruthy();
    expect(screen.getByText(t.booking.noSeat)).toBeTruthy();
  });
});

describe('kiosko: paso 3, pases', () => {
  it('check-in → pases con asiento y código, y «Terminar» borra todo y vuelve al paso 1', async () => {
    api.kioskLookup.mockResolvedValue(session([flight('OPEN')]));
    api.kioskCheckIn.mockResolvedValue(CHECK_IN);
    api.kioskBoardingPasses.mockResolvedValue([PASS]);
    renderFlow();
    await fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: t.booking.checkIn }));
    await screen.findByRole('heading', { level: 1, name: t.passes.heading });
    expect(api.kioskCheckIn).toHaveBeenCalledWith(BOOKING_ID, TOKEN);
    expect(api.kioskBoardingPasses).toHaveBeenCalledWith(BOOKING_ID, TOKEN);
    expect(screen.getByText(`pase Ana Pérez 14C ${PASS.barcode}`)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.passes.print })).toBeTruthy();
    // El foco está en el h1 del nuevo paso.
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));

    fireEvent.click(screen.getAllByRole('button', { name: t.passes.finish })[0]);
    await screen.findByRole('heading', { level: 1, name: t.identify.heading });
    expect((screen.getByLabelText(new RegExp(t.identify.pnr)) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(new RegExp(t.identify.lastName)) as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/Ana Pérez/)).toBeNull();
  });

  it('«Imprimir» llama a window.print()', async () => {
    api.kioskLookup.mockResolvedValue(session([flight('CLOSED', true)]));
    api.kioskBoardingPasses.mockResolvedValue([PASS]);
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderFlow();
    await fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: t.booking.viewPasses }));
    fireEvent.click(await screen.findByRole('button', { name: t.passes.print }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('el botón de imprimir y los demás controles quedan fuera de la hoja impresa', async () => {
    api.kioskLookup.mockResolvedValue(session([flight('CLOSED', true)]));
    api.kioskBoardingPasses.mockResolvedValue([PASS]);
    renderFlow();
    await fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: t.booking.viewPasses }));
    const print = await screen.findByRole('button', { name: t.passes.print });
    expect(print.closest('.print\\:hidden')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).closest('.print\\:hidden')).not.toBeNull();
  });
});

describe('kiosko: errores', () => {
  const err = (status: number, code?: string, retryAfter?: number) => new ApiError({ status, code: code as never, detail: 'DETALLE TÉCNICO SECRETO', retryAfter });

  it('404: siempre el mismo mensaje, sin revelar qué falló ni mostrar el detalle', async () => {
    api.kioskLookup.mockRejectedValue(err(404, 'VALIDATION_FAILED'));
    renderFlow();
    await fillAndSubmit();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(t.errors.notFound);
    expect(document.body.textContent).not.toContain('DETALLE TÉCNICO');
    // Lo escrito se conserva para corregirlo.
    expect((screen.getByLabelText(new RegExp(t.identify.lastName)) as HTMLInputElement).value).toBe(LAST_NAME);
  });

  it('429: «Demasiados intentos, espera un minuto»', async () => {
    api.kioskLookup.mockRejectedValue(err(429, undefined, 60));
    renderFlow();
    await fillAndSubmit();
    expect((await screen.findByRole('alert')).textContent).toBe(t.errors.rateLimited);
  });

  it('409 CHECK_IN_NOT_AVAILABLE en el check-in: lo explica y se queda en la reserva', async () => {
    api.kioskLookup.mockResolvedValue(session([flight('OPEN')]));
    api.kioskCheckIn.mockRejectedValue(err(409, 'CHECK_IN_NOT_AVAILABLE'));
    renderFlow();
    await fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: t.booking.checkIn }));
    expect((await screen.findByRole('alert')).textContent).toBe(t.errors.checkInNotAvailable);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.booking.heading);
  });

  it('401 KIOSK_SESSION_INVALID: la sesión venció, se borra todo y se vuelve al paso 1', async () => {
    api.kioskLookup.mockResolvedValue(session([flight('OPEN')]));
    api.kioskCheckIn.mockRejectedValue(err(401, 'KIOSK_SESSION_INVALID'));
    renderFlow();
    await fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: t.booking.checkIn }));
    await screen.findByRole('heading', { level: 1, name: t.identify.heading });
    expect(screen.getByText(t.errors.sessionExpired)).toBeTruthy();
    expect(screen.queryByText(/LA1400/)).toBeNull();
  });
});

describe('kiosko: inactividad', () => {
  async function toBooking() {
    api.kioskLookup.mockResolvedValue(session([flight('OPEN')]));
    renderFlow();
    await fillAndSubmit();
    // Con timers falsos `findBy*` no avanza solo: se vacían las promesas a mano.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.booking.heading);
  }

  it('a los 60 s avisa con cuenta regresiva de 15 s y al llegar a cero borra todo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    await toBooking();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() => void vi.advanceTimersByTime(IDLE_MS));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(t.idle.title)).toBeTruthy();
    expect(within(dialog).getByText(String(IDLE_WARNING_SECONDS))).toBeTruthy();
    act(() => void vi.advanceTimersByTime(5_000));
    expect(within(dialog).getByText(String(IDLE_WARNING_SECONDS - 5))).toBeTruthy();
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.identify.heading);
    expect(screen.getByText(t.idleNotice)).toBeTruthy();
    expect(screen.queryByText(/LA1400/)).toBeNull();
  });

  it('cualquier interacción cancela el aviso y reinicia la cuenta', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    await toBooking();
    act(() => void vi.advanceTimersByTime(IDLE_MS + 3_000));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    act(() => void fireEvent.pointerDown(window));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() => void vi.advanceTimersByTime(IDLE_MS - 1_000));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.booking.heading);
  });

  it('con el formulario vacío no se avisa a nadie', () => {
    vi.useFakeTimers();
    renderFlow();
    act(() => void vi.advanceTimersByTime(IDLE_MS + 20_000));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('el token vence a los 10 minutos: se borra todo aunque haya actividad', async () => {
    vi.useFakeTimers();
    await toBooking();
    // Con actividad cada 30 s la inactividad nunca salta; lo que reinicia es el vencimiento del token.
    for (let i = 0; i < 20; i += 1) {
      act(() => void vi.advanceTimersByTime(30_000));
      if (!screen.queryByRole('heading', { level: 1, name: t.booking.heading })) break;
      act(() => void fireEvent.pointerDown(window));
    }
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.identify.heading);
    expect(screen.getByText(t.expiredNotice)).toBeTruthy();
  });
});

describe('kiosko: privacidad de la sesión', () => {
  it('ni el token, ni el código, ni el apellido, ni el identificador salen en almacenamiento, console ni URL', async () => {
    const spies = consoleSpies();
    api.kioskLookup.mockResolvedValue(session([flight('OPEN')]));
    api.kioskCheckIn.mockResolvedValue(CHECK_IN);
    api.kioskBoardingPasses.mockResolvedValue([PASS]);
    renderFlow();
    await fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: t.booking.checkIn }));
    await screen.findByRole('heading', { level: 1, name: t.passes.heading });

    const secrets = [TOKEN, BOOKING_ID, PNR, LAST_NAME, 'Pérez'];
    const stored = JSON.stringify([{ ...localStorage }, { ...sessionStorage }]) + document.cookie + window.location.href;
    for (const secret of secrets) expect(stored).not.toContain(secret);
    expect(localStorage.length + sessionStorage.length).toBe(0);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    await waitFor(() => expect(document.body.textContent).not.toContain(TOKEN));
    expect(document.body.innerHTML).not.toContain(BOOKING_ID);
  });

  it('ni siquiera un error de la API deja rastro en la consola ni en el mensaje', async () => {
    const spies = consoleSpies();
    api.kioskLookup.mockRejectedValue(new ApiError({ status: 404, detail: `Booking ${PNR} / ${LAST_NAME} not found` }));
    renderFlow();
    await fillAndSubmit();
    await screen.findByRole('alert');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).not.toContain(PNR);
  });
});
