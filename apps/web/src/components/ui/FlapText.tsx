import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const STEP_MS = 55;
const STEPS = 3;

export type FlapTone = 'flap' | 'signal' | 'go' | 'stop';

const tones: Record<FlapTone, string> = {
  flap: 'text-flap',
  signal: 'text-signal',
  go: 'text-go',
  stop: 'text-stop',
};

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** One slat. When its character changes it riffles through a few glyphs, then drops onto the new one. */
function Cell({ char, delay, animateOnMount }: { char: string; delay: number; animateOnMount: boolean }) {
  // While riffling, the cell shows an interim glyph; otherwise it always shows the real character.
  const [riffle, setRiffle] = useState<string | null>(() =>
    animateOnMount && char.trim() && !reducedMotion() ? ' ' : null,
  );
  const [tick, setTick] = useState(0);
  const first = useRef(true);
  const shown = riffle ?? char;

  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if ((isFirst && !animateOnMount) || reducedMotion() || !char.trim()) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < STEPS; i++) {
      timers.push(
        setTimeout(() => {
          setRiffle(GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)));
          setTick((t) => t + 1);
        }, delay + i * STEP_MS),
      );
    }
    timers.push(
      setTimeout(() => {
        setRiffle(null);
        setTick((t) => t + 1);
      }, delay + STEPS * STEP_MS),
    );
    return () => {
      timers.forEach(clearTimeout);
      setRiffle(null);
    };
  }, [char, delay, animateOnMount]);

  return (
    <span className="flap-cell h-[1.18em] w-[0.7em]">
      <span key={tick} className={cn('relative', tick > 0 && 'animate-flap')}>
        {shown === ' ' ? ' ' : shown}
      </span>
    </span>
  );
}

export interface FlapTextProps {
  text: string;
  tone?: FlapTone;
  className?: string;
  /** Riffle every cell in on first render (one authored moment per page). */
  animateOnMount?: boolean;
  /**
   * "label": cells are hidden from assistive tech and the text is read once (headings, names).
   * "inline": the cells are the text itself (numbers whose textContent must stay the value).
   */
  a11y?: 'label' | 'inline';
  /** Left-pad with blank slats so the board width stays put as values grow. */
  minCells?: number;
}

export function FlapText({ text, tone = 'flap', className, animateOnMount = false, a11y = 'label', minCells = 0 }: FlapTextProps) {
  // Words wrap as whole groups; a blank slat would read as a broken cell at a line end.
  const words = text.toUpperCase().padStart(minCells, ' ').split(/(?<=\S) (?=\S)/);
  let index = 0;
  const cells = (
    <span
      aria-hidden={a11y === 'label' || undefined}
      className={cn('inline-flex flex-wrap gap-x-[0.42em] gap-y-[0.12em]', tones[tone])}
    >
      {words.map((word, w) => (
        <span key={w} className="inline-flex gap-[0.08em]">
          {word.split('').map((c) => {
            const i = index++;
            return <Cell key={i} char={c} delay={i * 28} animateOnMount={animateOnMount} />;
          })}
        </span>
      ))}
    </span>
  );
  if (a11y === 'inline') return <span className={className}>{cells}</span>;
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      {cells}
    </span>
  );
}
