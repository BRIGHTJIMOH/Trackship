package ng.trackship.app;
import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.BackoffPolicy;
import com.google.firebase.messaging.FirebaseMessaging;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

public final class FirebaseDeliveryPush {
 static final String PREF="sendrack-fcm-installation",WORK="sendrack-fcm-registration";
 static String hex(byte[] bytes){StringBuilder s=new StringBuilder();for(byte b:bytes)s.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return s.toString();}
 static String hash(String value){try{return hex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){return "";}}
 static synchronized void saveToken(Context context,String token){
  SharedPreferences prefs=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);SharedPreferences.Editor edit=prefs.edit().putString("fcm",token);
  if(!prefs.contains("id")){byte[] secret=new byte[32];new SecureRandom().nextBytes(secret);edit.putString("id",UUID.randomUUID().toString()).putString("secret",hex(secret));}edit.apply();
 }
 static void schedule(Context context){WorkManager.getInstance(context).enqueueUniqueWork(WORK,ExistingWorkPolicy.KEEP,new OneTimeWorkRequest.Builder(PushRegistrationWorker.class).setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build());}
 public static void configure(Context context){
  SharedPreferences auth=context.getSharedPreferences("trackship-delivery-alerts",Context.MODE_PRIVATE);if(!auth.contains("token"))return;SharedPreferences installation=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);String current=installation.getString("fcm",null);if(current!=null&&hash(auth.getString("base","")+":"+auth.getString("token","")+":"+current).equals(installation.getString("registered",null)))return;
  FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->{saveToken(context,token);schedule(context);});
 }
 public static void clear(Context context){WorkManager.getInstance(context).cancelUniqueWork(WORK);context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().remove("registered").apply();}
}
