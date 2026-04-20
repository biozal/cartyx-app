// app/components/shared/ColorPicker.tsx

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  disabled?: boolean;
}

const PRESET_COLORS = [
  '#e74c3c',
  '#e67e22',
  '#f1c40f',
  '#2ecc71',
  '#1abc9c',
  '#3498db',
  '#9b59b6',
  '#e91e63',
  '#00bcd4',
  '#8bc34a',
  '#ff5722',
  '#795548',
  '#607d8b',
  '#c0392b',
  '#8e44ad',
];

export function ColorPicker({ value, onChange, label, disabled }: ColorPickerProps) {
  return (
    <div>
      {label && (
        <label className="block text-[10px] font-sans font-semibold text-slate-500 tracking-wide mb-2">
          {label}
        </label>
      )}
      <div className="flex flex-wrap gap-2 mb-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            disabled={disabled}
            onClick={() => onChange(color)}
            className={`w-7 h-7 rounded-full border-2 transition-transform ${
              value === color ? 'border-white scale-110' : 'border-transparent hover:scale-105'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            style={{ backgroundColor: color }}
            aria-label={`Select color ${color}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#3498db'}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-8 h-8 rounded cursor-pointer border border-white/[0.1] bg-transparent"
          aria-label="Custom color"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
          }}
          disabled={disabled}
          placeholder="#3498db"
          className="w-24 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.1] text-slate-300 text-xs font-mono focus:outline-none focus:border-blue-500/40"
          aria-label="Hex color code"
        />
      </div>
    </div>
  );
}
