import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from './Button';

export function Tooltip({ label, text }: { label: string; text: string }) {
  const id = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const hovering = useRef(false);
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState('start');
  const [side, setSide] = useState('bottom');
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const anchor = wrapper.current?.getBoundingClientRect();
      if (!anchor) return;
      setAlign(anchor.left > window.innerWidth / 2 ? 'end' : 'start');
      setSide(
        window.innerHeight - anchor.bottom <
          (popup.current?.offsetHeight ?? 0) &&
          anchor.top > (popup.current?.offsetHeight ?? 0)
          ? 'top'
          : 'bottom',
      );
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !wrapper.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);
  return (
    <span
      ref={wrapper}
      className="ui-tooltip"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') {
          hovering.current = true;
          setOpen(true);
        }
      }}
      onPointerLeave={() => {
        hovering.current = false;
        if (!wrapper.current?.contains(document.activeElement)) setOpen(false);
      }}
      onFocus={() => {
        setOpen(true);
      }}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          !hovering.current
        )
          setOpen(false);
      }}
    >
      <Button
        variant="text"
        aria-describedby={id}
        onClick={() => {
          setOpen(true);
        }}
      >
        {label} <span aria-hidden="true">ⓘ</span>
      </Button>
      <span
        ref={popup}
        className="ui-tooltip-popup"
        data-align={align}
        data-side={side}
        hidden={!open}
      >
        <span id={id} role="tooltip">
          {text}
        </span>
      </span>
    </span>
  );
}
