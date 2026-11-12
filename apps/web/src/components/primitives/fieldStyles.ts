/**
 * Shared native-control styles (UI plan §2 v2) so selects and text areas match TextField without a
 * custom component per screen. Native <select> keeps platform accessibility and mobile pickers.
 */
export const selectClass =
  'h-10 rounded-lg border border-border-strong bg-surface px-3 text-body text-text transition-colors hover:border-text-muted disabled:bg-surface-sunken disabled:text-text-muted';
export const selectClassSm =
  'h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-body text-text transition-colors hover:border-text-muted';
export const textareaClass =
  'w-full rounded-lg border border-border-strong bg-surface p-3 text-body text-text transition-colors placeholder:text-text-muted hover:border-text-muted';
