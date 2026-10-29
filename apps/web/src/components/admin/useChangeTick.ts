import { useEffect, useRef, useState } from 'react';

/** Counts how many times `value` has changed after its first real (non-null) value; used to replay a highlight. */
export function useChangeTick(value: unknown): number {
  const prev = useRef(value);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (prev.current !== null && prev.current !== undefined && prev.current !== value) setTick((t) => t + 1);
    prev.current = value;
  }, [value]);
  return tick;
}
