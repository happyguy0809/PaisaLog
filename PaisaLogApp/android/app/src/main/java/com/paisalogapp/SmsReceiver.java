package com.paisalogapp;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

public class SmsReceiver extends BroadcastReceiver {
    private static ReactApplicationContext reactContext;

    public static void setReactContext(ReactApplicationContext context) {
        reactContext = context;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) return;

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        String format  = bundle.getString("format");
        if (pdus == null) return;

        StringBuilder fullBody = new StringBuilder();
        String sender = null;

        for (Object pdu : pdus) {
            SmsMessage msg = SmsMessage.createFromPdu((byte[]) pdu, format);
            if (sender == null) sender = msg.getDisplayOriginatingAddress();
            fullBody.append(msg.getMessageBody());
        }

        String body = fullBody.toString().trim();
        if (body.length() < 20) return;
        if (body.toUpperCase().contains("OTP")) return;
        if (body.toUpperCase().contains("ONE TIME")) return;

        boolean financial = body.contains("debited") || body.contains("credited")
            || body.contains("INR") || body.contains("Rs.")
            || body.contains("Rs ") || (sender != null && sender.matches("^[A-Z]{2}-.*"));
        if (!financial) return;

        if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
            WritableMap params = Arguments.createMap();
            params.putString("sender", sender != null ? sender : "");
            params.putString("body",   body);
            params.putDouble("timestamp", System.currentTimeMillis());
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("on_sms_received", params);
        }
    }
}
