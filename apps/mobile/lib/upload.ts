import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { api } from './api';
import { type PickedPhoto, photoPart, photoProblem } from './photo';

export type Photo = PickedPhoto & { file?: File | null };

/** Opens the photo library (or the camera) and returns the picked photo, or null if the person backed out. */
export async function pickPhoto(source: 'library' | 'camera' = 'library'): Promise<Photo | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(source === 'camera' ? 'Allow camera access to take a photo.' : 'Allow photo access to attach a photo.');
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const photo: Photo = { uri: a.uri, mimeType: a.mimeType, fileName: a.fileName, fileSize: a.fileSize, file: a.file };
  const problem = photoProblem(photo);
  if (problem) throw new Error(problem);
  return photo;
}

/** Uploads a photo to `POST /uploads` and returns its public URL. */
export async function uploadPhoto(photo: Photo): Promise<string> {
  const part = photoPart(photo);
  const body = new FormData();
  if (Platform.OS === 'web') {
    // The browser needs a real Blob; the picker gives a File on web, or a blob: URI we can read.
    const blob = photo.file ?? (await (await fetch(photo.uri)).blob());
    body.append('file', blob, part.name);
  } else {
    // React Native's FormData streams a local file from { uri, name, type }.
    body.append('file', part as unknown as Blob);
  }
  const res = await api.request<{ url: string }>('/uploads', { body });
  return res.url;
}
