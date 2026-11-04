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
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

public class TrackingService extends Service implements LocationListener {
    public static final String STOP="ng.trackship.app.STOP_TRACKING";
    private static final String CHANNEL="trackship-delivery-gps";
    private LocationManager manager;
    private String base,job,session,code;
    private volatile boolean stopped=false;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final AtomicBoolean uploading=new AtomicBoolean(false);
    @Override public void onCreate(){super.onCreate();NotificationManager nm=getSystemService(NotificationManager.class);nm.createNotificationChannel(new NotificationChannel(CHANNEL,"Active delivery GPS",NotificationManager.IMPORTANCE_LOW));manager=(LocationManager)getSystemService(LOCATION_SERVICE);}
    private Notification notification(String message){
        Intent stop=new Intent(this,TrackingService.class).setAction(STOP);
        Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent stopIntent=PendingIntent.getService(this,11,stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        PendingIntent openIntent=PendingIntent.getActivity(this,12,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_brand_notification).setContentTitle("SendRack · delivery GPS is on").setContentText(message).setContentIntent(openIntent).setOngoing(true).addAction(new Notification.Action.Builder(android.R.drawable.ic_media_pause,"Stop sharing",stopIntent).build()).build();
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null||STOP.equals(intent.getAction())){stopSelf();return START_NOT_STICKY;}
        base=intent.getStringExtra("base");job=intent.getStringExtra("job");session=intent.getStringExtra("session");code=intent.getStringExtra("code");
        if(base==null||!base.startsWith("https://")||job==null||!job.matches("[a-f0-9]{64}")||session==null||!session.matches("[a-f0-9]{64}")){stopSelf();return START_NOT_STICKY;}
        try{
            if(android.os.Build.VERSION.SDK_INT>=29)startForeground(31,notification("Waiting for GPS · "+code),ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);else startForeground(31,notification("Waiting for GPS · "+code));
            getSharedPreferences("trackship-gps",MODE_PRIVATE).edit().putBoolean("active",true).apply();
            manager.removeUpdates(this);
            boolean enabled=false;
            for(String provider:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER}){
                if(manager.isProviderEnabled(provider)){manager.requestLocationUpdates(provider,10000L,10f,this);enabled=true;Location last=manager.getLastKnownLocation(provider);if(last!=null&&SystemClock.elapsedRealtimeNanos()-last.getElapsedRealtimeNanos()<30000000000L)onLocationChanged(last);}
            }
            if(!enabled){getSystemService(NotificationManager.class).notify(31,notification("Turn on your phone’s location services · "+code));}
        }catch(SecurityException e){stopSelf();}
        return START_NOT_STICKY;
    }
    @Override public void onLocationChanged(Location location){
        if(stopped||!location.hasAccuracy()||SystemClock.elapsedRealtimeNanos()-location.getElapsedRealtimeNanos()>30000000000L||!uploading.compareAndSet(false,true))return;
        worker.submit(()->{HttpsURLConnection connection=null;try{
            URL url=new URL(base+"/api/v3/jobs/"+job+"/location");connection=(HttpsURLConnection)url.openConnection();connection.setRequestMethod("POST");connection.setConnectTimeout(15000);connection.setReadTimeout(15000);connection.setDoOutput(true);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Authorization","Bearer "+session);
            JSONObject payload=new JSONObject();payload.put("lat",location.getLatitude());payload.put("lng",location.getLongitude());payload.put("accuracy",location.getAccuracy());
            byte[] bytes=payload.toString().getBytes(StandardCharsets.UTF_8);try(OutputStream output=connection.getOutputStream()){output.write(bytes);}
            int response=connection.getResponseCode();if(response==401||response==403||response==409){stopSelf();return;}
            String message=response>=200&&response<300?"Live GPS sharing · "+code:"Waiting for service connection · "+code;if(!stopped)getSystemService(NotificationManager.class).notify(31,notification(message));
        }catch(Exception e){if(!stopped)getSystemService(NotificationManager.class).notify(31,notification("Waiting for internet · "+code));}finally{if(connection!=null)connection.disconnect();uploading.set(false);}});
    }
    @Override public void onStatusChanged(String provider,int status,Bundle extras){}
    @Override public void onProviderEnabled(String provider){}
    @Override public void onProviderDisabled(String provider){getSystemService(NotificationManager.class).notify(31,notification("Location service paused · "+code));}
    @Override public void onDestroy(){stopped=true;if(base!=null&&job!=null&&session!=null)new Thread(()->{HttpsURLConnection c=null;try{c=(HttpsURLConnection)new URL(base+"/api/v3/jobs/"+job+"/location").openConnection();c.setRequestMethod("POST");c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setDoOutput(true);c.setInstanceFollowRedirects(false);c.setRequestProperty("Authorization","Bearer "+session);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write("{\"stop\":true}".getBytes(StandardCharsets.UTF_8));}c.getResponseCode();}catch(Exception ignored){}finally{if(c!=null)c.disconnect();}}).start();if(manager!=null)try{manager.removeUpdates(this);}catch(SecurityException ignored){}worker.shutdownNow();getSharedPreferences("trackship-gps",MODE_PRIVATE).edit().putBoolean("active",false).apply();stopForeground(true);super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
