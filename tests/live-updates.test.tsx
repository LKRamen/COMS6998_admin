// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import LiveUpdates from '../app/components/live-updates';
const mocks = vi.hoisted(() => ({ path: '/', refresh: vi.fn(), remove: vi.fn(), receive: (_: unknown) => {}, subscribe: (_: string) => {} }));
const router = { refresh: mocks.refresh };
vi.mock('next/navigation', () => ({ usePathname: () => mocks.path, useRouter: () => router }));
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({
  channel: () => { const channel = {
    on: (_: unknown, __: unknown, fn: typeof mocks.receive) => { mocks.receive = fn; return channel; },
    subscribe: (fn: typeof mocks.subscribe) => { mocks.subscribe = fn; return channel; },
  }; return channel; },
  removeChannel: mocks.remove,
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { revision: 1 }, error: null }) }) }) }),
}) }));
beforeEach(() => { vi.useFakeTimers(); mocks.path='/'; mocks.refresh.mockClear(); mocks.remove.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function change(revision=2) { await act(async () => { mocks.receive({new:{revision}}); vi.advanceTimersByTime(800); }); }
it('coalesces a burst into one dashboard refresh', async () => {
  render(<LiveUpdates initialRevision="1" />);
  await act(async () => { mocks.receive({new:{revision:2}}); mocks.receive({new:{revision:3}}); vi.advanceTimersByTime(800); });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  await change(3); expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
it('keeps library cards in place until Show updates is clicked', async () => {
  mocks.path='/media'; render(<LiveUpdates initialRevision="1" />); await change();
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Show updates'}));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
it('never refreshes an editing screen or replaces unsaved input', async () => {
  mocks.path='/pipelines/example'; render(<LiveUpdates initialRevision="1" />); await change();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.getByText(/Save your edits/)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
it('refreshes generation status and cleans up its channel', async () => {
  mocks.path='/catalog/generation_requests'; const view=render(<LiveUpdates initialRevision="1" />); await change();
  expect(mocks.refresh).toHaveBeenCalledTimes(1); view.unmount(); expect(mocks.remove).toHaveBeenCalledTimes(1);
});
it('checks for missed events after reconnecting', async () => {
  render(<LiveUpdates initialRevision="0" />);
  await act(async () => { mocks.subscribe('SUBSCRIBED'); });
  await act(async () => { vi.advanceTimersByTime(800); });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
it('defers background refreshes until the tab is visible', async () => {
  const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
  render(<LiveUpdates initialRevision="1" />); await change();
  expect(mocks.refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(mocks.refresh).toHaveBeenCalledTimes(1); visibility.mockRestore();
});
