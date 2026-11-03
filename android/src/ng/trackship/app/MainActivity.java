package ng.trackship.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowInsets;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingBackup;
    private static final String ORIGIN = "https://appassets.trackship.ng";
    private static final int OPEN_BACKUP = 10, SAVE_BACKUP = 11;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        if (android.os.Build.VERSION.SDK_INT >= 35) {
            web.setOnApplyWindowInsetsListener((v,insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(bars.left,bars.top,bars.right,bars.bottom);
                return insets;
            });
        }
        web.setBackgroundColor(0xfff1f0ee);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setSupportMultipleWindows(false);
        web.addJavascriptInterface(new Bridge(), "TrackShip");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri uri=req.getUrl();
                if (ORIGIN.equals(uri.getScheme()+"://"+uri.getAuthority())) {
                    String p=uri.getPath();
                    if (p==null || p.equals("/")) p="/index.html";
                    if (!p.equals("/index.html")&&!p.equals("/app.js")&&!p.equals("/core.mjs")&&!p.equals("/style.css")&&!p.equals("/assets/courier.svg")&&!p.equals("/assets/route.svg")&&!p.equals("/assets/courier-photo.png")&&!p.equals("/assets/Poppins-Regular.ttf")&&!p.equals("/assets/Poppins-Medium.ttf")&&!p.equals("/assets/Poppins-SemiBold.ttf"))
                        return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",new HashMap<>(),new ByteArrayInputStream(new byte[0]));
                    try {
                        String mime=p.endsWith(".ttf")?"font/ttf":p.endsWith(".png")?"image/png":p.endsWith(".svg")?"image/svg+xml":p.endsWith(".html")?"text/html":p.endsWith(".css")?"text/css":"text/javascript";
                        Map<String,String> headers=new HashMap<>();
                        headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src https:; img-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'none'");
                        return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,getAssets().open("web"+p));
                    } catch (Exception e) {return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
                }
                return null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req) {
                // Never load remote pages inside the WebView which has the native bridge.
                if (req.isForMainFrame()) { openExternal(req.getUrl().toString()); return true; }
                return false;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if(fileCallback!=null)fileCallback.onReceiveValue(null);
                fileCallback=callback;
                Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);
                try {startActivityForResult(i,OPEN_BACKUP);}catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;}
                return true;
            }
        });
        web.loadUrl(ORIGIN+"/index.html");
    }
    private void openExternal(String url) {
        try {Uri u=Uri.parse(url);if("tel".equals(u.getScheme())){startActivity(new Intent(Intent.ACTION_DIAL,u));return;}if(!"https".equals(u.getScheme()))return;startActivity(new Intent(Intent.ACTION_VIEW,u));}
        catch(Exception e){Toast.makeText(this,"No browser is available to open this link.",Toast.LENGTH_LONG).show();}
    }
    private class Bridge {
        @JavascriptInterface public void share(String text) {
            if(text==null||text.length()>10000)return;
            runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_SEND);i.setType("text/plain");i.putExtra(Intent.EXTRA_TEXT,text);startActivity(Intent.createChooser(i,"Share delivery update"));});
        }
        @JavascriptInterface public void openUrl(String url){runOnUiThread(()->openExternal(url));}
        @JavascriptInterface public void exportBackup(String json,String name){
            if(json==null||json.length()>5000000)return;
            runOnUiThread(()->{pendingBackup=json;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/json");i.putExtra(Intent.EXTRA_TITLE,"TrackShip-backup.json");try{startActivityForResult(i,SAVE_BACKUP);}catch(Exception e){pendingBackup=null;Toast.makeText(MainActivity.this,"No file manager is available.",Toast.LENGTH_LONG).show();}});
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent intent) {
        super.onActivityResult(request,result,intent);
        if(request==OPEN_BACKUP&&fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&intent!=null&&intent.getData()!=null?new Uri[]{intent.getData()}:null);fileCallback=null;}
        if(request==SAVE_BACKUP){if(result==RESULT_OK&&intent!=null&&intent.getData()!=null&&pendingBackup!=null){try(OutputStream out=getContentResolver().openOutputStream(intent.getData())){out.write(pendingBackup.getBytes(StandardCharsets.UTF_8));Toast.makeText(this,"Backup saved. Keep this file private.",Toast.LENGTH_LONG).show();}catch(Exception e){Toast.makeText(this,"Could not save backup.",Toast.LENGTH_LONG).show();}}pendingBackup=null;}
    }
    @Override public void onBackPressed(){web.evaluateJavascript("window.TrackShipBack?.()",null);}
    @Override protected void onDestroy(){if(fileCallback!=null)fileCallback.onReceiveValue(null);web.removeJavascriptInterface("TrackShip");web.destroy();super.onDestroy();}
}
