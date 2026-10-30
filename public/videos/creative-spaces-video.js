/* Creative Spaces launch film — independent player for the existing deployed static site. */
(() => {
  const id = 'creative-spaces-launch-film';
  const videoUrl = '/videos/creative-spaces-launch.mp4';

  const css = `
    #creative-spaces-launch-film{background:#f3eee6;color:#171512;padding:72px 20px 80px;border-top:1px solid rgba(23,21,18,.08)}
    #creative-spaces-launch-film .cs-inner{max-width:1120px;margin:auto}
    #creative-spaces-launch-film .cs-eyebrow{font:500 12px/1.5 Outfit,Arial,sans-serif;letter-spacing:.16em;color:#8d4e32;text-transform:uppercase}
    #creative-spaces-launch-film h2{font:500 clamp(2.2rem,4.7vw,3.5rem)/1.1 Fraunces,Georgia,serif;letter-spacing:-.025em;margin:14px 0 18px;max-width:820px}
    #creative-spaces-launch-film .cs-summary{font:400 1rem/1.7 Outfit,Arial,sans-serif;color:#544f4a;max-width:710px;margin:0 0 30px}
    #creative-spaces-launch-film .cs-player{border:1px solid rgba(23,21,18,.14);background:#151515;overflow:hidden;border-radius:18px;box-shadow:0 22px 55px rgba(23,21,18,.13)}
    #creative-spaces-launch-film video{width:100%;height:auto;aspect-ratio:16/9;object-fit:contain;display:block;background:#151515}
    #creative-spaces-launch-film .cs-bottom{display:flex;align-items:center;flex-wrap:wrap;gap:18px;margin-top:26px}
    #creative-spaces-launch-film .cs-cta{display:inline-flex;min-height:46px;align-items:center;justify-content:center;padding:0 24px;background:#8d4e32;color:white;text-decoration:none;border-radius:4px;font:500 12px/1 Outfit,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}
    #creative-spaces-launch-film .cs-duration{font:400 12px Outfit,Arial,sans-serif;color:#746c65;text-transform:uppercase;letter-spacing:.08em}
    #creative-spaces-launch-film .cs-error{font:400 13px/1.6 Outfit,Arial,sans-serif;color:#655b54;margin:14px 0 0}
    #creative-spaces-launch-film .cs-error[hidden]{display:none}
    #creative-spaces-launch-film a:focus-visible,#creative-spaces-launch-film video:focus-visible{outline:3px solid #8d4e32;outline-offset:4px}
    @media(max-width:640px){#creative-spaces-launch-film{padding:48px 16px 56px}#creative-spaces-launch-film .cs-player{border-radius:10px}#creative-spaces-launch-film .cs-summary{font-size:14px}}
  `;

  function mount() {
    if (document.getElementById(id)) return;
    const reel = document.querySelector('main .reel');
    if (!reel) return;
    if (!document.getElementById('creative-spaces-film-css')) {
      const style = document.createElement('style');
      style.id = 'creative-spaces-film-css';
      style.textContent = css;
      document.head.appendChild(style);
    }
    const section = document.createElement('section');
    section.id = id;
    section.setAttribute('aria-labelledby', 'creative-spaces-film-title');
    section.innerHTML = `
      <div class="cs-inner">
        <p class="cs-eyebrow">The Creative Spaces experience</p>
        <h2 id="creative-spaces-film-title">From first click to launch.</h2>
        <p class="cs-summary">A clear look at how we turn your idea, design and content into a website ready for customers.</p>
        <div class="cs-player">
          <video controls playsinline preload="none" poster="/images/hero-warehouse.jpg"
            aria-label="Creative Spaces: narrated website-design journey, 55 seconds">
            <source src="/videos/creative-spaces-launch.mp4" type="video/mp4">
            <track kind="captions" src="/videos/creative-spaces-launch.en.vtt" srclang="en" label="English" default>
            Your browser does not support embedded video.
          </video>
        </div>
        <p class="cs-error" role="status" hidden>Video playback is unavailable. You can still book a consultation below.</p>
        <div class="cs-bottom">
          <a class="cs-cta" href="#start">Start your project</a>
          <span class="cs-duration">55 seconds · Narration and captions</span>
        </div>
      </div>`;
    reel.insertAdjacentElement('afterend', section);
    const video = section.querySelector('video');
    video.addEventListener('error', () => {
      section.querySelector('.cs-error').hidden = false;
    }, true);
  }

  function init() {
    // Do not show a broken video section on preview deployments lacking the binary.
    fetch(videoUrl, {method:'HEAD',cache:'no-store'})
      .then(response => {
        if (!response.ok || !String(response.headers.get('content-type') || '').includes('video')) return;
        mount();
        const observer = new MutationObserver(() => {
          if (!document.getElementById(id)) mount();
        });
        observer.observe(document.body, {childList:true,subtree:true});
        window.addEventListener('pagehide', () => observer.disconnect(), {once:true});
      })
      .catch(() => {});
  }
  if (document.readyState === 'complete') setTimeout(init, 250);
  else window.addEventListener('load', () => setTimeout(init, 250), {once:true});
})();
