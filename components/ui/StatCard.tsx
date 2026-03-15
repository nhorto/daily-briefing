interface StatCardProps {
  value: string | number;
  label: string;
  className?: string;
}

export default function StatCard({ value, label, className = '' }: StatCardProps) {
  return (
    <div className={`bg-bg-surface border border-border rounded-lg px-4 py-3 ${className}`}>
      <div className="text-2xl font-bold font-mono text-text-primary">{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
    </div>
  );
}
