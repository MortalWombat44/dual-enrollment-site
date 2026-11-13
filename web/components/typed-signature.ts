export const CURSIVE = '"Great Vibes", cursive';

/** A typed name rendered in a cursive script, turned into a PNG so it looks the same on the record and the audit PDF. */
export async function typedToPng(name: string): Promise<string> {
  await document.fonts.load(`64px ${CURSIVE}`).catch(() => undefined);
  const c = document.createElement('canvas');
  c.width = 900; c.height = 220;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#201e1d';
  let size = 96;
  do { ctx.font = `${size}px ${CURSIVE}`; size -= 4; } while (ctx.measureText(name).width > 840 && size > 30);
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 30, 115);
  return c.toDataURL('image/png');
}
