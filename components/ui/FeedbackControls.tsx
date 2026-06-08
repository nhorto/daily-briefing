'use client';

import type { FeedbackSignal } from '@/lib/types';

interface FeedbackControlsProps {
  /** Current signal, if any. */
  value?: FeedbackSignal;
  onChange: (signal: FeedbackSignal) => void;
}

/**
 * The 👍 / 👎 / not-interested training controls, shared by article and cluster
 * cards. "Not interested" (hide) is handled by the parent collapsing the card.
 */
export default function FeedbackControls({ value, onChange }: FeedbackControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <Button active={value === 'up'} title="More like this" onClick={() => onChange('up')}>
        👍
      </Button>
      <Button active={value === 'down'} title="Less like this" onClick={() => onChange('down')}>
        👎
      </Button>
      <Button active={false} title="Not interested — hide and train" onClick={() => onChange('hide')}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </Button>
    </div>
  );
}

function Button({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center justify-center w-7 h-7 rounded-md text-sm transition-colors ${
        active
          ? 'bg-accent-muted text-text-primary'
          : 'text-text-muted hover:bg-bg-elevated hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
