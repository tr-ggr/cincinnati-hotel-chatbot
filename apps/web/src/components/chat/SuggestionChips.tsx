export interface SuggestionChipsProps {
  suggestions: readonly string[];
  onPick: (text: string) => void;
  disabled?: boolean;
}

export function SuggestionChips({ suggestions, onPick, disabled }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested questions">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s)}
          className="min-h-10 rounded-slat border border-rule-strong bg-slat px-3.5 py-2 text-left text-sm text-flap transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:text-muted disabled:hover:border-rule-strong"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
