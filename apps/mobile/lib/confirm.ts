import { Alert, Platform } from 'react-native';

/** Asks before a step that is hard to undo. The web preview has no Alert buttons, so it uses the browser's confirm. */
export function confirm(title: string, message: string, onYes: () => void, yes = 'Yes') {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [{ text: 'Not now', style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);
}
