import { Avatar } from './Avatar';

export function TypingIndicator() {
  return (
    <div className="flex items-end gap-2" role="status" aria-label="The assistant is typing">
      <Avatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3.5 shadow-sm">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="size-1.5 animate-bounce rounded-full bg-muted"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
