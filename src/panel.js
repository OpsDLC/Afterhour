// Debug / tuning panel generated from the parameter schema (H4N-2, H4N-9).

import { schema } from './params.js';

function fmt(v, step) {
  const decimals = step >= 1 ? 0 : Math.min(3, String(step).split('.')[1]?.length ?? 2);
  return Number(v).toFixed(decimals);
}

/**
 * Build the panel into `root`. `params` is mutated in place; `onChange(key)` fires after each edit.
 * Returns { sync() } to refresh inputs after params change elsewhere.
 */
export function buildPanel(root, params, { onChange, onReset }) {
  const inputs = new Map();
  const groups = new Map();
  for (const p of schema) {
    if (!groups.has(p.group)) {
      const det = document.createElement('details');
      det.className = 'group';
      if (['Size', 'Lens', 'Slide', 'Trail'].includes(p.group)) det.open = true;
      const sum = document.createElement('summary');
      sum.textContent = p.group;
      det.append(sum);
      root.append(det);
      groups.set(p.group, det);
    }
    const row = document.createElement('label');
    row.className = 'row';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.label;
    row.append(name);
    let input;
    let out = null;
    if (p.type === 'bool') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!params[p.key];
      input.addEventListener('change', () => { params[p.key] = input.checked; onChange(p.key); });
    } else {
      input = document.createElement('input');
      input.type = 'range';
      input.min = p.min;
      input.max = p.max;
      input.step = p.step;
      input.value = params[p.key];
      out = document.createElement('output');
      out.textContent = fmt(params[p.key], p.step);
      input.addEventListener('input', () => {
        params[p.key] = Number(input.value);
        out.textContent = fmt(input.value, p.step);
        onChange(p.key);
      });
    }
    input.name = p.key;
    row.append(input);
    if (out) row.append(out);
    groups.get(p.group).append(row);
    inputs.set(p.key, { input, out, p });
  }

  const actions = document.createElement('div');
  actions.className = 'actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy values';
  copy.addEventListener('click', async () => {
    const json = JSON.stringify(params, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      copy.textContent = 'Copied';
    } catch {
      console.log(json);
      copy.textContent = 'Logged to console';
    }
    setTimeout(() => { copy.textContent = 'Copy values'; }, 1500);
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset';
  reset.addEventListener('click', () => onReset());
  actions.append(copy, reset);
  root.append(actions);

  return {
    sync() {
      for (const { input, out, p } of inputs.values()) {
        if (p.type === 'bool') input.checked = !!params[p.key];
        else {
          input.value = params[p.key];
          out.textContent = fmt(params[p.key], p.step);
        }
      }
    },
  };
}
