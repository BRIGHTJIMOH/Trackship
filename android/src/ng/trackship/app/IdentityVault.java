package ng.trackship.app;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** ID documents stay in private, Keystore-encrypted device storage; never WebView localStorage. */
public final class IdentityVault {
 private static final String ALIAS="TrackShip-Identity-v1";
 private final Context context;
 public IdentityVault(Context context){this.context=context;}
 private SecretKey key() throws Exception {KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);if(!store.containsAlias(ALIAS)){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());generator.generateKey();}return (SecretKey)store.getKey(ALIAS,null);}
 private String name(String phone) throws Exception {byte[] hash=MessageDigest.getInstance("SHA-256").digest(phone.getBytes(StandardCharsets.UTF_8));return Base64.encodeToString(hash,Base64.NO_WRAP);}
 public synchronized boolean save(String phone,String json){try{if(phone==null||!phone.matches("0[789][0-9]{9}")||json==null||json.length()>3000000)return false;Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());byte[] encrypted=cipher.doFinal(json.getBytes(StandardCharsets.UTF_8));String stored=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(encrypted,Base64.NO_WRAP);return context.getSharedPreferences("trackship-identity-vault",Context.MODE_PRIVATE).edit().putString(name(phone),stored).commit();}catch(Exception e){return false;}}
 public synchronized String load(String phone){try{String stored=context.getSharedPreferences("trackship-identity-vault",Context.MODE_PRIVATE).getString(name(phone),null);if(stored==null)return null;String[] parts=stored.split(":",2);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}catch(Exception e){return null;}}
 public synchronized boolean exists(String phone){try{return context.getSharedPreferences("trackship-identity-vault",Context.MODE_PRIVATE).contains(name(phone));}catch(Exception e){return false;}}
 public synchronized void remove(String phone){try{context.getSharedPreferences("trackship-identity-vault",Context.MODE_PRIVATE).edit().remove(name(phone)).apply();}catch(Exception ignored){}}
}
