package com.sevenwaves.erp;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        /*
         * Force edge-to-edge layout so the Capacitor WebView draws behind
         * the status bar (top) AND the navigation bar (bottom).
         *
         * Without this call the OS clips the WebView above the system
         * navigation bar, leaving a blank grey strip below our bottom tab bar.
         *
         * CSS env(safe-area-inset-top/bottom) + viewport-fit=cover (set in
         * index.html) handle the safe zones inside the WebView.
         *
         * Required even on Android 15 (API 35) because Capacitor's
         * BridgeActivity does not guarantee this call on its own.
         */
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
