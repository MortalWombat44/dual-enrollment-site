'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** "9:41" until the given time, then refreshes the page (the server finishes the job). */
export function Countdown({ until }: { until: string }) {
  const router = useRouter();
  const end = new Date(until).getTime();
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, end - Date.now());
      setLeft(l);
      if (l === 0) { clearInterval(t); setTimeout(() => router.refresh(), 35_000); }
    }, 1000);
    return () => clearInterval(t);
  }, [end, router]);
  const s = Math.ceil(left / 1000);
  return <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{left === 0 ? 'any moment now' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</strong>;
}
