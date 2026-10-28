export interface SuggestionChipsProps {
  suggestions: readonly string[];
  onPick: (text: string) => void;
  disabled?: boolean;
}

export function SuggestionChips({ suggestions, onPick, disabled }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 pl-10" role="group" aria-label="Suggested questions">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s)}
          className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-left text-sm text-ink-soft shadow-sm transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
