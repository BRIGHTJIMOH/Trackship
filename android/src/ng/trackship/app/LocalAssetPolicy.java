package ng.trackship.app;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
/** Exact local asset paths; no network or directory-prefix bypass. */
public final class LocalAssetPolicy {
 private static final Set<String> PATHS=new HashSet<>(Arrays.asList(
  "/sendrack-entry.html",
  "/sendrack-main.js",
  "/sendrack-ui.css",
  "/index.html",
  "/app.js",
  "/core.mjs",
  "/delivery-cards.mjs",
  "/lifecycle.mjs",
  "/history.mjs",
  "/features.mjs",
  "/communication-cards.mjs",
  "/referrals.mjs",
  "/shipment-reactions.mjs",
  "/reaction-options.mjs",
  "/map-display.mjs",
  "/viewer-location.mjs",
  "/map-controls.css",
  "/config.mjs",
  "/accounts.mjs",
  "/identity.mjs",
  "/vehicles.mjs",
  "/customer-wallet.mjs",
  "/style.css",
  "/assets/courier.svg",
  "/assets/route.svg",
  "/assets/sendrack-mark.svg",
  "/assets/sendrack-wordmark.svg",
  "/assets/sendrack-wordmark-white.svg",
  "/assets/sendrack-mark-white.svg",
  "/assets/sendrack-logo.svg",
  "/assets/sendrack-delivery-scene.svg",
  "/assets/courier-photo.png",
  "/assets/Poppins-Regular.ttf",
  "/assets/Inter.ttf",
  "/assets/Poppins-Medium.ttf",
  "/assets/Poppins-SemiBold.ttf",
  "/assets/vehicle-keke.webp",
  "/assets/vehicle-car.webp",
  "/assets/vehicle-dispatch.webp",
  "/assets/vehicle-truck.webp",
  "/assets/leaflet.js",
  "/assets/leaflet.css",
  "/assets/sendrack-courier-illustration.webp"
 ));
 public static boolean allowed(String path){return path!=null&&PATHS.contains(path);}
}
