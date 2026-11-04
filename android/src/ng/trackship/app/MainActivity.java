package ng.trackship.app;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.view.View;
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
    private Intent pendingTracking;
    private boolean documentFlow=false,needsReauth=false;
    private static final int GPS_PERMISSION=15,ALERT_PERMISSION=16;
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
        // Refresh packaged screens on upgrade without touching DOM storage or identity keys.
        String appVersion="unknown";
        try {appVersion=getPackageManager().getPackageInfo(getPackageName(),0).versionName;}catch(Exception ignored){}
        android.content.SharedPreferences assets=getSharedPreferences("sendrack-asset-version",MODE_PRIVATE);
        if(!appVersion.equals(assets.getString("version",null))){web.clearCache(true);assets.edit().putString("version",appVersion).apply();}
        web.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setSupportMultipleWindows(false);
        web.addJavascriptInterface(new Bridge(), "TrackShip");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view,String url){if(getIntent().getBooleanExtra("open-rider-alerts",false)){getIntent().removeExtra("open-rider-alerts");view.evaluateJavascript("window.TrackShipOpenAlerts?.()",null);}}

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri uri=req.getUrl();
                if (ORIGIN.equals(uri.getScheme()+"://"+uri.getAuthority())) {
                    String p=uri.getPath();
                    if (p==null || p.equals("/")) p="/index.html";
                    if (!p.equals("/sendrack-entry.html")&&!p.equals("/sendrack-main.js")&&!p.equals("/sendrack-ui.css")&&!p.equals("/index.html")&&!p.equals("/app.js")&&!p.equals("/core.mjs")&&!p.equals("/lifecycle.mjs")&&!p.equals("/features.mjs")&&!p.equals("/config.mjs")&&!p.equals("/accounts.mjs")&&!p.equals("/identity.mjs")&&!p.equals("/style.css")&&!p.equals("/assets/courier.svg")&&!p.equals("/assets/route.svg")&&!p.equals("/assets/sendrack-mark.svg")&&!p.equals("/assets/courier-photo.png")&&!p.equals("/assets/Poppins-Regular.ttf")&&!p.equals("/assets/Inter.ttf")&&!p.equals("/assets/Poppins-Medium.ttf")&&!p.equals("/assets/Poppins-SemiBold.ttf")&&!p.equals("/assets/leaflet.js")&&!p.equals("/assets/leaflet.css"))
                        return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",new HashMap<>(),new ByteArrayInputStream(new byte[0]));
                    try {
                        String mime=p.endsWith(".ttf")?"font/ttf":p.endsWith(".png")?"image/png":p.endsWith(".svg")?"image/svg+xml":p.endsWith(".html")?"text/html":p.endsWith(".css")?"text/css":"text/javascript";
                        Map<String,String> headers=new HashMap<>();
                        headers.put("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
                        headers.put("Pragma","no-cache");
                        headers.put("Expires","0");
                        headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src https:; img-src 'self' data: https://tile.openstreetmap.org; frame-src 'none'; object-src 'none'; base-uri 'none'");
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
                Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("*/*");i.addCategory(Intent.CATEGORY_OPENABLE);
                try {documentFlow=true;startActivityForResult(i,OPEN_BACKUP);}catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;documentFlow=false;}
                return true;
            }
        });
        web.loadUrl(ORIGIN+"/sendrack-entry.html?build="+appVersion);
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
        @JavascriptInterface public void setNightMode(boolean dark){runOnUiThread(()->{web.setBackgroundColor(dark?0xff181819:0xfff1f0ee);getWindow().setStatusBarColor(dark?0xff181819:0xfff1f0ee);getWindow().setNavigationBarColor(dark?0xff181819:0xffffffff);web.setSystemUiVisibility(dark?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);});}
        @JavascriptInterface public void startTracking(String base,String job,String session,String code){
            if(base==null||job==null||session==null||!job.matches("[a-f0-9]{64}")||!session.matches("[a-f0-9]{64}"))return;
            Uri u=Uri.parse(base);if(!"https".equals(u.getScheme())||u.getUserInfo()!=null||u.getHost()==null||u.getQuery()!=null||u.getFragment()!=null||!(u.getPath()==null||u.getPath().isEmpty()||u.getPath().equals("/")))return;
            runOnUiThread(()->{pendingTracking=new Intent(MainActivity.this,TrackingService.class).putExtra("base",base).putExtra("job",job).putExtra("session",session).putExtra("code",code);
                if((checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED)||(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED))requestPermissions(android.os.Build.VERSION.SDK_INT>=33?new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.POST_NOTIFICATIONS}:new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},GPS_PERMISSION);else beginTracking();});
        }
        @JavascriptInterface public void stopTracking(){runOnUiThread(()->stopService(new Intent(MainActivity.this,TrackingService.class)));}
        @JavascriptInterface public boolean isTracking(){return getSharedPreferences("trackship-gps",MODE_PRIVATE).getBoolean("active",false);}
        private boolean validIdentityAccount(String role,String phone){return role!=null&&role.matches("vendor|rider")&&phone!=null&&phone.matches("0[789][0-9]{9}");}
        @JavascriptInterface public boolean saveAccountIdentity(String role,String phone,String json){return validIdentityAccount(role,phone)&&new IdentityVault(MainActivity.this).save(role+":"+phone,json);}
        @JavascriptInterface public String loadAccountIdentity(String role,String phone){if(!validIdentityAccount(role,phone))return null;IdentityVault vault=new IdentityVault(MainActivity.this);String value=vault.load(role+":"+phone);return value==null&&role.equals("rider")?vault.load(phone):value;}
        @JavascriptInterface public void clearAccountIdentity(String role,String phone){if(validIdentityAccount(role,phone)){IdentityVault vault=new IdentityVault(MainActivity.this);vault.remove(role+":"+phone);if(role.equals("rider"))vault.remove(phone);}}
        @JavascriptInterface public boolean saveIdentity(String phone,String json){return new IdentityVault(MainActivity.this).save(phone,json);}
        @JavascriptInterface public boolean hasIdentity(String phone){return new IdentityVault(MainActivity.this).exists(phone);}
        @JavascriptInterface public String loadIdentity(String phone){return new IdentityVault(MainActivity.this).load(phone);}
        @JavascriptInterface public void clearIdentity(String phone){new IdentityVault(MainActivity.this).remove(phone);}
        @JavascriptInterface public void configureDeliveryAlerts(String base,String token){runOnUiThread(()->{if(!DeliveryAlerts.configure(MainActivity.this,base,token))return;if(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED&&!getSharedPreferences("trackship-alert-permission",MODE_PRIVATE).getBoolean("asked",false)){getSharedPreferences("trackship-alert-permission",MODE_PRIVATE).edit().putBoolean("asked",true).apply();requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},ALERT_PERMISSION);}});}
        @JavascriptInterface public void requestDeliveryAlertsPermission(){runOnUiThread(()->{if(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},ALERT_PERMISSION);});}
        @JavascriptInterface public void clearDeliveryAlerts(){runOnUiThread(()->DeliveryAlerts.clear(MainActivity.this));}
        @JavascriptInterface public void notifyDelivery(String id,String title,String body){runOnUiThread(()->DeliveryAlerts.show(MainActivity.this,id,title,body));}
        @JavascriptInterface public void exportCsv(String csv){if(csv==null||csv.length()>200000)return;runOnUiThread(()->{pendingBackup=csv;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("text/csv");i.putExtra(Intent.EXTRA_TITLE,"SendRack-bulk-template.csv");try{startActivityForResult(i,SAVE_BACKUP);}catch(Exception e){pendingBackup=null;}});}
        @JavascriptInterface public void exportBackup(String json,String name){
            if(json==null||json.length()>5000000)return;
            runOnUiThread(()->{pendingBackup=json;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/json");i.putExtra(Intent.EXTRA_TITLE,"SendRack-backup.json");try{startActivityForResult(i,SAVE_BACKUP);}catch(Exception e){pendingBackup=null;Toast.makeText(MainActivity.this,"No file manager is available.",Toast.LENGTH_LONG).show();}});
        }
    }
    private void beginTracking(){if(pendingTracking==null)return;if(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){pendingTracking=null;Toast.makeText(this,"Allow notifications so GPS sharing has a visible stop control.",Toast.LENGTH_LONG).show();return;}try{startForegroundService(pendingTracking);Toast.makeText(this,"Delivery GPS started. Use the notification to stop sharing.",Toast.LENGTH_LONG).show();}catch(Exception e){Toast.makeText(this,"GPS could not start. Check location permission and try again.",Toast.LENGTH_LONG).show();}pendingTracking=null;}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==GPS_PERMISSION){if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED)beginTracking();else{pendingTracking=null;Toast.makeText(this,"Location permission is needed to share your delivery position.",Toast.LENGTH_LONG).show();}}}
    @Override protected void onActivityResult(int request,int result,Intent intent) {
        super.onActivityResult(request,result,intent);
        documentFlow=false;
        if(request==OPEN_BACKUP&&fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&intent!=null&&intent.getData()!=null?new Uri[]{intent.getData()}:null);fileCallback=null;}
        if(request==SAVE_BACKUP){if(result==RESULT_OK&&intent!=null&&intent.getData()!=null&&pendingBackup!=null){try(OutputStream out=getContentResolver().openOutputStream(intent.getData())){out.write(pendingBackup.getBytes(StandardCharsets.UTF_8));Toast.makeText(this,"Backup saved. Keep this file private.",Toast.LENGTH_LONG).show();}catch(Exception e){Toast.makeText(this,"Could not save backup.",Toast.LENGTH_LONG).show();}}pendingBackup=null;}
    }
    @Override protected void onStop(){
        if(web!=null&&!documentFlow){needsReauth=true;web.setVisibility(View.INVISIBLE);web.evaluateJavascript("window.TrackShipLock?.()",null);}
        super.onStop();
    }
    @Override protected void onStart(){
        super.onStart();
        if(web!=null&&needsReauth){needsReauth=false;web.evaluateJavascript("window.TrackShipLock?.()",value->{if(web!=null)web.setVisibility(View.VISIBLE);});}
        else if(web!=null)web.setVisibility(View.VISIBLE);
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(web!=null&&intent.getBooleanExtra("open-rider-alerts",false)){intent.removeExtra("open-rider-alerts");web.evaluateJavascript("window.TrackShipOpenAlerts?.()",null);}}
    @Override public void onBackPressed(){web.evaluateJavascript("window.TrackShipBack?.()",null);}
    @Override protected void onDestroy(){if(fileCallback!=null)fileCallback.onReceiveValue(null);web.removeJavascriptInterface("TrackShip");web.destroy();super.onDestroy();}
}
