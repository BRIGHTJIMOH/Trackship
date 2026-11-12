package ng.trackship.app;
import android.content.Context;
/** Keeps the existing manual APK build independent of the optional Firebase SDK. */
public final class FirebaseBridge {
 public static String status(Context context){try{return (String)Class.forName("ng.trackship.app.FirebaseDeliveryPush").getMethod("status",Context.class).invoke(null,context.getApplicationContext());}catch(ReflectiveOperationException error){return "{\"state\":\"firebase-unavailable\"}";}}
 public static void call(Context context,String method){
  try{Class.forName("ng.trackship.app.FirebaseDeliveryPush").getMethod(method,Context.class).invoke(null,context.getApplicationContext());}catch(ReflectiveOperationException ignored){}
 }
}
