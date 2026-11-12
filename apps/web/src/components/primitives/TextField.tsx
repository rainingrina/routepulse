import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cn } from '../cn';
import { CircleAlert, ICON_STROKE } from '../icons';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | null;
  hint?: string;
  /** Rendered inside the input on the right (e.g. a show/hide toggle). */
  trailing?: ReactNode;
  hideLabel?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/** Visible label, errors linked with aria-describedby (UI plan §16 Forms). */
export function TextField({ label, error, hint, trailing, hideLabel, className, required, ref, ...rest }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-small text-text-secondary', hideLabel && 'sr-only')}>
        {label}
        {required ? <span className="text-text-muted"> (required)</span> : null}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-10 w-full rounded-lg border bg-surface px-3 text-body text-text placeholder:text-text-muted transition-colors hover:border-text-muted',
            'focus-visible:outline-2 focus-visible:outline-offset-0',
            error ? 'border-danger' : 'border-border-input',
            trailing ? 'pr-11' : null,
            'disabled:bg-surface-sunken disabled:text-text-muted',
          )}
          {...rest}
        />
        {trailing ? <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div> : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-small text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-center gap-1 text-small text-danger">
          <CircleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={ICON_STROKE} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
