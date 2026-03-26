// src/services/mpin.ts
// 4-digit MPIN for hidden transactions vault. Local only — never leaves device.
import { MMKV } from 'react-native-mmkv';

const store = new MMKV({ id: 'paisalog_mpin' });
const KEY   = 'mpin_hash';

function hash(pin: string): string {
  let h = 5381;
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) + h) ^ pin.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const MPIN = {
  is_set:   ()           => !!store.getString(KEY),
  set:      (pin: string) => { store.set(KEY, hash(pin)); },
  verify:   (pin: string) => store.getString(KEY) === hash(pin),
  clear:    ()            => store.delete(KEY),
};
