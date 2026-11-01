import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { errorMessage } from './api';

/** Runs owner and admin actions one at a time, with a busy key, an error and a success message for the screen. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, done?: string): Promise<T | undefined> => {
    setBusy(key);
    setError(null);
    setOk(null);
    try {
      const out = await fn();
      if (done) setOk(done);
      return out;
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);

  return { busy, error, ok, run, setError, setOk };
}

/** Asks before a step that is hard to undo. Alert buttons do nothing on web, so the preview uses the browser's dialog. */
export function confirm(message: string, action = 'OK'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(message) ?? true);
  return new Promise((resolve) =>
    Alert.alert(
      'Are you sure?',
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: action, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
