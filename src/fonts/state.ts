// The single source of truth for the current font. Every control and renderer reads it here.
export type FontSource = 'google' | 'local';

export interface FontInfo {
  /** Name shown to the user. */
  name: string;
  /** Name used in CSS font-family (unique for uploaded files). */
  family: string;
  source: FontSource;
  /** Weights the font provides, ascending. */
  weights: number[];
}

export interface FontState {
  current: FontInfo;
  loading: string | null;
  error: string | null;
}

type Listener = (state: FontState) => void;

let state: FontState = {
  current: {
    name: 'Instrument Serif',
    family: 'Instrument Serif',
    source: 'google',
    weights: [400],
  },
  loading: null,
  error: null,
};
const listeners = new Set<Listener>();

export function getFontState(): FontState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(patch: Partial<FontState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

/** Loads a font through `load`; on failure the previous font stays and the error is shown. */
export async function switchFont(label: string, load: () => Promise<FontInfo>): Promise<void> {
  update({ loading: label, error: null });
  try {
    const current = await load();
    update({ current, loading: null });
  } catch (err) {
    update({ loading: null, error: err instanceof Error ? err.message : String(err) });
  }
}
