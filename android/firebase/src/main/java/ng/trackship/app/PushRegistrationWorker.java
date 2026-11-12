package ng.trackship.app;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONObject;
import java.net.URL;
import java.io.OutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;

public final class PushRegistrationWorker extends Worker {
 public PushRegistrationWorker(Context context,WorkerParameters parameters){super(context,parameters);}
 @Override public Result doWork(){
  Context context=getApplicationContext();SharedPreferences auth=context.getSharedPreferences("trackship-delivery-alerts",Context.MODE_PRIVATE),installation=context.getSharedPreferences(FirebaseDeliveryPush.PREF,Context.MODE_PRIVATE);
  String base=auth.getString("base",null),session=auth.getString("token",null),token=installation.getString("fcm",null),id=installation.getString("id",null),secret=installation.getString("secret",null);
  if(base==null||session==null||token==null||id==null||secret==null){FirebaseDeliveryPush.state(context,"sign-in-required");return Result.success();}
  if(!((NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled()){FirebaseDeliveryPush.state(context,"permission-required");return Result.success();}
  String binding=FirebaseDeliveryPush.hash(base+":"+session+":"+token);if(PushRegistrationPolicy.fresh(installation.getString("registered",null),binding,installation.getLong("registeredAt",0),System.currentTimeMillis()))return Result.success();
  HttpsURLConnection connection=null;
  try{
   URL url=new URL(base+"/api/v4/rider/push/register");if(!"https".equals(url.getProtocol())){FirebaseDeliveryPush.state(context,"invalid-service");return Result.failure();}
   connection=(HttpsURLConnection)url.openConnection();connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);connection.setRequestMethod("POST");connection.setRequestProperty("Authorization","Bearer "+session);connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
   JSONObject payload=new JSONObject().put("installationId",id).put("installationSecret",secret).put("token",token);byte[] bytes=payload.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
   int status=connection.getResponseCode();
   if(!session.equals(auth.getString("token",null))||!base.equals(auth.getString("base",null)))return Result.success();
   if(status!=200){String reason=PushRegistrationPolicy.httpState(status);FirebaseDeliveryPush.state(context,reason);return PushRegistrationPolicy.retryable(status)?Result.retry():Result.failure();}
   JSONObject result;
   try(InputStream in=connection.getInputStream()){java.io.ByteArrayOutputStream data=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[1024];int n;while((n=in.read(buffer))!=-1){if(data.size()+n>8192)throw new java.io.IOException();data.write(buffer,0,n);}result=new JSONObject(data.toString("UTF-8"));}
   if(!result.optBoolean("registered",false)){FirebaseDeliveryPush.state(context,"invalid-server-response");return Result.retry();}
   // Never let a delayed registration overwrite a newly selected rider account.
   if(!session.equals(auth.getString("token",null))||!base.equals(auth.getString("base",null)))return Result.success();if(!token.equals(installation.getString("fcm",null)))return Result.retry();installation.edit().putString("registered",binding).putLong("registeredAt",System.currentTimeMillis()).apply();FirebaseDeliveryPush.state(context,result.optBoolean("pushReady",false)?"connected":"server-push-disabled");
   return Result.success();
  }catch(Exception ignored){FirebaseDeliveryPush.state(context,"network-unavailable");return Result.retry();}finally{if(connection!=null)connection.disconnect();}
 }
}
