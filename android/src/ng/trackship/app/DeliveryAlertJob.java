package ng.trackship.app;
import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** OS-scheduled background inbox check. Android may delay it; this is not FCM push. */
public class DeliveryAlertJob extends JobService {
 private volatile boolean stopped;
 private Thread worker;
 @Override public boolean onStartJob(JobParameters params){stopped=false;worker=new Thread(()->{HttpsURLConnection connection=null;try{
  android.content.SharedPreferences prefs=getSharedPreferences("trackship-delivery-alerts",Context.MODE_PRIVATE);String base=prefs.getString("base",null),token=prefs.getString("token",null);if(base==null||token==null)return;FirebaseBridge.call(this,"configure");
  connection=(HttpsURLConnection)new URL(base+"/api/v4/rider/notifications").openConnection();connection.setConnectTimeout(15000);connection.setReadTimeout(15000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Authorization","Bearer "+token);
  if(connection.getResponseCode()==401){DeliveryAlerts.clear(this);return;}if(connection.getResponseCode()!=200)return;
  ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=connection.getInputStream()){byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(bytes.size()+n>500000)throw new Exception("Response too large");bytes.write(buffer,0,n);}}
  JSONArray notifications=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8)).getJSONArray("notifications");for(int i=0;i<notifications.length()&&!stopped;i++){JSONObject item=notifications.getJSONObject(i);if(item.optInt("seen",0)==0)DeliveryAlerts.showBound(this,DeliveryAlerts.sessionBinding(token),item.getString("id"),item.getString("title"),item.getString("body"));}
 }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();if(!stopped)jobFinished(params,false);}});worker.start();return true;}
 @Override public boolean onStopJob(JobParameters params){stopped=true;if(worker!=null)worker.interrupt();return true;}
}
