package kr.ibetter.focusai;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new PdfSaveBridge(this), "FocusAiAndroid");
    }

    public static class PdfSaveBridge {
        private final Context context;

        PdfSaveBridge(Context context) {
            this.context = context.getApplicationContext();
        }

        @JavascriptInterface
        public String savePdf(String filename, String base64Pdf) {
            try {
                String safeFilename = sanitizeFilename(filename);
                byte[] pdfBytes = Base64.decode(base64Pdf, Base64.DEFAULT);

                if (pdfBytes.length == 0) {
                    return result(false, "PDF data is empty.");
                }

                Uri uri = saveToDownloads(safeFilename, pdfBytes);
                return result(true, uri.toString());
            } catch (Exception error) {
                return result(false, error.getMessage() == null ? "Failed to save PDF." : error.getMessage());
            }
        }

        private Uri saveToDownloads(String filename, byte[] pdfBytes) throws IOException {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = context.getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    throw new IOException("Unable to create a download entry.");
                }

                try (OutputStream outputStream = resolver.openOutputStream(uri)) {
                    if (outputStream == null) {
                        throw new IOException("Unable to open the download entry.");
                    }
                    outputStream.write(pdfBytes);
                }

                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
                return uri;
            }

            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!downloadsDir.exists() && !downloadsDir.mkdirs()) {
                throw new IOException("Unable to create the downloads directory.");
            }

            File outputFile = new File(downloadsDir, filename);
            try (OutputStream outputStream = new FileOutputStream(outputFile)) {
                outputStream.write(pdfBytes);
            }
            return Uri.fromFile(outputFile);
        }

        private static String sanitizeFilename(String filename) {
            String normalized = filename == null ? "" : filename.trim();
            if (normalized.isEmpty()) {
                normalized = "focusai-report.pdf";
            }
            normalized = normalized.replaceAll("[\\\\/:*?\"<>|]", "_");
            return normalized.toLowerCase().endsWith(".pdf") ? normalized : normalized + ".pdf";
        }

        private static String result(boolean ok, String value) {
            String key = ok ? "uri" : "error";
            return "{\"ok\":" + ok + ",\"" + key + "\":\"" + escapeJson(value) + "\"}";
        }

        private static String escapeJson(String value) {
            if (value == null) {
                return "";
            }

            return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
        }
    }
}
