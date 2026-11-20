const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const secure = window.isSecureContext;
let deferredPrompt = null;
const button = document.createElement('button');
button.type = 'button';
button.className = 'admin-install';
button.textContent = 'Install console';
button.hidden = standalone() || !secure || !('serviceWorker' in navigator);
document.body.append(button);
const dialog = document.createElement('dialog');
dialog.className = 'admin-install-dialog';
dialog.setAttribute('aria-labelledby', 'admin-install-title');
// Fixed local markup only; no data from accounts or query strings is inserted.
dialog.innerHTML = `<h2 id="admin-install-title">Install SendRack Admin</h2>
<p>Open the console from its own icon on your tablet or computer. Live records need an internet connection.</p>
<section><h3>Android tablet</h3><p>In Chrome, open the menu (⋮), then choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p></section>
<section><h3>Windows or Mac</h3><p>In Chrome or Edge, use the install icon in the address bar, or the browser menu’s option to install this page as an app. On supported Safari versions, choose File → Add to Dock.</p></section>
<section><h3>iPad or iPhone</h3><p>In Safari, tap Share, then <strong>Add to Home Screen</strong>. Turn on <strong>Open as Web App</strong> if offered, then tap Add.</p></section>
<p>Your existing admin sign-in is still required. A newly installed app may ask you to sign in again.</p>
<button type="button" class="admin-install-close">Done</button>`;
document.body.append(dialog);
dialog.querySelector('button').addEventListener('click', () => dialog.close());
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredPrompt = event;
  button.hidden = standalone();
});
window.addEventListener('appinstalled', () => { deferredPrompt = null; button.hidden = true; dialog.close(); });
window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {button.hidden = standalone() || !secure;});
button.addEventListener('click', async () => {
  if (!deferredPrompt) {dialog.showModal(); return;}
  const prompt = deferredPrompt;
  deferredPrompt = null;
  try {await prompt.prompt(); await prompt.userChoice;}
  catch {dialog.showModal();}
});
if (secure && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/admin/sw.js', {scope: '/admin/', updateViaCache: 'none'})
    .catch(error => {console.warn('SendRack admin installation is unavailable:', error.message);});
}
