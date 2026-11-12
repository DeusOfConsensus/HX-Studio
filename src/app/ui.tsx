import { useEffect, useId, useState, type ReactNode } from "react";

const fmt = (v: number) => String(Number(v.toPrecision(6)));

/** Numeric input with visible unit and symbol; displays value·scale, commits txt/scale when valid. */
export function NumField({
  label,
  symbol,
  unit,
  value,
  onCommit,
  scale = 1,
  min,
  step,
  integer,
  tip,
  disabled,
}: {
  label: string;
  symbol?: string;
  unit: string;
  value: number | undefined;
  onCommit: (v: number) => void;
  scale?: number;
  min?: number;
  step?: number | string;
  integer?: boolean;
  tip?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const shown = value === undefined ? "" : fmt(value * scale);
  const [txt, setTxt] = useState(shown);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setTxt(shown);
  }, [shown, focus]);
  const parsed = txt.trim() === "" ? NaN : Number(txt);
  const bad = !Number.isFinite(parsed) || (min !== undefined && parsed / scale < min) || (integer === true && !Number.isInteger(parsed));
  return (
    <div className="min-w-0" title={tip}>
      <label htmlFor={id} className="hx-label flex items-baseline justify-between gap-1">
        <span className="truncate">{label}</span>
        {symbol ? <span className="shrink-0 italic">{symbol}</span> : null}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          className="hx-input"
          style={bad ? { borderColor: "var(--err)" } : undefined}
          inputMode="decimal"
          type="text"
          value={txt}
          disabled={disabled}
          aria-invalid={bad}
          aria-describedby={bad ? `${id}-e` : undefined}
          step={step}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onChange={(e) => {
            setTxt(e.target.value);
            const n = e.target.value.trim() === "" ? NaN : Number(e.target.value);
            if (Number.isFinite(n) && (min === undefined || n / scale >= min) && (!integer || Number.isInteger(n))) onCommit(n / scale);
          }}
        />
        <span className="hx-label w-12 shrink-0 text-right">{unit}</span>
      </div>
      {bad ? (
        <div id={`${id}-e`} role="alert" className="text-[11px]" style={{ color: "var(--err)" }}>
          ⚠ {integer ? "whole number " : ""}
          {min !== undefined ? `≥ ${fmt(min * scale)} ${unit}` : "enter a number"}
        </div>
      ) : null}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  tip,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
  tip?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0" title={tip}>
      <label htmlFor={id} className="hx-label">
        {label}
      </label>
      <select id={id} className="hx-input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Section({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="hx-panel mb-2">
      <summary>{title}</summary>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 pb-3">{children}</div>
    </details>
  );
}

export function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className="hx-btn" aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  );
}
