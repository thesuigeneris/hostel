import * as WebBrowser from 'expo-web-browser';
import { api } from './api';
import { WEB_URL } from './config';

/** Bills are paid on the website's checkout page. A one-time code signs the person in there. */
export async function openPayment(invoiceId: string) {
  const { code } = await api.auth.handoff();
  const next = encodeURIComponent(`/pay/${invoiceId}`);
  await WebBrowser.openBrowserAsync(`${WEB_URL}/auth/handoff?code=${encodeURIComponent(code)}&next=${next}`);
}
