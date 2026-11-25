import { useEffect, useRef, type ReactNode } from 'react';

export function PrivateEntrance({ t, children }: { t: (he: string, en: string) => string; children: ReactNode }) {
  const artwork = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scene = artwork.current;
    if (!scene || !('IntersectionObserver' in window)) return;
    const motion = window.matchMedia('(prefers-reduced-motion: no-preference) and (min-width: 48rem)');
    const controller = () => {
      stop?.();
      stop = undefined;
      if (!motion.matches) return;
      let frame = 0;
      const paint = () => {
        frame = 0;
        const { top, height } = scene.getBoundingClientRect();
        const drift = Math.max(-14, Math.min(14, (window.innerHeight / 2 - top - height / 2) * .08));
        scene.style.setProperty('--private-drift', `${drift}px`);
      };
      const queue = () => { if (!frame) frame = window.requestAnimationFrame(paint); };
      const unlisten = () => {
        window.removeEventListener('scroll', queue);
        window.removeEventListener('resize', queue);
        window.cancelAnimationFrame(frame);
        frame = 0;
      };
      const observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) { unlisten(); return; }
        scene.dataset.revealed = '';
        window.addEventListener('scroll', queue, { passive: true });
        window.addEventListener('resize', queue);
        queue();
      });
      observer.observe(scene);
      stop = () => { observer.disconnect(); unlisten(); scene.style.removeProperty('--private-drift'); };
    };
    let stop: (() => void) | undefined;
    controller();
    motion.addEventListener('change', controller);
    return () => { stop?.(); motion.removeEventListener('change', controller); };
  }, []);

  return <div className="private-entrance">
    <div className="private-entry-copy">
      <p className="private-kicker"><span aria-hidden="true">✦</span> {t('מרחב פרטי לשניים', 'A private space for two')}</p>
      <h1 id="private-entry-title" tabIndex={-1}>{t('הכללים שלה.', 'Her rules.')} <span>{t('הקצב שלכם.', 'Your shared pace.')}</span></h1>
      <p className="private-lead">{t('משחק פרטי למבוגרים, בקצב שלכם. כל משימה היא הזמנה.', 'A private game for adults, at your pace. Every mission is an invitation.')}</p>
      {children}
    </div>
    <div ref={artwork} className="private-artwork" aria-hidden="true">
      <div className="private-artwork-orbit"/>
      <div className="private-artwork-seal" dir="ltr"><span>H<span>R</span></span></div>
      <svg className="private-artwork-frame" viewBox="0 0 300 360" fill="none" stroke="currentColor" strokeWidth=".8">
        <rect x="1" y="1" width="298" height="358" rx="146"/>
        <rect x="14" y="14" width="272" height="332" rx="133"/>
        <path d="M150 31v43m-21-21h42m-21 233v43m-21-21h42M30 180h28m184 0h28"/>
      </svg>
    </div>
  </div>;
}
