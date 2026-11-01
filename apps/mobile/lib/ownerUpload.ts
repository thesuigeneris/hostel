import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { api } from './api';
import { photoPart } from './owner';

/**
 * Lets the owner pick a photo from the library and uploads it to POST /uploads. Returns the stored photo's URL,
 * or null when the owner cancelled. Throws with a readable message when access is denied or the upload fails.
 */
export async function pickAndUploadPhoto(): Promise<string | null> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Allow access to your photos to add pictures of your hostel.');
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [4, 3] });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset) return null;
  const { name, type } = photoPart(asset);
  const body = new FormData();
  if (Platform.OS === 'web') {
    // The web preview hands back a File (or a blob: URI); React Native's { uri } form parts only work on a device.
    const file = asset.file ?? (await (await fetch(asset.uri)).blob());
    body.append('file', file, name);
  } else {
    body.append('file', { uri: asset.uri, name, type } as unknown as Blob);
  }
  const { url } = await api.request<{ url: string }>('/uploads', { body });
  return url;
}
