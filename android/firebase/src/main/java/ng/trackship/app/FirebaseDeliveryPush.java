package ng.trackship.app;
import android.content.Context;
import android.app.NotificationManager;
import org.json.JSONObject;
import java.util.concurrent.atomic.AtomicBoolean;
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
 private static final AtomicBoolean requesting=new AtomicBoolean(false),manualRetry=new AtomicBoolean(false);
 static final String PREF="sendrack-fcm-installation",WORK="sendrack-fcm-registration";
 static String hex(byte[] bytes){StringBuilder s=new StringBuilder();for(byte b:bytes)s.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return s.toString();}
 static String hash(String value){try{return hex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){return "";}}
 static synchronized void saveToken(Context context,String token){
  SharedPreferences prefs=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);SharedPreferences.Editor edit=prefs.edit().putString("fcm",token);
  if(!prefs.contains("id")){byte[] secret=new byte[32];new SecureRandom().nextBytes(secret);edit.putString("id",UUID.randomUUID().toString()).putString("secret",hex(secret));}edit.apply();
 }
 static void schedule(Context context){WorkManager.getInstance(context).enqueueUniqueWork(WORK,manualRetry.getAndSet(false)?ExistingWorkPolicy.REPLACE:ExistingWorkPolicy.KEEP,new OneTimeWorkRequest.Builder(PushRegistrationWorker.class).setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build());}
 static void state(Context c,String value){c.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString("state",value).putLong("stateAt",System.currentTimeMillis()).apply();}
 public static String status(Context c){
  SharedPreferences prefs=c.getSharedPreferences(PREF,Context.MODE_PRIVATE),auth=c.getSharedPreferences("trackship-delivery-alerts",Context.MODE_PRIVATE);
  try{return new JSONObject().put("state",!auth.contains("token")?"sign-in-required":!((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled()?"permission-required":prefs.getString("state","not-connected")).put("tokenAvailable",prefs.contains("fcm")).put("updatedAt",prefs.getLong("stateAt",0)).toString();}catch(Exception e){return "{\"state\":\"unavailable\"}";}
 }
 public static void retry(Context c){c.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().remove("registered").remove("registeredAt").apply();manualRetry.set(true);configure(c);}
 public static void configure(Context context){
  SharedPreferences auth=context.getSharedPreferences("trackship-delivery-alerts",Context.MODE_PRIVATE),installation=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);
  if(!auth.contains("token")){state(context,"sign-in-required");return;}
  if(!((NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled()){state(context,"permission-required");return;}
  String current=installation.getString("fcm",null),binding=hash(auth.getString("base","")+":"+auth.getString("token","")+":"+current);
  // A local marker cannot establish that the server still has this installation.
  if(current!=null&&PushRegistrationPolicy.fresh(installation.getString("registered",null),binding,installation.getLong("registeredAt",0),System.currentTimeMillis()))return;
  if(!requesting.compareAndSet(false,true))return;state(context,"getting-token");
  try{FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->{requesting.set(false);saveToken(context,token);state(context,"connecting");schedule(context);}).addOnFailureListener(error->{requesting.set(false);String message=String.valueOf(error.getMessage());state(context,PushRegistrationPolicy.tokenFailure(message));});}
  catch(Exception error){requesting.set(false);state(context,"firebase-unavailable");}
 }
 public static void clear(Context context){WorkManager.getInstance(context).cancelUniqueWork(WORK);context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().remove("registered").remove("registeredAt").putString("state","sign-in-required").apply();}
}
