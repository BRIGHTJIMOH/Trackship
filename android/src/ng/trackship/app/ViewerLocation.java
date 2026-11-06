package ng.trackship.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import org.json.JSONObject;

// Foreground, one-shot viewer position. No service, HTTP, session or shipment references.
final class ViewerLocation implements LocationListener {
    static final int PERMISSION_REQUEST=17;
    interface Callback { void deliver(String id,JSONObject result); }
    private final Activity activity;
    private final Callback callback;
    private final LocationManager manager;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private String pending;
    private CancellationSignal cancellation;
    private LocationListener legacyListener;
    private final Runnable timeout=()->finishError(3);
    ViewerLocation(Activity activity,Callback callback){this.activity=activity;this.callback=callback;manager=(LocationManager)activity.getSystemService(Activity.LOCATION_SERVICE);}
    void request(String id){
        if(id==null||!id.matches("[a-f0-9-]{36}"))return;
        if(pending!=null)finishError(2);
        pending=id;
        if(!permitted())activity.requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},PERMISSION_REQUEST);
        else locate();
    }
    private boolean permitted(){return activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
    void permissionResult(){if(pending==null)return;if(permitted())locate();else finishError(1);}
    private void locate(){
        if(pending==null||cancellation!=null||legacyListener!=null)return;
        if(manager==null){finishError(2);return;}
        handler.postDelayed(timeout,15000);
        try{
            String provider=null;
            // Honour approximate permission. Do not require a precise fix to show the viewer.
            if(activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED&&manager.isProviderEnabled(LocationManager.GPS_PROVIDER))provider=LocationManager.GPS_PROVIDER;
            else if(manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))provider=LocationManager.NETWORK_PROVIDER;
            else if(android.os.Build.VERSION.SDK_INT>=31&&manager.isProviderEnabled(LocationManager.FUSED_PROVIDER))provider=LocationManager.FUSED_PROVIDER;
            if(provider==null){finishError(2);return;}
            final String requestId=pending;
            if(android.os.Build.VERSION.SDK_INT>=30){cancellation=new CancellationSignal();manager.getCurrentLocation(provider,cancellation,activity.getMainExecutor(),location->{if(requestId.equals(pending))onLocationChanged(location);});}
            else {
                legacyListener=new LocationListener(){
                    @Override public void onLocationChanged(Location location){if(requestId.equals(pending))ViewerLocation.this.onLocationChanged(location);}
                    @Override public void onProviderDisabled(String provider){if(requestId.equals(pending))finishError(2);}
                    @Override public void onProviderEnabled(String provider){}
                    @Override public void onStatusChanged(String provider,int status,Bundle extras){}
                };
                manager.requestSingleUpdate(provider,legacyListener,Looper.getMainLooper());
            }
        }catch(SecurityException error){finishError(1);}catch(Exception error){finishError(2);}
    }
    @Override public void onLocationChanged(Location location){
        if(pending==null)return;
        if(location==null){finishError(2);return;}
        long age=(SystemClock.elapsedRealtimeNanos()-location.getElapsedRealtimeNanos())/1000000;
        if(age<0||age>30000||!location.hasAccuracy()){finishError(2);return;}
        JSONObject result=new JSONObject();try{result.put("ok",true);result.put("lat",location.getLatitude());result.put("lng",location.getLongitude());result.put("accuracy",location.getAccuracy());}catch(Exception error){finishError(2);return;}
        finish(result);
    }
    @Override public void onProviderDisabled(String provider){if(pending!=null)finishError(2);}
    @Override public void onProviderEnabled(String provider){}
    @Override public void onStatusChanged(String provider,int status,Bundle extras){}
    private void finishError(int code){if(pending==null)return;JSONObject result=new JSONObject();try{result.put("ok",false);result.put("code",code);}catch(Exception ignored){}finish(result);}
    private void finish(JSONObject result){String id=pending;if(id==null)return;cancel(id);callback.deliver(id,result);}
    void cancel(String id){if(pending==null||id!=null&&!pending.equals(id))return;pending=null;handler.removeCallbacks(timeout);if(cancellation!=null){cancellation.cancel();cancellation=null;}try{if(manager!=null&&legacyListener!=null)manager.removeUpdates(legacyListener);}catch(Exception ignored){}legacyListener=null;}
    void destroy(){cancel(null);}
}
