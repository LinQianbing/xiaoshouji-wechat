package com.meishuixing.xiaoshouji;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://mei-shui-xing.github.io/xiaoshouji-wechat/";
    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);

        webView.addJavascriptInterface(new AndroidBridge(this), "XiaoshoujiAndroid");
        webView.setWebViewClient(new AppWebViewClient());
        webView.setWebChromeClient(new AppWebChromeClient());

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (fileChooserCallback != null) {
                fileChooserCallback.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                );
                fileChooserCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private class AppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (
                "https".equalsIgnoreCase(uri.getScheme())
                    && "mei-shui-xing.github.io".equalsIgnoreCase(uri.getHost())
                    && uri.getPath().startsWith("/xiaoshouji-wechat/")
            ) {
                return false;
            }
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        }
    }

    private class AppWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
            WebView view,
            ValueCallback<Uri[]> callback,
            FileChooserParams fileChooserParams
        ) {
            if (fileChooserCallback != null) {
                fileChooserCallback.onReceiveValue(null);
            }
            fileChooserCallback = callback;
            try {
                startActivityForResult(fileChooserParams.createIntent(), FILE_CHOOSER_REQUEST);
            } catch (Exception error) {
                fileChooserCallback = null;
                Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                return false;
            }
            return true;
        }
    }

    private static class AndroidBridge {
        private final Context context;

        AndroidBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public void saveTextFile(String requestedName, String content) {
            String fileName = sanitizeFileName(requestedName);
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            try {
                String location = saveToDownloads(fileName, bytes);
                showToast("数据已导出到 " + location);
            } catch (Exception error) {
                showToast("导出失败：" + error.getMessage());
            }
        }

        private String saveToDownloads(String fileName, byte[] bytes) throws Exception {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = context.getContentResolver().insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    values
                );
                if (uri == null) throw new IllegalStateException("无法创建下载文件");
                try (OutputStream output = context.getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new IllegalStateException("无法写入下载文件");
                    output.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                context.getContentResolver().update(uri, values, null, null);
                return "下载/" + fileName;
            }

            File downloads = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (downloads == null) throw new IllegalStateException("找不到下载目录");
            if (!downloads.exists() && !downloads.mkdirs()) {
                throw new IllegalStateException("无法创建下载目录");
            }
            File target = new File(downloads, fileName);
            try (OutputStream output = new FileOutputStream(target)) {
                output.write(bytes);
            }
            return target.getAbsolutePath();
        }

        private static String sanitizeFileName(String requestedName) {
            String name = requestedName == null ? "" : requestedName.trim();
            if (name.isEmpty()) name = "xiaoshouji-data.json";
            name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            return name.endsWith(".json") ? name : name + ".json";
        }

        private void showToast(String text) {
            ((Activity) context).runOnUiThread(
                () -> Toast.makeText(context, text, Toast.LENGTH_LONG).show()
            );
        }
    }
}
