package ng.trackship.app;
/** Pure registration policy, independently testable without a phone or credentials. */
public final class PushRegistrationPolicy {
 public static boolean fresh(String saved,String current,long registeredAt,long now){long age=now-registeredAt;return registeredAt>0&&age>=0&&age<300000&&current.equals(saved);}
 public static boolean retryable(int status){return status==429||status>=500;}
 public static String httpState(int status){return status==401?"sign-in-required":status==403?"account-restricted":status==409?"registration-conflict":status==404?"service-update-required":status==429?"rate-limited":"server-unavailable";}
 public static String tokenFailure(String message){return message.contains("FIS_AUTH_ERROR")||message.contains("BAD_CONFIG")?"firebase-config-error":message.contains("SERVICE_NOT_AVAILABLE")?"google-services-unavailable":"token-request-failed";}
}
