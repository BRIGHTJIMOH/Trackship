package ng.trackship.app;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.IBinder;
import android.os.SystemClock;
import java.io.OutputStream;
import java.io.InputStream;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

public class TrackingService extends Service implements LocationListener {
    public static final String STOP="ng.trackship.app.STOP_TRACKING";
    private static final String CHANNEL="trackship-delivery-gps";
    private LocationManager manager;
    private String base,job,session,code;
    private volatile boolean stopped=false;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService checks=Executors.newSingleThreadScheduledExecutor();
    private final AtomicBoolean uploading=new AtomicBoolean(false);
    @Override public void onCreate(){super.onCreate();NotificationManager nm=getSystemService(NotificationManager.class);nm.createNotificationChannel(new NotificationChannel(CHANNEL,"Active delivery GPS",NotificationManager.IMPORTANCE_LOW));manager=(LocationManager)getSystemService(LOCATION_SERVICE);checks.scheduleWithFixedDelay(()->checkActiveDeliveries(),30,30,TimeUnit.SECONDS);}
    private Notification notification(String message){
        Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openIntent=PendingIntent.getActivity(this,12,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_brand_notification).setContentTitle("SendRack · delivery GPS is on").setContentText(message).setContentIntent(openIntent).setOngoing(true).build();
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null||STOP.equals(intent.getAction())){stopSelf();return START_NOT_STICKY;}
        base=intent.getStringExtra("base");job=intent.getStringExtra("job");session=intent.getStringExtra("session");code=intent.getStringExtra("code");
        if(base==null||!base.startsWith("https://")||job==null||!job.matches("[a-f0-9]{64}")||session==null||!session.matches("[a-f0-9]{64}")){stopSelf();return START_NOT_STICKY;}
        try{
            if(android.os.Build.VERSION.SDK_INT>=29)startForeground(31,notification("Waiting for location · active deliveries"),ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);else startForeground(31,notification("Waiting for location · active deliveries"));
            getSharedPreferences("trackship-gps",MODE_PRIVATE).edit().putBoolean("active",true).apply();
            manager.removeUpdates(this);
            boolean enabled=false;
            for(String provider:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER}){
                if(manager.isProviderEnabled(provider)){manager.requestLocationUpdates(provider,10000L,10f,this);enabled=true;Location last=manager.getLastKnownLocation(provider);if(last!=null&&SystemClock.elapsedRealtimeNanos()-last.getElapsedRealtimeNanos()<30000000000L)onLocationChanged(last);}
            }
            if(!enabled){getSystemService(NotificationManager.class).notify(31,notification("Turn on your phone’s location services"));}
        }catch(SecurityException e){stopSelf();}
        return START_NOT_STICKY;
    }
    @Override public void onLocationChanged(Location location){
        if(stopped||!location.hasAccuracy()||SystemClock.elapsedRealtimeNanos()-location.getElapsedRealtimeNanos()>30000000000L||!uploading.compareAndSet(false,true))return;
        worker.submit(()->{HttpsURLConnection connection=null;try{
            URL url=new URL(base+"/api/v3/rider/location");connection=(HttpsURLConnection)url.openConnection();connection.setRequestMethod("POST");connection.setConnectTimeout(15000);connection.setReadTimeout(15000);connection.setDoOutput(true);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Authorization","Bearer "+session);
            JSONObject payload=new JSONObject();payload.put("lat",location.getLatitude());payload.put("lng",location.getLongitude());payload.put("accuracy",location.getAccuracy());payload.put("observedAt",location.getTime());
            byte[] bytes=payload.toString().getBytes(StandardCharsets.UTF_8);try(OutputStream output=connection.getOutputStream()){output.write(bytes);}
            int response=connection.getResponseCode();if(response>=200&&response<300){try(InputStream in=connection.getInputStream()){JSONObject state=new JSONObject(new String(readResponse(in),StandardCharsets.UTF_8));if(state.optInt("tracked",0)==0){stopSelf();return;}}}if(response==401||response==403||response==409){stopSelf();return;}
            String message=response>=200&&response<300?"Automatic location · active deliveries":"Waiting for service connection";if(!stopped)getSystemService(NotificationManager.class).notify(31,notification(message));
        }catch(Exception e){if(!stopped)getSystemService(NotificationManager.class).notify(31,notification("Waiting for internet"));}finally{if(connection!=null)connection.disconnect();uploading.set(false);}});
    }
    private byte[] readResponse(InputStream in) throws java.io.IOException{java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[1024];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>65536)throw new java.io.IOException("Response too large");out.write(buffer,0,n);}return out.toByteArray();}
    private void checkActiveDeliveries(){
        if(stopped||base==null||session==null)return;
        HttpsURLConnection c=null;try{
            c=(HttpsURLConnection)new URL(base+"/api/v3/rider/location").openConnection();c.setRequestMethod("POST");c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setDoOutput(true);c.setInstanceFollowRedirects(false);c.setRequestProperty("Authorization","Bearer "+session);c.setRequestProperty("Content-Type","application/json");
            try(OutputStream out=c.getOutputStream()){out.write("{\"start\":true}".getBytes(StandardCharsets.UTF_8));}
            int status=c.getResponseCode();if(status==401||status==403){stopSelf();return;}if(status>=200&&status<300)try(InputStream in=c.getInputStream()){JSONObject state=new JSONObject(new String(readResponse(in),StandardCharsets.UTF_8));if(state.optInt("tracked",0)==0)stopSelf();}
        }catch(Exception ignored){}finally{if(c!=null)c.disconnect();}
    }
    @Override public void onStatusChanged(String provider,int status,Bundle extras){}
    @Override public void onProviderEnabled(String provider){}
    @Override public void onProviderDisabled(String provider){getSystemService(NotificationManager.class).notify(31,notification("Location service paused"));}
    @Override public void onDestroy(){stopped=true;if(base!=null&&job!=null&&session!=null)new Thread(()->{HttpsURLConnection c=null;try{c=(HttpsURLConnection)new URL(base+"/api/v3/rider/location").openConnection();c.setRequestMethod("POST");c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setDoOutput(true);c.setInstanceFollowRedirects(false);c.setRequestProperty("Authorization","Bearer "+session);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write("{\"stop\":true}".getBytes(StandardCharsets.UTF_8));}c.getResponseCode();}catch(Exception ignored){}finally{if(c!=null)c.disconnect();}}).start();if(manager!=null)try{manager.removeUpdates(this);}catch(SecurityException ignored){}checks.shutdownNow();worker.shutdownNow();getSharedPreferences("trackship-gps",MODE_PRIVATE).edit().putBoolean("active",false).apply();stopForeground(true);super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
