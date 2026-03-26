// src/services/bill_scan.ts
// Bill scan via OCR.space free API — no new native modules needed.
// Uses react-native-image-picker (already installed) for capture.
// OCR.space free tier: 500 req/day with helloworld key.

import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

const OCR_API_KEY = 'helloworld';
const OCR_URL     = 'https://api.ocr.space/parse/image';

export interface BillScanResult {
  raw_text:   string;
  amount:     number | null;
  currency:   string | null;
  merchant:   string | null;
  date:       string | null;
  confidence: number;
  image_uri:  string | null;  // local file URI for bill photo storage
}

export async function capture_bill_for_scan(): Promise<{uri: string, base64?: string} | null> {
  const { PermissionsAndroid, Platform } = require('react-native');
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      { title: 'Camera', message: 'PaisaLog needs camera to scan bills', buttonPositive: 'Allow' }
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      console.log('[BillScan] Camera permission denied');
      return null;
    }
  }
  return new Promise(resolve => {
    launchCamera({
      mediaType: 'photo', quality: 0.6, maxWidth: 1000, maxHeight: 1400,
      includeBase64: true, saveToPhotos: false,
    }, (response) => {
      console.log('[BillScan] Camera response:', response.errorCode, response.didCancel, response.assets?.length);
      if (response.didCancel) { resolve(null); return; }
      if (response.errorCode) {
        console.log('[BillScan] Camera error:', response.errorCode, response.errorMessage);
        resolve(null); return;
      }
      const asset = response.assets?.[0];
      if (!asset) { resolve(null); return; }
      resolve({ uri: asset.uri ?? '', base64: asset.base64 ?? undefined });
    });
  });
}

export async function pick_bill_for_scan(): Promise<{uri: string, base64?: string} | null> {
  return new Promise(resolve => {
    launchImageLibrary({
      mediaType: 'photo', quality: 0.6, maxWidth: 1000, maxHeight: 1400,
      includeBase64: true,
    }, (response) => {
      if (response.didCancel || response.errorCode) { resolve(null); return; }
      const asset = response.assets?.[0];
      if (!asset) { resolve(null); return; }
      resolve({ uri: asset.uri ?? '', base64: asset.base64 ?? undefined });
    });
  });
}

