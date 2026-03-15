interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'accent';
  className?: string;
}

const variantStyles = {
  default: 'bg-bg-elevated text-text-secondary',
  success: 'bg-status-new/15 text-status-new',
  warning: 'bg-status-warning/15 text-status-warning',
  error: 'bg-status-breaking/15 text-status-breaking',
  accent: 'bg-accent-muted text-accent',
};

export default function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
