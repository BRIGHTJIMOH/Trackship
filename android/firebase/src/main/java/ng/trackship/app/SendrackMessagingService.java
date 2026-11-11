package ng.trackship.app;
import android.content.Context;
import android.content.SharedPreferences;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public final class SendrackMessagingService extends FirebaseMessagingService {
 @Override public void onNewToken(String token){FirebaseDeliveryPush.saveToken(this,token);FirebaseDeliveryPush.schedule(this);}
 @Override public void onMessageReceived(RemoteMessage message){
  SharedPreferences auth=getSharedPreferences("trackship-delivery-alerts",Context.MODE_PRIVATE);String session=auth.getString("token",null),eventId=message.getData().get("eventId"),binding=message.getData().get("binding");
  if(session==null||eventId==null||!eventId.matches("[a-fA-F0-9-]{36}")||!FirebaseDeliveryPush.hash(session).equals(binding))return;
  DeliveryAlerts.showBound(this,binding,eventId,"SendRack delivery update","A delivery update is waiting. Open SendRack to view it.");
 }
}