async function run_ocr(uri: string, base64?: string): Promise<string> {
  const form = new FormData();
  form.append('apikey', OCR_API_KEY);
  form.append('language', 'eng');
  form.append('isOverlayRequired', 'false');
  form.append('scale', 'true');
  form.append('OCREngine', '2');
  form.append('filetype', 'jpg');

  if (base64) {
    // Use base64 if available — compress to stay under limits
    form.append('base64Image', `data:image/jpeg;base64,${base64}`);
  } else {
    // Fallback: send file directly
    form.append('file', { uri, type: 'image/jpeg', name: 'bill.jpg' } as any);
  }

  const res = await fetch(OCR_URL, {
    method: 'POST',
    body: form,
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Exit code 2/3 means partial success — still try to use the text
  if (data.OCRExitCode === 99 || data.IsErroredOnProcessing) {
    const msg = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join(', ')
      : (data.ErrorMessage ?? `OCR exit ${data.OCRExitCode}`);
    throw new Error(msg);
  }
  return data.ParsedResults?.[0]?.ParsedText ?? '';
}

export function parse_bill_text(text: string): Omit<BillScanResult, 'raw_text'> {
  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);

  // Amount detection
  let amount: number | null = null;
  let currency: string | null = null;

  const CURRENCY_PATTERNS: Array<[RegExp, string]> = [
    [/(?:INR|RS\.?|\u20b9)\s*([\d,]+(?:\.\d{1,2})?)/gi, 'INR'],
    [/USD\s*([\d,]+(?:\.\d{1,2})?)/gi, 'USD'],
    [/AED\s*([\d,]+(?:\.\d{1,2})?)/gi, 'AED'],
    [/EUR\s*([\d,]+(?:\.\d{1,2})?)/gi, 'EUR'],
    [/GBP\s*([\d,]+(?:\.\d{1,2})?)/gi, 'GBP'],
    [/SGD\s*([\d,]+(?:\.\d{1,2})?)/gi, 'SGD'],
  ];

  const TOTAL_KEYWORDS = ['GRAND TOTAL', 'TOTAL AMOUNT', 'AMOUNT DUE', 'NET TOTAL', 'TOTAL', 'AMOUNT'];
  for (const keyword of TOTAL_KEYWORDS) {
    const line = lines.find((l: string) => l.toUpperCase().includes(keyword));
    if (line) {
      for (const [pattern, code] of CURRENCY_PATTERNS) {
        pattern.lastIndex = 0;
        const m = pattern.exec(line);
        if (m) {
          const val = parseFloat(m[1].replace(/,/g, ''));
          if (val > 0) { amount = Math.round(val * 100); currency = code; break; }
        }
      }
      if (amount) break;
    }
  }

  // Fallback: largest currency-prefixed amount in doc
  if (!amount) {
    let max_val = 0;
    for (const [pattern, code] of CURRENCY_PATTERNS) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(text)) !== null) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (val > max_val) { max_val = val; amount = Math.round(val * 100); currency = code; }
      }
    }
  }



  // Merchant: first meaningful line
  let merchant: string | null = null;
  const SKIP = ['RECEIPT', 'INVOICE', 'TAX', 'VAT', 'GST', 'BILL'];
  for (const line of lines.slice(0, 5)) {
    if (line.length >= 3 && line.length <= 50 && !SKIP.some(w => line.toUpperCase().includes(w)) && !/^\d/.test(line)) {
      merchant = line.split(/[,|*#@]/)[0].replace(/[^\w\s&\'\-]/g, '').trim();
      if (merchant.length >= 2) break;
    }
  }

  // Date extraction
  let date: string | null = null;
  const DATE_PATTERNS = [
    /(?:date[:\s]+)?(\d{4}[-\/]\d{2}[-\/]\d{2})/i,
    /(\d{2}[-\/]\d{2}[-\/]\d{4})/,
    /(\d{1,2}[\s-](?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\s-]\d{2,4})/i,
    /(\d{2}[-\/]\d{2}[-\/]\d{2})/,
  ];
  for (const pattern of DATE_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      try {
        const raw = m[1];
        if (/^\d{4}/.test(raw)) {
          date = raw.replace(/\//g, '-');
        } else if (/\d{2}[-\/]\d{2}[-\/]\d{4}/.test(raw)) {
          const [d, mo, y] = raw.split(/[-\/]/);
          date = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
        } else if (/\d{2}[-\/]\d{2}[-\/]\d{2}/.test(raw)) {
          const [d, mo, y] = raw.split(/[-\/]/);
          date = `20${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
        if (date) break;
      } catch {}
    }
  }

  let confidence = 50;
  if (amount)   confidence += 25;
  if (merchant) confidence += 15;
  if (date)     confidence += 10;

  return { amount, currency: currency ?? 'INR', merchant, date, confidence };
}

export async function scan_bill(source: 'camera' | 'gallery'): Promise<BillScanResult | null> {
  console.log('[BillScan] Starting scan, source:', source);
  const result = source === 'camera' ? await capture_bill_for_scan() : await pick_bill_for_scan();
  console.log('[BillScan] Image result:', result ? `uri=${result.uri?.slice(0,50)}, base64_len=${result.base64?.length ?? 0}` : 'NULL');
  if (!result) return null;
  try {
    console.log('[BillScan] Calling OCR...');
    const raw_text = await run_ocr(result.uri, result.base64);
    console.log('[BillScan] OCR result:', raw_text?.slice(0,100));
    const parsed   = parse_bill_text(raw_text);
    return { raw_text, ...parsed, image_uri: result.uri };
  } catch (e: any) {
    console.error('[BillScan] ERROR:', e?.message, e?.stack, JSON.stringify(e));
    return null;
  }
}
