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
 public static void ensureChannel(Context c){NotificationChannel channel=new NotificationChannel(CHANNEL,"Delivery alerts",NotificationManager.IMPORTANCE_HIGH);channel.enableVibration(true);channel.setSound(android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION),new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).build());((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);}

 public static boolean channelEnabled(Context c){NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);NotificationChannel channel=manager.getNotificationChannel(CHANNEL);return channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE;}
 public static boolean configure(Context c,String base,String token){return configure(c,base,token,"rider");}
 public static boolean configure(Context c,String base,String token,String role){
  if(!"rider".equals(role)&&!"vendor".equals(role))return false;
  try{ensureChannel(c);Uri u=Uri.parse(base);if(!"https".equals(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null||!(u.getPath()==null||u.getPath().isEmpty())||token==null||!token.matches("[a-f0-9]{64}"))return false;
   android.content.SharedPreferences prefs=c.getSharedPreferences(PREF,Context.MODE_PRIVATE);boolean same=role.equals(prefs.getString("role","rider"))&&base.equals(prefs.getString("base",null))&&token.equals(prefs.getString("token",null));prefs.edit().putString("base",base).putString("token",token).putString("role",role).apply();android.app.job.JobScheduler scheduler=(android.app.job.JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE);if(!same||scheduler.getPendingJob(JOB)==null)scheduler.schedule(new JobInfo.Builder(JOB,new ComponentName(c,DeliveryAlertJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).build());FirebaseBridge.call(c,"configure");return true;
  }catch(Exception e){return false;}
 }
 public static synchronized void clear(Context c){FirebaseBridge.call(c,"clear");((android.app.job.JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(JOB);c.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().clear().apply();NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);for(android.service.notification.StatusBarNotification alert:manager.getActiveNotifications())if(CHANNEL.equals(alert.getNotification().getChannelId()))manager.cancel(alert.getTag(),alert.getId());}
 public static String sessionBinding(String token){try{byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:digest)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}catch(Exception e){return "";}}
 public static synchronized void showBound(Context c,String binding,String id,String title,String message){String session=c.getSharedPreferences(PREF,Context.MODE_PRIVATE).getString("token",null);if(session==null||binding==null||!sessionBinding(session).equals(binding))return;show(c,id,title,message);}
 public static synchronized void show(Context c,String id,String title,String message){show(c,id,title,message,null);}
 public static synchronized void showBound(Context c,String binding,String id,String title,String message,String shipment){String session=c.getSharedPreferences(PREF,Context.MODE_PRIVATE).getString("token",null);if(session==null||!sessionBinding(session).equals(binding))return;show(c,id,title,message,shipment);}
 public static synchronized void show(Context c,String id,String title,String message,String shipment){
  if(id==null||title==null||message==null||id.length()>100||title.length()>200||message.length()>1000)return;
  if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
  ensureChannel(c);NotificationManager notificationManager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);if(!notificationManager.areNotificationsEnabled()||!channelEnabled(c))return;
  android.content.SharedPreferences prefs=c.getSharedPreferences(PREF,Context.MODE_PRIVATE);Set<String> seen=new HashSet<>(prefs.getStringSet("seen",new HashSet<>()));if(seen.contains(id))return;
  NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);ensureChannel(c);Intent open=new Intent(c,MainActivity.class).putExtra("open-account-alerts",prefs.getString("role","rider")).putExtra("alert-binding",sessionBinding(prefs.getString("token",""))).putExtra("alert-event",id).setData(Uri.parse("sendrack://notification/"+id)).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);if(shipment!=null&&shipment.matches("[a-fA-F0-9-]{36}"))open.putExtra("alert-shipment",shipment);PendingIntent content=PendingIntent.getActivity(c,id.hashCode(),open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  manager.notify(id.hashCode(),new Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_brand_notification).setContentTitle(title).setContentText(message).setStyle(new Notification.BigTextStyle().bigText(message)).setContentIntent(content).setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).build());
  if(seen.size()>200)seen.clear();seen.add(id);prefs.edit().putStringSet("seen",seen).apply();
 }
 public static void fetchBoundEvent(Context c,String binding,String role,String eventId){
  javax.net.ssl.HttpsURLConnection connection=null;try{
   android.content.SharedPreferences prefs=c.getSharedPreferences(PREF,Context.MODE_PRIVATE);String token=prefs.getString("token",null),base=prefs.getString("base",null);
   if(token==null||base==null||!sessionBinding(token).equals(binding)||!role.equals(prefs.getString("role","rider"))||!eventId.matches("[a-fA-F0-9-]{36}"))return;
   connection=(javax.net.ssl.HttpsURLConnection)new java.net.URL(base+"/api/v4/"+role+"/notifications/"+eventId).openConnection();connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Authorization","Bearer "+token);
   if(connection.getResponseCode()!=200)return;
   java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();try(java.io.InputStream in=connection.getInputStream()){byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(bytes.size()+n>16384)return;bytes.write(buffer,0,n);}}
   org.json.JSONObject item=new org.json.JSONObject(new String(bytes.toByteArray(),java.nio.charset.StandardCharsets.UTF_8)).getJSONObject("notification");
   if(!eventId.equals(item.optString("id"))||item.optInt("seen",0)!=0)return;
   showBound(c,binding,eventId,item.getString("title"),item.getString("body"),item.optString("shipmentId",null));
  }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();}
 }

}
