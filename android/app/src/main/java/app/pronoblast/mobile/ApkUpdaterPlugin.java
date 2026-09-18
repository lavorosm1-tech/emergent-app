package app.pronoblast.mobile;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private BroadcastReceiver downloadReceiver;

    @PluginMethod
    public void getCurrentVersion(PluginCall call) {
        try {
            PackageManager packageManager = getContext().getPackageManager();
            android.content.pm.PackageInfo info = packageManager.getPackageInfo(getContext().getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            JSObject result = new JSObject();
            result.put("version", info.versionName);
            result.put("versionCode", versionCode);
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException error) {
            call.reject("Impossibile leggere la versione installata", error);
        }
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject result = new JSObject();
        result.put("allowed", allowed);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "PronoBlast-update.apk");
        if (url == null || !url.startsWith("https://")) {
            call.reject("L'aggiornamento deve usare un URL HTTPS");
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("Aggiornamento PronoBlast");
        request.setDescription("Download della nuova versione in corso");
        request.setMimeType("application/vnd.android.package-archive");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, fileName);
        long downloadId = manager.enqueue(request);

        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != downloadId) return;
                try {
                    DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
                    try (Cursor cursor = manager.query(query)) {
                        if (!cursor.moveToFirst()) throw new IllegalStateException("Download non trovato");
                        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        if (status != DownloadManager.STATUS_SUCCESSFUL) throw new IllegalStateException("Download APK non riuscito");
                    }
                    Uri apkUri = manager.getUriForDownloadedFile(downloadId);
                    if (apkUri == null) throw new IllegalStateException("File APK non disponibile");
                    Intent installer = new Intent(Intent.ACTION_VIEW);
                    installer.setDataAndType(apkUri, "application/vnd.android.package-archive");
                    installer.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    context.startActivity(installer);
                    JSObject result = new JSObject();
                    result.put("started", true);
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject("Impossibile installare l'aggiornamento", error);
                } finally {
                    unregisterDownloadReceiver();
                }
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(downloadReceiver, filter);
        }
    }

    private void unregisterDownloadReceiver() {
        if (downloadReceiver == null) return;
        try {
            getContext().unregisterReceiver(downloadReceiver);
        } catch (IllegalArgumentException ignored) {
            // Receiver già rimosso.
        }
        downloadReceiver = null;
    }

    @Override
    protected void handleOnDestroy() {
        unregisterDownloadReceiver();
    }
}
