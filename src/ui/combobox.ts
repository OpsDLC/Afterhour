// A searchable combobox (input + listbox) following the WAI-ARIA combobox pattern.
// Kept free of app-specific code so it can move to DLC-UI.
export interface ComboboxOptions<T> {
  input: HTMLInputElement;
  list: HTMLUListElement;
  /** Items matching the query, best first. */
  search: (query: string) => T[] | Promise<T[]>;
  /** Fills an option element for an item. */
  renderItem: (item: T, li: HTMLLIElement) => void;
  onSelect: (item: T) => void;
  /** Optional section heading for an item; a heading is shown whenever it changes. */
  group?: (item: T) => string;
  /** Maximum options rendered at once. */
  limit?: number;
}

export function initCombobox<T>(opts: ComboboxOptions<T>): void {
  const { input, list, limit = 80 } = opts;
  let items: T[] = [];
  let active = -1;
  let query = 0;

  const open = (on: boolean) => {
    list.hidden = !on;
    input.setAttribute('aria-expanded', String(on));
    if (!on) setActive(-1);
  };

  const setActive = (i: number) => {
    const options = list.querySelectorAll<HTMLLIElement>('[role="option"]');
    options[active]?.setAttribute('aria-selected', 'false');
    active = i;
    const el = options[i];
    if (el) {
      el.setAttribute('aria-selected', 'true');
      el.scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', el.id);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const refresh = async () => {
    const id = ++query;
    const found = await opts.search(input.value.trim());
    if (id !== query) return;
    items = found.slice(0, limit);
    const rows: HTMLLIElement[] = [];
    let heading: string | undefined;
    items.forEach((item, i) => {
      const group = opts.group?.(item);
      if (group !== undefined && group !== heading) {
        heading = group;
        const h = document.createElement('li');
        h.className = 'combo-group';
        h.setAttribute('role', 'presentation');
        h.textContent = group;
        rows.push(h);
      }
      const li = document.createElement('li');
      li.id = `${list.id}-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      opts.renderItem(item, li);
      rows.push(li);
    });
    list.replaceChildren(...rows);
    if (found.length > limit) {
      const more = document.createElement('li');
      more.className = 'combo-more';
      more.textContent = `${found.length - limit} more — keep typing`;
      list.append(more);
    }
    active = -1;
    open(true);
    if (items.length) setActive(0);
  };

  const choose = (i: number) => {
    const item = items[i];
    if (item === undefined) return;
    open(false);
    input.value = '';
    opts.onSelect(item);
  };

  input.addEventListener('input', refresh);
  input.addEventListener('focus', refresh);
  input.addEventListener('blur', () => open(false));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) return void refresh();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(Math.min(items.length - 1, Math.max(0, active + step)));
    } else if (e.key === 'Enter' && !list.hidden) {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      open(false);
    }
  });
  // mousedown keeps focus in the input, so blur doesn't close the list before the click lands.
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLLIElement>('[role="option"]');
    if (li) choose([...list.querySelectorAll('[role="option"]')].indexOf(li));
  });
}
