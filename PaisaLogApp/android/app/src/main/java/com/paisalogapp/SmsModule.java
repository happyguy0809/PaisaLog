package com.paisalogapp;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import android.database.Cursor;
import android.net.Uri;
import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;

public class SmsModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    public SmsModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        SmsReceiver.setReactContext(context);
    }

    @Override
    public String getName() { return "SmsModule"; }

    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(Integer count) {}

    @ReactMethod
    public void getRecentSms(int maxCount, Promise promise) {
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_SMS)
                != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED", "READ_SMS not granted");
            return;
        }
        try {
            WritableArray results = Arguments.createArray();
            Uri uri = Uri.parse("content://sms/inbox");
            String[] projection = {"address", "body", "date"};

            // No LIMIT in sortOrder — it silently breaks on most devices
            // Use "date DESC" only, cap manually below
            Cursor cursor = reactContext.getContentResolver()
                .query(uri, projection, null, null, "date DESC");

            if (cursor != null) {
                int count = 0;
                while (cursor.moveToNext() && count < maxCount) {
                    String sender = cursor.getString(cursor.getColumnIndexOrThrow("address"));
                    String body   = cursor.getString(cursor.getColumnIndexOrThrow("body"));
                    long   date   = cursor.getLong(cursor.getColumnIndexOrThrow("date"));

                    if (body == null || body.length() < 10) continue;

                    // Skip OTPs — only filter that belongs in Java
                    String upper = body.toUpperCase();
                    if (upper.contains("OTP") || upper.contains("ONE TIME PASSWORD")) continue;

                    // Return ALL non-OTP SMS — let JS decide what is financial
                    // (JS has is_financial_sender which is more comprehensive)
                    WritableMap sms = Arguments.createMap();
                    sms.putString("sender",    sender != null ? sender : "");
                    sms.putString("body",      body);
                    sms.putDouble("timestamp", (double) date); // ms since epoch
                    results.pushMap(sms);
                    count++;
                }
                cursor.close();
            }
            promise.resolve(results);
        } catch (Exception e) {
            promise.reject("READ_ERROR", e.getMessage());
        }
    }
}
