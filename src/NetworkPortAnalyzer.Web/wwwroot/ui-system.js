"use strict";

// A focused dialog keeps keyboard navigation inside its controls. The ordinary
// workspace stays readable and retains its scroll position when it closes.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const dialog = [
    ...document.querySelectorAll('[role="dialog"][aria-modal="true"]'),
  ].find((item) => !item.hidden);
  if (!dialog) return;
  const controls = [
    ...dialog.querySelectorAll(
      "a[href],button,input,select,textarea,[tabindex]",
    ),
  ].filter(
    (item) =>
      !item.disabled && item.tabIndex >= 0 && item.getClientRects().length,
  );
  const first = controls[0],
    last = controls.at(-1);
  if (!first) return;
  if (
    !dialog.contains(document.activeElement) ||
    (event.shiftKey && document.activeElement === first)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
