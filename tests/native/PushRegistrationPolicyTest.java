package ng.trackship.app;
public final class PushRegistrationPolicyTest {
 static void check(boolean ok){if(!ok)throw new AssertionError();}
 public static void main(String[] args){
  check(PushRegistrationPolicy.fresh("same","same",1000,2000));
  check(!PushRegistrationPolicy.fresh("old","new",1000,2000));
  check(!PushRegistrationPolicy.fresh("same","same",1000,301000));
  check(!PushRegistrationPolicy.fresh("same","same",0,2000));
  check(!PushRegistrationPolicy.fresh("same","same",3000,2000));
  for(int status:new int[]{401,403,404,409})check(!PushRegistrationPolicy.retryable(status));
  for(int status:new int[]{429,500,503})check(PushRegistrationPolicy.retryable(status));
  check(PushRegistrationPolicy.httpState(401).equals("sign-in-required"));
  check(PushRegistrationPolicy.httpState(404).equals("service-update-required"));
  check(PushRegistrationPolicy.tokenFailure("FIS_AUTH_ERROR").equals("firebase-config-error"));
  check(PushRegistrationPolicy.tokenFailure("SERVICE_NOT_AVAILABLE").equals("google-services-unavailable"));
  check(PushRegistrationPolicy.tokenFailure("secret-bearing provider error").equals("token-request-failed"));
  System.out.println("Native push policy passed: expiry/clock rollback/account changes, HTTP retry classes and sanitized Firebase errors.");
 }
}
