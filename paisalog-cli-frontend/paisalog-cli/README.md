# PaisaLog — React Native CLI

No Expo. Full control. Direct native access.

## Why CLI over Expo

- SMS reading (`READ_SMS`) requires a native Android module
  Expo managed workflow blocks this or requires ejecting anyway
- Smaller app binary (~20-30MB vs ~80MB with Expo)
- Your Gradle build, your signing config, your pipeline
- No Expo SDK version mismatch problems

## Prerequisites

```bash
# Node
node --version  # 20+

# Java (for Android)
java --version  # 17+ (for Gradle 8+)

# Android Studio
# Install: SDK Platform 34, Build Tools 34, NDK

# React Native CLI
npm install -g react-native@latest

# iOS only (Mac)
xcode-select --install
sudo gem install cocoapods
```

## Setup

```bash
# Create the project (if starting fresh)
npx react-native init PaisaLog --template react-native-template-typescript

# Or use this scaffold — copy src/, App.tsx, package.json
# into the RN project root

# Install dependencies
npm install

# iOS only
cd ios && pod install && cd ..

# Link fonts (copy TTF files to assets/fonts/ then)
# Android: android/app/src/main/assets/fonts/
# iOS: add to Info.plist under UIAppFonts

# Start Metro bundler
npx react-native start

# Run Android (with device/emulator connected)
npx react-native run-android

# Run iOS
npx react-native run-ios
```

## Backend connection

In `src/services/api.ts`:
```ts
const BASE_URL = __DEV__
  ? 'http://192.168.29.100:3001'  // Lenovo ThinkCentre IP
  : 'https://api.paisalog.in';
```

## Fonts

Download and place in `android/app/src/main/assets/fonts/`:
- Outfit-Regular.ttf
- Outfit-Medium.ttf
- Outfit-SemiBold.ttf
- Outfit-Bold.ttf
- DMSans-Regular.ttf

Both are open source on Google Fonts.

Then in `android/app/build.gradle` no changes needed —
React Native auto-links fonts from the assets/fonts directory.

For iOS: add to `ios/PaisaLog/Info.plist`:
```xml
<key>UIAppFonts</key>
<array>
  <string>Outfit-Regular.ttf</string>
  <string>Outfit-Medium.ttf</string>
  <string>Outfit-SemiBold.ttf</string>
  <string>Outfit-Bold.ttf</string>
  <string>DMSans-Regular.ttf</string>
</array>
```

## SMS reading (Android only)

The package `react-native-get-sms-android` reads historical SMS.
For real-time SMS parsing, you need a BroadcastReceiver.

### Step 1: AndroidManifest.xml permissions

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.READ_SMS"/>
<uses-permission android:name="android.permission.RECEIVE_SMS"/>
```

### Step 2: Request permission at runtime

```ts
// src/services/sms.ts
import { PermissionsAndroid, Platform } from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    {
      title: 'PaisaLog needs SMS access',
      message: 'We read bank transaction alerts to track your spending automatically. OTPs are ignored immediately.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export async function readBankSms(daysBack = 90): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const minDate = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    SmsAndroid.list(
      JSON.stringify({
        box:     'inbox',
        minDate,
        maxCount: 1000,
      }),
      (fail: string) => reject(new Error(fail)),
      (_count: number, smsList: string) => {
        const all = JSON.parse(smsList) as Array<{ address: string; body: string; date: number }>;
        // Pre-filter to likely bank senders before sending to parser
        const bankSms = all.filter(sms =>
          /^[A-Z]{2}-[A-Z]+$/.test(sms.address) ||  // VM-HDFCBK format
          sms.address.startsWith('BX-') ||
          sms.address.startsWith('AM-') ||
          /bank|hdfc|icici|sbi|axis|kotak|upi|credited|debited/i.test(sms.body.slice(0, 30))
        );
        resolve(bankSms);
      },
    );
  });
}
```

### Step 3: Real-time SMS via BroadcastReceiver

For SMS arriving while the app is running, add a native BroadcastReceiver.

Create `android/app/src/main/java/com/paisalog/SmsReceiver.kt`:

```kotlin
package com.paisalog

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            messages?.forEach { sms ->
                val body    = sms.messageBody
                val address = sms.originatingAddress ?: ""
                // Emit to JS layer
                (context.applicationContext as? MainApplication)
                    ?.reactNativeHost
                    ?.reactInstanceManager
                    ?.currentReactContext
                    ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit("onSmsReceived", mapOf("body" to body, "address" to address))
            }
        }
    }
}
```

Register in `AndroidManifest.xml`:
```xml
<receiver android:name=".SmsReceiver" android:exported="true">
    <intent-filter>
        <action android:name="android.permission.RECEIVE_SMS" />
    </intent-filter>
</receiver>
```

Listen in JS:
```ts
import { DeviceEventEmitter } from 'react-native';
DeviceEventEmitter.addListener('onSmsReceived', ({ body, address }) => {
  // Run your parser on body
  // Queue result to MMKV offline store
  // Sync to backend when online
});
```

## Project structure

```
PaisaLog/
├── App.tsx                           Entry point
├── src/
│   ├── design/
│   │   ├── tokens/index.ts           Colors, typography, spacing
│   │   └── components/index.tsx      All shared UI components
│   ├── navigation/index.tsx          React Navigation setup
│   ├── services/
│   │   ├── api.ts                    All backend API calls
│   │   └── sms.ts                    SMS reading + permission
│   └── screens/
│       ├── home/HomeScreen.tsx       Dashboard
│       ├── spend/SpendScreen.tsx     Category drill-down
│       ├── onboarding/              Login + backup setup
│       ├── add/                     Manual transaction entry
│       └── account/                 Settings + debug
├── android/                         Android native project
└── ios/                             iOS native project
```

## Design decisions

**Light theme** — warm off-white (#F7F7F5) base. Not pure white — pure white feels clinical. Cards are #FFFFFF on top. The slight difference creates depth without visual noise.

**Progressive disclosure** — home screen shows two numbers only. Every drill-down is a deliberate tap. No data dumps.

**Two colors for money** — red (#D64040) for spend, green (#1E8A4A) for invest. Nothing else uses these colors. When you see red, it's spending. Period.

**One accent** — blue (#2C6BED) for buttons, links, active states only. Nothing else is blue. One accent means the CTA is always obvious.

**Monospace for amounts** — DMSans-Regular for rupee amounts prevents layout jumps as numbers change.
