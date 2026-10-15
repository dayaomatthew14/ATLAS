import { useEffect, useRef, useState } from 'react';

/**
 * Count a number up to its value when it first lands, and between values when
 * it changes.
 *
 * The point is not decoration. A tile that animates to 6 tells you the number
 * was just read; a tile that has always said 6 tells you nothing about when.
 * On a screen whose whole job is "what is the state of my term right now",
 * that difference is information, and it is what makes a figure that changed
 * draw the eye instead of sitting there looking the same as the three beside it.
 *
 * Non-numeric values pass straight through — "—" is what a count that could
 * not be read looks like, and there is nothing to animate toward.
 */

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function useCountUp(value, duration = 700) {
  const isNumeric = typeof value === 'number' && Number.isFinite(value);
  const [display, setDisplay] = useState(isNumeric ? 0 : value);

  /* Mirrors `display` so an animation interrupted half way — the count
     refreshed while it was still running — resumes from the figure actually on
     screen rather than snapping back to the last settled one. */
  const shownRef = useRef(isNumeric ? 0 : value);

  useEffect(() => {
    const commit = (v) => {
      shownRef.current = v;
      setDisplay(v);
    };

    if (!isNumeric || prefersReducedMotion() || duration <= 0) {
      commit(value);
      return undefined;
    }

    const from = typeof shownRef.current === 'number' ? shownRef.current : 0;
    const delta = value - from;
    if (delta === 0) {
      commit(value);
      return undefined;
    }

    let raf;
    const started = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      // Ease-out cubic: the figure decelerates into place instead of stopping
      // dead, which is what makes it read as settling rather than flickering.
      const eased = 1 - (1 - t) ** 3;
      commit(Math.round(from + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, isNumeric, duration]);

  return display;
}
