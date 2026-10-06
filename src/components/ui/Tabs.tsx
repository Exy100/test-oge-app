import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}
export function Tabs({
  label,
  items,
  defaultValue,
}: {
  label: string;
  items: readonly TabItem[];
  defaultValue?: string;
}) {
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [selected, setSelected] = useState(defaultValue);
  const enabled = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0);
  const active = items.findIndex(
    (item) => item.value === selected && !item.disabled,
  );
  const current = active >= 0 ? active : enabled[0];
  if (
    current === undefined ||
    new Set(items.map((item) => item.value)).size !== items.length
  )
    throw new Error(
      'Вкладкам нужны уникальные значения и хотя бы один доступный пункт.',
    );
  return (
    <div className="ui-tabs">
      <div role="tablist" aria-label={label} className="ui-tablist">
        {items.map((item, index) => (
          <button
            key={item.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${String(index)}`}
            aria-controls={`${id}-panel-${String(index)}`}
            aria-selected={index === current}
            tabIndex={index === current ? 0 : -1}
            disabled={item.disabled}
            onClick={() => {
              setSelected(item.value);
            }}
            onKeyDown={(event) => {
              const position = enabled.indexOf(index);
              let target: number | undefined;
              if (event.key === 'ArrowRight')
                target = enabled[(position + 1) % enabled.length];
              if (event.key === 'ArrowLeft')
                target =
                  enabled[(position - 1 + enabled.length) % enabled.length];
              if (event.key === 'Home') target = enabled[0];
              if (event.key === 'End') target = enabled.at(-1);
              if (target === undefined) return;
              event.preventDefault();
              const next = items[target];
              if (next) setSelected(next.value);
              buttons.current[target]?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={item.value}
          role="tabpanel"
          id={`${id}-panel-${String(index)}`}
          aria-labelledby={`${id}-tab-${String(index)}`}
          hidden={index !== current}
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
