"use client";

export default function SortSelect<T extends string>({
  value,
  onChange,
  options,
  id,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  id: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="hud-label whitespace-nowrap">Sortieren</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className="hud-input w-auto">
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
