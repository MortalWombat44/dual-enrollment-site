/** Runs once when the server starts: checks every 30 seconds for scheduled file deletions that are due. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { runDueDeletions } = await import('./lib/file-archive');
  const tick = () => { try { runDueDeletions(); } catch (e) { console.error('[file deletions]', e); } };
  setInterval(tick, 30_000).unref?.();
}
