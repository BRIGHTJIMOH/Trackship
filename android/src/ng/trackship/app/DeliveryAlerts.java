package ng.trackship.app;
import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import java.util.HashSet;
import java.util.Set;

public final class DeliveryAlerts {
 public static final int JOB=241;
 private static final String PREF="trackship-delivery-alerts",CHANNEL="nearby-deliveries";
 public static boolean configure(Context c,String base,String token){
  try{Uri u=Uri.parse(base);if(!"https".equals(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null||!(u.getPath()==null||u.getPath().isEmpty())||token==null||!token.matches("[a-f0-9]{64}"))return false;
   android.content.SharedPreferences prefs=c.getSharedPreferences(PREF,Context.MODE_PRIVATE);boolean same=base.equals(prefs.getString("base",null))&&token.equals(prefs.getString("token",null));prefs.edit().putString("base",base).putString("token",token).apply();android.app.job.JobScheduler scheduler=(android.app.job.JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE);if(!same||scheduler.getPendingJob(JOB)==null)scheduler.schedule(new JobInfo.Builder(JOB,new ComponentName(c,DeliveryAlertJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).build());return true;
  }catch(Exception e){return false;}
 }
 public static void clear(Context c){((android.app.job.JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(JOB);c.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().clear().apply();}
 public static void show(Context c,String id,String title,String message){
  if(id==null||title==null||message==null||id.length()>100||title.length()>200||message.length()>1000)return;
  if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
  android.content.SharedPreferences prefs=c.getSharedPreferences(PREF,Context.MODE_PRIVATE);Set<String> seen=new HashSet<>(prefs.getStringSet("seen",new HashSet<>()));if(seen.contains(id))return;
  NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);manager.createNotificationChannel(new NotificationChannel(CHANNEL,"New delivery offers",NotificationManager.IMPORTANCE_DEFAULT));Intent open=new Intent(c,MainActivity.class).putExtra("open-rider-alerts",true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);PendingIntent content=PendingIntent.getActivity(c,id.hashCode(),open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  manager.notify(id.hashCode(),new Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_brand_notification).setContentTitle(title).setContentText(message).setStyle(new Notification.BigTextStyle().bigText(message)).setContentIntent(content).setAutoCancel(true).build());
  if(seen.size()>200)seen.clear();seen.add(id);prefs.edit().putStringSet("seen",seen).apply();
 }
}
