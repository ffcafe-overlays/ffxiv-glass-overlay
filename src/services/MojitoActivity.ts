import { useEffect, useState } from 'react';

export const inMojitoPackage = window.location.protocol === 'mojito-plugin:';

interface Action {
  key: string;
  actionId: number;
  ageMs: number;
  casterName: string;
}

interface Activity {
  epoch: number;
  publishedAt: number;
  actions: Action[];
}

let activity: Activity | null = null;
const listeners = new Set<() => void>();

function isAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false;
  const action = value as Partial<Action>;
  return (
    typeof action.key === 'string' &&
    Number.isSafeInteger(action.actionId) &&
    typeof action.casterName === 'string' &&
    action.casterName.length > 0 &&
    typeof action.ageMs === 'number' &&
    Number.isFinite(action.ageMs) &&
    action.ageMs >= 0
  );
}

// Capture the retained frame even if it arrives before React mounts.
if (inMojitoPackage) {
  document.addEventListener('mojitoOverlayCustomData', (event) => {
    const next = (event as CustomEvent<Partial<Activity> | null>).detail;
    if (
      !next ||
      typeof next.epoch !== 'number' ||
      !Number.isSafeInteger(next.epoch) ||
      typeof next.publishedAt !== 'number' ||
      !Number.isFinite(next.publishedAt) ||
      !Array.isArray(next.actions) ||
      (activity && next.epoch < activity.epoch)
    )
      return;
    activity = { epoch: next.epoch, publishedAt: next.publishedAt, actions: next.actions.filter(isAction) };
    for (const listener of listeners) listener();
  });
}

export function useMojitoActivity() {
  const [frame, setFrame] = useState(activity);
  useEffect(() => {
    if (!inMojitoPackage) return;
    const update = () => setFrame(activity);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return frame;
}
