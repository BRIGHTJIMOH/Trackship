package ng.trackship.app;
import android.content.Context;
/** Keeps the existing manual APK build independent of the optional Firebase SDK. */
public final class FirebaseBridge {
 public static void call(Context context,String method){
  try{Class.forName("ng.trackship.app.FirebaseDeliveryPush").getMethod(method,Context.class).invoke(null,context.getApplicationContext());}catch(ReflectiveOperationException ignored){}
 }
}
