# Error Display Convention

Canonical rule for surfacing errors and status in the Floorcraft UI.
If you're adding a new error path, pick exactly one of the three mechanisms.

## The rule

- **Inline** — form-field validation where the user can see and fix the
  offending field. Red text directly beneath the input, `text-xs text-red-600 mt-1`.
  Set `aria-invalid="true"` on the input and wire `aria-describedby` to the
  error element's `id`.
- **Toast** — async / global outcomes where no single field is at fault.
  Auto-dismisses in 4–7s and exposes a manual dismiss button. Push via
  `useToastStore.getState().push({ tone, title, body? })`. Error toasts
  render with `role="alert"`; info/success/warning render with `role="status"`.
- **Modal** — hard failures that BLOCK further work. Requires an explicit
  user decision (cancel, reload, overwrite). Use `role="dialog"` +
  `aria-modal="true"`.

## Examples

**Inline** — the CalibrateScaleModal's distance input rejects non-positive
values. The input gets `aria-invalid`, the error `<p>` gets `id` +
`role="alert"`, and the input's `aria-describedby` points at it.

```tsx
<input id="calibrate-distance" aria-invalid={!!error} aria-describedby={error ? 'calibrate-distance-error' : undefined} />
{error && <p id="calibrate-distance-error" role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
```

**Toast** — ExportDialog surfaces "Could not generate the PDF" via
`useToastStore.push({ tone: 'error', title: 'Export failed', body: ... })`.
The dialog stays open so the user can retry or pick a different format.

**Modal** — `ConflictModal` blocks when a teammate saved mid-session. The
user MUST choose Cancel / Reload / Overwrite before returning to edit mode.

## Toast store API (canonical)

`src/stores/toastStore.ts` exposes:

- `push({ tone: 'info' | 'success' | 'warning' | 'error', title, body?, action? }) => id`
- `dismiss(id) => void`

`src/components/common/Toaster.tsx` renders active toasts bottom-right,
auto-dismisses after 5s, caps at 3 stacked, and supplies a dismiss button
plus an optional action button. Error-tone toasts are wrapped in
`role="alert"` (assertive) and other tones in `role="status"` (polite).

## Known exceptions / TODO

- `src/components/editor/SeatSwapRequestDialog.tsx` — the "Pick someone
  to swap with" validation is pushed as a toast but would be clearer as
  inline text under the autocomplete. Move when the dialog is next
  touched. The "swap create failed" path is a legitimate async outcome
  and should remain a toast.
- Auth pages (`LoginPage`, `SignupPage`, `ForgotPasswordPage`) render a
  single form-level summary rather than per-field errors — the Supabase
  responses are opaque enough that a general summary is the best we can
  do without re-implementing password/email rules client-side. The
  summary element is wired with `role="alert"` and `aria-live="polite"`.
