// Accessible tabs for a [role=tablist]. Tabs with aria-disabled="true" are skipped.
// Kept free of app-specific code so it can move to DLC-UI.
export function initTabs(tablist: HTMLElement): void {
  const tabs = Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]'));
  const enabled = () => tabs.filter((t) => t.getAttribute('aria-disabled') !== 'true');

  const select = (tab: HTMLElement) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls') ?? '');
      if (panel) panel.hidden = !on;
    }
  };

  tablist.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    if (tab && enabled().includes(tab)) select(tab);
  });

  tablist.addEventListener('keydown', (e) => {
    const list = enabled();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const next =
      e.key === 'ArrowRight'
        ? list[(i + 1) % list.length]
        : e.key === 'ArrowLeft'
          ? list[(i - 1 + list.length) % list.length]
          : e.key === 'Home'
            ? list[0]
            : e.key === 'End'
              ? list[list.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    select(next);
    next.focus();
  });
}
