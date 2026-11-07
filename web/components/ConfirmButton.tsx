'use client';

/** A submit button that asks "Are you sure?" first. Used for admin overrides. */
export function ConfirmButton({ children, message, formAction, className = 'btn btn-ghost', style }: {
  children: React.ReactNode;
  message: string;
  formAction: (fd: FormData) => Promise<void>;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      className={className}
      style={style}
      formAction={formAction}
      onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}
    >
      {children}
    </button>
  );
}
