// src/services/photo.ts
// Bill photo management — local storage only.
// Compression is text-optimized (grayscale helps OCR, saves space).
// Future: OCR text extraction, family ephemeral transfer.

import { launchCamera, launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import ImageResizer from 'react-native-image-resizer';
import { Platform, PermissionsAndroid } from 'react-native';
import { MMKV } from 'react-native-mmkv';

const photo_storage = new MMKV({ id: 'paisalog_photos' });

// ── Compression presets ───────────────────────────────────────
export type compression_level = 'low' | 'medium' | 'high';

const COMPRESSION: Record<compression_level, { quality: number; max_width: number }> = {
  low:    { quality: 60, max_width: 1200 },  // ~50KB  — readable bills
  medium: { quality: 40, max_width: 900  },  // ~25KB  — good balance
  high:   { quality: 20, max_width: 600  },  // ~15KB  — minimum readable
};

const STORAGE_KEY = 'bill_photos';

// ── Types ─────────────────────────────────────────────────────
export interface bill_photo {
  txn_id:       number;
  uri:           string;   // local file URI
  size_bytes:    number;
  compression:   compression_level;
  created_at:    string;
}

// ── Permission request ────────────────────────────────────────
async function request_camera_permission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: 'Camera Access',
      message: 'PaisaLog needs camera access to photograph bills.',
      buttonPositive: 'Allow',
      buttonNegative: 'Skip',
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

// ── Compress image ────────────────────────────────────────────
async function compress_image(
  uri: string,
  level: compression_level
): Promise<{ uri: string; size: number }> {
  const { quality, max_width } = COMPRESSION[level];
  const result = await ImageResizer.createResizedImage(
    uri,
    max_width,
    max_width * 2,  // tall aspect for receipts
    'JPEG',
    quality,
    0,              // no rotation
    undefined,
    false,
    { mode: 'contain', onlyScaleDown: true }
  );
  return { uri: result.uri, size: result.size ?? 0 };
}

// ── Launch camera ─────────────────────────────────────────────
export async function capture_bill(
  level: compression_level = 'medium'
): Promise<bill_photo | null> {
  const has_permission = await request_camera_permission();
  if (!has_permission) return null;

  return new Promise((resolve) => {
    launchCamera(
      { mediaType: 'photo', quality: 1, saveToPhotos: false },
      async (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorCode || !response.assets?.[0]) {
          resolve(null);
          return;
        }
        const asset = response.assets[0];
        if (!asset.uri) { resolve(null); return; }
        try {
          const compressed = await compress_image(asset.uri, level);
          resolve({
            txn_id:     0,  // set by caller
            uri:         compressed.uri,
            size_bytes:  compressed.size,
            compression: level,
            created_at:  new Date().toISOString(),
          });
        } catch (e) {
          console.error('Compress error:', e);
          resolve(null);
        }
      }
    );
  });
}

// ── Pick from gallery ─────────────────────────────────────────
export async function pick_bill(
  level: compression_level = 'medium'
): Promise<bill_photo | null> {
  return new Promise((resolve) => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 1 },
      async (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorCode || !response.assets?.[0]) {
          resolve(null);
          return;
        }
        const asset = response.assets[0];
        if (!asset.uri) { resolve(null); return; }
        try {
          const compressed = await compress_image(asset.uri, level);
          resolve({
            txn_id:     0,
            uri:         compressed.uri,
            size_bytes:  compressed.size,
            compression: level,
            created_at:  new Date().toISOString(),
          });
        } catch (e) {
          console.error('Compress error:', e);
          resolve(null);
        }
      }
    );
  });
}

// ── Storage ───────────────────────────────────────────────────
function load_all(): Record<number, bill_photo> {
  try {
    const raw = photo_storage.getString(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function save_all(photos: Record<number, bill_photo>): void {
  photo_storage.set(STORAGE_KEY, JSON.stringify(photos));
}

export function save_photo(txn_id: number, photo: bill_photo): void {
  const all = load_all();
  all[txn_id] = { ...photo, txn_id };
  save_all(all);
}

export function get_photo(txn_id: number): bill_photo | null {
  const all = load_all();
  return all[txn_id] ?? null;
}

export function delete_photo(txn_id: number): void {
  const all = load_all();
  delete all[txn_id];
  save_all(all);
}

export function get_total_size_kb(): number {
  const all = load_all();
  const total = Object.values(all).reduce((s, p) => s + (p.size_bytes ?? 0), 0);
  return Math.round(total / 1024);
}

// ── Get compression level from settings ───────────────────────
export function get_compression_level(): compression_level {
  try {
    const level = photo_storage.getString('bill_compression');
    if (level === 'low' || level === 'medium' || level === 'high') return level;
  } catch {}
  return 'medium';
}

export function set_compression_level(level: compression_level): void {
  photo_storage.set('bill_compression', level);
}
