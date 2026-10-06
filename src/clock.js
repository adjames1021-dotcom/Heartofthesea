// Shared world clock. The sea is a pure function of time, so if every client
// agrees on the time, every client sees the same waves — the foundation for
// multiplayer without streaming the ocean.

let offsetMs = 0;

export async function syncClock() {
  try {
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      const res = await fetch('/api/time', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const { now } = await res.json();
      const t1 = Date.now();
      samples.push({ rtt: t1 - t0, offset: now + (t1 - t0) / 2 - t1 });
    }
    samples.sort((a, b) => a.rtt - b.rtt);
    offsetMs = samples[0].offset;
    return true;
  } catch {
    offsetMs = 0; // e.g. plain `vite` dev server without the Worker
    return false;
  }
}

/** Seconds on the shared clock (double precision — wrap before sending to GLSL). */
export const worldTime = () => (Date.now() + offsetMs) / 1000;
