'use client';

const SOURCE_COLORS = [
  'var(--source-1)',
  'var(--source-2)',
  'var(--source-3)',
  'var(--source-4)',
  'var(--source-5)',
  'var(--source-6)',
  'var(--source-7)',
  'var(--source-8)',
];

export function getSourceColor(sourceName: string): string {
  let hash = 0;
  for (let i = 0; i < sourceName.length; i++) {
    hash = sourceName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SOURCE_COLORS[Math.abs(hash) % SOURCE_COLORS.length]!;
}

interface SourcePillProps {
  name: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function SourcePill({ name, count, active, onClick, className = '' }: SourcePillProps) {
  const color = getSourceColor(name);

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-accent-muted text-text-primary'
          : 'bg-bg-elevated text-text-secondary hover:bg-bg-overlay'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'} ${className}`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {name}
      {count !== undefined && (
        <span className="text-text-muted">{count}</span>
      )}
    </button>
  );
}
