const signup = document.querySelector('#launch-signup');
const status = document.querySelector('.signup-status');
const submit = signup.querySelector('button[type="submit"]');

function chooseRole(role) {
  signup.elements.role.value = role;
  document.querySelectorAll('.audience-card').forEach(card => {
    card.classList.toggle('is-selected', card.id === role + '-card');
  });
}

for (const link of document.querySelectorAll('[data-signup-role], [data-audience]')) {
  link.addEventListener('click', () => chooseRole(link.dataset.signupRole || link.dataset.audience));
}

signup.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  submit.disabled = true;
  status.textContent = 'Saving your place…';
  try {
    const values = new FormData(signup);
    const response = await fetch('/api/waitlist', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name: values.get('name'), city: values.get('city'), email: values.get('email'),
        role: values.get('role'), consent: values.has('consent')
      }),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Please try again shortly.');
    status.textContent = result.message;
    signup.reset();
    document.querySelectorAll('.audience-card').forEach(card => card.classList.remove('is-selected'));
  } catch (error) {
    status.textContent = error.name === 'TimeoutError'
      ? 'Your connection is taking longer than expected. Your details are still here; please try again.'
      : error.message || 'We couldn’t connect. Please try again.';
  } finally {
    submit.disabled = false;
  }
});

const stage = document.querySelector('.product-stage');
const motion = document.querySelector('.motion-control');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let motionEnabled = !reducedMotion.matches;

function resetArtwork() {
  stage.style.removeProperty('--art-x');
  stage.style.removeProperty('--art-y');
  stage.style.removeProperty('--art-angle');
}
function reflectMotion() {
  motion.disabled = reducedMotion.matches;
  motion.innerHTML = reducedMotion.matches ? 'Motion reduced' : motionEnabled
    ? '<span aria-hidden="true">Ⅱ</span> Pause motion'
    : '<span aria-hidden="true">▷</span> Enable motion';
  motion.setAttribute('aria-label', reducedMotion.matches ? 'Motion reduced' : motionEnabled ? 'Pause visual motion' : 'Enable visual motion');
  if (!motionEnabled || reducedMotion.matches) resetArtwork();
}
stage.addEventListener('pointermove', event => {
  if (!motionEnabled || reducedMotion.matches || event.pointerType === 'touch') return;
  const bounds = stage.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - .5;
  const y = (event.clientY - bounds.top) / bounds.height - .5;
  stage.style.setProperty('--art-x', x * 8 + 'px');
  stage.style.setProperty('--art-y', y * 5 + 'px');
  stage.style.setProperty('--art-angle', x * 2 + 'deg');
});
stage.addEventListener('pointerleave', resetArtwork);
motion.addEventListener('click', () => { motionEnabled = !motionEnabled; reflectMotion(); });
reducedMotion.addEventListener('change', () => { motionEnabled = !reducedMotion.matches; reflectMotion(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) resetArtwork(); });
reflectMotion();
