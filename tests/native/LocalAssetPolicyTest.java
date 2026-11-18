package ng.trackship.app;
public final class LocalAssetPolicyTest {
 private static void check(boolean ok){if(!ok)throw new AssertionError();}
 public static void main(String[] args){
  check(LocalAssetPolicy.allowed("/assets/sendrack-courier-illustration.webp"));
  check(LocalAssetPolicy.allowed("/features.mjs"));
  check(LocalAssetPolicy.allowed("/assets/vehicle-truck.webp"));
  check(!LocalAssetPolicy.allowed(null));
  check(!LocalAssetPolicy.allowed("/assets/../../private.txt"));
  check(!LocalAssetPolicy.allowed("/assets/unlisted.svg"));
  check(!LocalAssetPolicy.allowed("https://example.com/image.svg"));
  System.out.println("Native illustrated opening asset is allowed; unknown and traversal paths remain blocked.");
 }
}
