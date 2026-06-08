'use client';

interface BookmarkButtonProps {
  saved: boolean;
  onClick: () => void;
  /** Larger variant for the article detail page. */
  size?: 'sm' | 'md';
}

/**
 * Save-for-later toggle. Filled bookmark when saved, outline when not.
 */
export default function BookmarkButton({ saved, onClick, size = 'sm' }: BookmarkButtonProps) {
  const box = size === 'md' ? 'w-9 h-9' : 'w-7 h-7';
  const icon = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
  const label = saved ? 'Saved — click to remove' : 'Save for later';

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={saved}
      onClick={onClick}
      className={`flex items-center justify-center ${box} rounded-md transition-colors ${
        saved
          ? 'text-accent bg-accent-muted'
          : 'text-text-muted hover:bg-bg-elevated hover:text-text-primary'
      }`}
    >
      <svg
        className={icon}
        viewBox="0 0 24 24"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
      </svg>
    </button>
  );
}
