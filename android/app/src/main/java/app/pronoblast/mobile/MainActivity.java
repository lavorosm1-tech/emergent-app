package app.pronoblast.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin nativo per scaricare e installare un APK nuovo (stesso di GymBuilder).
        // Registrato PRIMA di super.onCreate, altrimenti il bridge non lo vede.
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
