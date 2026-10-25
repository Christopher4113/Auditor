import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

export type LiquidSegmentOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export type LiquidSegmentedControlProps = {
  options: LiquidSegmentOption[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  as?: "div" | "nav";
};

type Segment = {
  value: string;
  element: HTMLButtonElement;
  x: number;
  y: number;
  width: number;
  height: number;
  center: number;
};

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  grabOffset: number;
  dragging: boolean;
  lastX: number;
  lastTime: number;
  segments: Segment[];
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));
const nearest = (segments: Segment[], x: number) =>
  segments.reduce<Segment | undefined>(
    (best, segment) =>
      !best || Math.abs(segment.center - x) < Math.abs(best.center - x)
        ? segment
        : best,
    undefined,
  );

/** A controlled button group: dragging previews a choice; releasing commits it. */
export default function LiquidSegmentedControl({
  options,
  value,
  onValueChange,
  ariaLabel,
  className = "",
  as: Container = "div",
}: LiquidSegmentedControlProps) {
  const root = useRef<HTMLElement | null>(null);
  const lens = useRef<HTMLSpanElement>(null);
  const geometry = useRef<Segment[]>([]);
  const baseSize = useRef({ width: 1, height: 1 });
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const selectedValue = useRef(value);
  const suppressPointerClickUntil = useRef(0);
  const optionsKey = JSON.stringify(
    options.map((option) => [option.value, !!option.disabled]),
  );
  const selectedIndex = options.findIndex(
    (option) => option.value === value && !option.disabled,
  );
  const tabStop =
    selectedIndex >= 0
      ? selectedIndex
      : options.findIndex((option) => !option.disabled);

  const cancelFrame = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  // Pointer frames change only a composited transform, never React state or layout.
  const paint = useCallback(
    (segment: Pick<Segment, "x" | "y" | "width" | "height">, stretch = 1) => {
      const element = lens.current;
      if (!element) return;
      const { width, height } = baseSize.current;
      const x = segment.x - (segment.width * (stretch - 1)) / 2;
      element.style.transform = `translate3d(${x}px, ${segment.y}px, 0) scale(${(segment.width / width) * stretch}, ${segment.height / height / Math.sqrt(stretch)})`;
    },
    [],
  );

  const settle = useCallback(() => {
    cancelFrame();
    root.current?.removeAttribute("data-dragging");
    root.current?.removeAttribute("data-pressed");
    const selected = geometry.current.find(
      (segment) => segment.value === selectedValue.current,
    );
    if (selected) paint(selected);
  }, [cancelFrame, paint]);

  const releaseCapture = useCallback((pointerId: number) => {
    const element = root.current;
    try {
      if (element?.hasPointerCapture?.(pointerId))
        element.releasePointerCapture(pointerId);
    } catch {
      // The browser may already have released capture for a scrolling gesture.
    }
  }, []);

  const cancelGesture = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    if (active) {
      suppressPointerClickUntil.current = performance.now() + 750;
      releaseCapture(active.pointerId);
    }
    settle();
  }, [releaseCapture, settle]);

  const measure = useCallback(() => {
    const element = root.current;
    if (!element || !lens.current) return;
    const bounds = element.getBoundingClientRect();
    const segments = Array.from(
      element.querySelectorAll<HTMLButtonElement>("[data-segment-value]"),
    )
      .filter((button) => !button.disabled)
      .map((button): Segment => {
        const rect = button.getBoundingClientRect();
        const x = rect.left - bounds.left - element.clientLeft;
        return {
          value: button.dataset.segmentValue!,
          element: button,
          x,
          y: rect.top - bounds.top - element.clientTop,
          width: rect.width,
          height: rect.height,
          center: x + rect.width / 2,
        };
      });
    geometry.current = segments;
    const selected = segments.find(
      (segment) => segment.value === selectedValue.current,
    );
    if (!selected || selected.width <= 0 || selected.height <= 0) {
      element.removeAttribute("data-measured");
      return;
    }
    // Layout changes end an in-progress gesture rather than selecting stale bounds.
    if (gesture.current) cancelGesture();
    baseSize.current = { width: selected.width, height: selected.height };
    lens.current.style.width = `${selected.width}px`;
    lens.current.style.height = `${selected.height}px`;
    paint(selected);
    element.dataset.measured = "true";
  }, [cancelGesture, paint]);

  useLayoutEffect(() => {
    selectedValue.current = value;
    cancelGesture();
    measure();
  }, [value, optionsKey, cancelGesture, measure]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let disposed = false;
    const resize = () => {
      if (!disposed) measure();
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(element);
    element
      .querySelectorAll("button")
      .forEach((button) => observer?.observe(button));
    const appearance =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(resize);
    appearance?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["dir", "data-theme", "class"],
    });
    window.addEventListener("resize", resize);
    document.fonts?.addEventListener?.("loadingdone", resize);
    void document.fonts?.ready.then(resize);
    return () => {
      disposed = true;
      observer?.disconnect();
      appearance?.disconnect();
      window.removeEventListener("resize", resize);
      document.fonts?.removeEventListener?.("loadingdone", resize);
      cancelGesture();
    };
  }, [optionsKey, measure, cancelGesture]);

  const choose = (segment: Segment) => {
    segment.element.focus({ preventScroll: true });
    if (segment.value !== value) onValueChange(segment.value);
  };

  const pointerDown = (event: PointerEvent<HTMLElement>) => {
    if (gesture.current || !event.isPrimary || event.button !== 0) return;
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "[data-segment-value]",
    );
    if (!button || button.disabled || !root.current?.contains(button)) return;
    measure();
    const segment = geometry.current.find((item) => item.element === button);
    const element = root.current;
    if (
      !segment ||
      !element ||
      element.dataset.measured !== "true" ||
      segment.width <= 0 ||
      segment.height <= 0
    )
      return;
    const x =
      event.clientX - element.getBoundingClientRect().left - element.clientLeft;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: element.getBoundingClientRect().left + element.clientLeft,
      grabOffset: x - segment.center,
      dragging: false,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      segments: geometry.current.slice().sort((a, b) => a.center - b.center),
    };
    element.dataset.pressed = "true";
    paint(segment, 1.025);
    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {
      // Native click remains available when pointer capture is unsupported.
    }
  };

  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    const element = root.current;
    if (!active || event.pointerId !== active.pointerId || !element) return;
    const dx = Math.abs(event.clientX - active.startX);
    const dy = Math.abs(event.clientY - active.startY);
    if (!active.dragging) {
      if (dy > 8 && dy > dx * 1.15) {
        cancelGesture();
        return;
      }
      if (dx < 6) return;
      active.dragging = true;
      element.dataset.dragging = "true";
    }
    if (event.cancelable) event.preventDefault();
    const segments = active.segments;
    const first = segments[0];
    const last = segments[segments.length - 1];
    if (!first || !last) return;
    const x = event.clientX - active.originX;
    const center = clamp(x - active.grabOffset, first.center, last.center);
    const before =
      [...segments].reverse().find((segment) => segment.center <= center) ??
      first;
    const after = segments.find((segment) => segment.center >= center) ?? last;
    const fraction =
      before === after
        ? 0
        : (center - before.center) / (after.center - before.center);
    const width = before.width + (after.width - before.width) * fraction;
    const height = before.height + (after.height - before.height) * fraction;
    const velocity =
      Math.abs(event.clientX - active.lastX) /
      Math.max(8, event.timeStamp - active.lastTime);
    active.lastX = event.clientX;
    active.lastTime = event.timeStamp;
    cancelFrame();
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (gesture.current !== active) return;
      paint(
        { x: center - width / 2, y: before.y, width, height },
        1.025 + Math.min(velocity * 0.018, 0.04),
      );
    });
  };

  const pointerUp = (event: PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    const element = root.current;
    if (!active || event.pointerId !== active.pointerId || !element) return;
    const dx = Math.abs(event.clientX - active.startX);
    const dy = Math.abs(event.clientY - active.startY);
    if (!active.dragging && dy > 8 && dy > dx * 1.15) {
      cancelGesture();
      return;
    }
    const x = event.clientX - active.originX - active.grabOffset;
    const target = nearest(active.segments, x);
    gesture.current = null;
    suppressPointerClickUntil.current = performance.now() + 750;
    releaseCapture(active.pointerId);
    settle();
    if (target) choose(target);
  };

  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = options
      .map((option, optionIndex) => (!option.disabled ? optionIndex : -1))
      .filter((optionIndex) => optionIndex >= 0);
    if (!enabled.length) return;
    const rtl =
      root.current && getComputedStyle(root.current).direction === "rtl";
    const direction = (event.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1);
    const position = enabled.indexOf(index);
    const next =
      event.key === "Home"
        ? enabled[0]
        : event.key === "End"
          ? enabled[enabled.length - 1]
          : enabled[(position + direction + enabled.length) % enabled.length];
    const button =
      root.current?.querySelectorAll<HTMLButtonElement>("button")[next];
    button?.focus({ preventScroll: true });
    if (options[next].value !== value) onValueChange(options[next].value);
  };

  return (
    <Container
      ref={(element) => {
        root.current = element;
      }}
      role={Container === "nav" ? undefined : "group"}
      aria-label={ariaLabel}
      className={`glass-segments ${className}`.trim()}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={(event) => {
        if (gesture.current?.pointerId === event.pointerId) cancelGesture();
      }}
      onLostPointerCapture={(event) => {
        if (gesture.current?.pointerId === event.pointerId) cancelGesture();
      }}
    >
      <span ref={lens} className="glass-segments-lens" aria-hidden="true" />
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          className="glass-segment"
          data-segment-value={option.value}
          aria-pressed={option.value === value}
          disabled={option.disabled}
          tabIndex={index === tabStop ? 0 : -1}
          onKeyDown={(event) => keyDown(event, index)}
          onClick={(event) => {
            if (
              event.detail > 0 &&
              performance.now() < suppressPointerClickUntil.current
            )
              return;
            if (option.value !== value) onValueChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </Container>
  );
}
