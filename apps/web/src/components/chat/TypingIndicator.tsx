export function TypingIndicator() {
  return (
    <div className="flex flex-col items-start gap-1.5" role="status" aria-label="The assistant is typing">
      <p className="ml-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted" aria-hidden="true">
        Concierge
      </p>
      <div className="flex items-center gap-1 rounded-slat border border-rule-strong bg-slat-2 p-3" aria-hidden="true">
        {[0, 320, 640].map((d) => (
          <span key={d} className="flap-cell animate-typing-cell h-4 w-3" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  );
}
