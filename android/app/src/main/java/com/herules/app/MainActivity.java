package com.herules.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final String TAG = "HerRulesWebView";
    private static final int REQ_WEB_CAMERA = 41;
    private static final int REQ_FILE_CAMERA = 42;
    private static final int REQ_FILE = 43;

    private WebView webView;
    private ProgressBar progress;
    private PermissionRequest pendingPermissionRequest;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraImageUri;
    private boolean pendingFileCapture;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        progress = findViewById(R.id.progress);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        // Content access is needed for camera/gallery results returned by the file chooser.
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSavePassword(false);
        settings.setSaveFormData(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new HerWebViewClient());
        webView.setWebChromeClient(new HerChromeClient());

        if (savedInstanceState == null) {
            Uri data = getIntent().getData();
            if (data != null && BuildConfig.APP_HOST.equals(data.getHost())) {
                webView.loadUrl(data.toString());
            } else {
                webView.loadUrl(BuildConfig.APP_URL);
            }
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri data = intent.getData();
        if (data != null && BuildConfig.APP_HOST.equals(data.getHost())) {
            webView.loadUrl(data.toString());
        }
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
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    private boolean isAllowedInternalHost(String host) {
        if (BuildConfig.APP_HOST.equals(host)) return true;
        // Sign-in providers must stay inside the WebView so their cookies and redirects
        // remain in the same cookie jar as the app.
        return "accounts.google.com".equals(host)
                || "www.google.com".equals(host)
                || "oauth2.googleapis.com".equals(host)
                || "appleid.apple.com".equals(host);
    }

    private boolean handleUrl(WebView view, Uri uri) {
        if (uri == null || uri.getScheme() == null) return false;
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if ("https".equals(scheme) && isAllowedInternalHost(host)) return false;
        if ("about".equals(scheme) || "data".equals(scheme)) return false;

        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (intent.resolveActivity(getPackageManager()) != null) {
            startActivity(intent);
        }
        return true;
    }

    private final class HerWebViewClient extends WebViewClient {
        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUrl(view, Uri.parse(url));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(view, request.getUrl());
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, android.webkit.SslError error) {
            handler.cancel();
            Toast.makeText(MainActivity.this, R.string.ssl_error, Toast.LENGTH_LONG).show();
        }
    }

    private final class HerChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            if (newProgress >= 100) {
                progress.setVisibility(View.GONE);
            } else {
                progress.setProgress(newProgress);
                progress.setVisibility(View.VISIBLE);
            }
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            final String[] requested = request.getResources();
            List<String> allowed = new ArrayList<>();
            for (String resource : requested) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) allowed.add(resource);
            }
            if (allowed.isEmpty()) {
                request.deny();
                return;
            }
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                request.grant(allowed.toArray(new String[0]));
            } else {
                pendingPermissionRequest = request;
                requestPermissions(new String[] { Manifest.permission.CAMERA }, REQ_WEB_CAMERA);
            }
        }

        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
            cancelPendingFileChooser();
            filePathCallback = callback;
            final boolean capture = params.isCaptureEnabled();
            if (capture && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                pendingFileCapture = true;
                requestPermissions(new String[] { Manifest.permission.CAMERA }, REQ_FILE_CAMERA);
                return true;
            }
            launchFileChooser(capture);
            return true;
        }

        @Override
        public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, message.message() + " @ " + message.source() + ":" + message.lineNumber());
            }
            return true;
        }
    }

    private void launchFileChooser(boolean capture) {
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.setType("image/*");
        pick.addCategory(Intent.CATEGORY_OPENABLE);

        Intent[] initial = new Intent[0];
        if (capture) {
            cameraImageUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, new android.content.ContentValues());
            if (cameraImageUri != null) {
                Intent take = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                take.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
                take.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                initial = new Intent[] { take };
            }
        }

        Intent chooser = Intent.createChooser(pick, getString(R.string.file_chooser_title));
        if (initial.length > 0) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, initial);
        startActivityForResult(chooser, REQ_FILE);
    }

    private void discardCameraImage() {
        if (cameraImageUri != null) {
            try {
                getContentResolver().delete(cameraImageUri, null, null);
            } catch (Exception ignored) {
                // The temporary image may already be gone.
            }
            cameraImageUri = null;
        }
    }

    private void cancelPendingFileChooser() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        pendingFileCapture = false;
        discardCameraImage();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                results = new Uri[] { data.getData() };
            } else if (cameraImageUri != null) {
                results = new Uri[] { cameraImageUri };
            }
        }
        if (results == null) {
            discardCameraImage();
        } else {
            cameraImageUri = null;
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_WEB_CAMERA) {
            if (pendingPermissionRequest != null) {
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    String[] granted = { PermissionRequest.RESOURCE_VIDEO_CAPTURE };
                    pendingPermissionRequest.grant(granted);
                } else {
                    pendingPermissionRequest.deny();
                }
                pendingPermissionRequest = null;
            }
            return;
        }
        if (requestCode == REQ_FILE_CAMERA) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED && pendingFileCapture) {
                pendingFileCapture = false;
                launchFileChooser(true);
            } else {
                cancelPendingFileChooser();
            }
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }
}
