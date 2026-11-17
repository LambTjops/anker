import { useEffect, useRef, useState } from 'preact/hooks';

/** How long the buttons stay after a tap on a touch screen. */
const SHOW_MS = 5000;

/**
 * On a touch screen, a tap shows hidden buttons (Focus, Break) for a few seconds. With a mouse,
 * CSS shows them while the pointer is over them (`.reveal:hover`).
 *
 * A tap that lands on a hidden button only shows it: the tap's own click is swallowed.
 * (The buttons become visible as the finger goes down, so CSS alone can't stop the click.)
 */
export function useTapToShow() {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const swallow = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    swallow.current = startsOnHidden(e.target);
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), SHOW_MS);
  };
  const onPointerUp = () => {
    // The click follows pointerup straight away; don't let a stale flag eat a later one.
    if (swallow.current) setTimeout(() => (swallow.current = false), 400);
  };
  const onClick = (e: MouseEvent) => {
    if (!swallow.current) return;
    swallow.current = false;
    e.preventDefault();
    e.stopPropagation();
  };
  return { on, onPointerDown, onPointerUp, onClick };
}

/** Whether the press began on a control that was still hidden (faded out) at that moment. */
function startsOnHidden(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const group = target.closest('.reveal');
  return group !== null && Number(getComputedStyle(group).opacity) < 0.5;
}
