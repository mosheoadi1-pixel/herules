import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

type Copy = (key: string) => string;
const chapters = [
  { name: 'entranceDiscover', detail: 'entranceDiscoverText', sample: 'entranceSampleDiscover', art: 'discover' },
  { name: 'entranceChat', detail: 'entranceChatText', sample: 'entranceSampleChat', art: 'chat' },
  { name: 'entrancePlay', detail: 'entrancePlayText', sample: 'entranceSamplePlay', art: 'play' },
] as const;

function Emblem({ art }: { art: typeof chapters[number]['art'] }) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
    {art === 'discover' ? <><circle cx="21" cy="21" r="12"/><path d="m30 30 9 9M21 15v12m-6-6h12"/></>
      : art === 'chat' ? <><path d="M10 10h28v21H23l-8 7v-7h-5z"/><path d="M16 17h16m-16 6h10"/></>
      : <><path d="m24 4 15 20-15 20L9 24z"/><path d="M24 15v18m-9-9h18"/></>}
  </svg>;
}

export function PublicEntrance({ t, children }: { t: Copy; children: ReactNode }) {
  const scene = useRef<HTMLDivElement>(null);
  const entrance = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = entrance.current, stage = scene.current;
    if (!root || !stage || !('IntersectionObserver' in window)) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let dispose = () => {};
    const setup = () => {
      dispose();
      if (preference.matches) return;
      const seen = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('entrance-in-view');
          seen.unobserve(entry.target);
        }
      }, { threshold: .22 });
      root.querySelectorAll('[data-entrance-reveal]').forEach(item => seen.observe(item));
      let frame = 0;
      const paint = () => {
        frame = 0;
        const { top, height } = stage.getBoundingClientRect();
        const drift = Math.max(-18, Math.min(18, (innerHeight / 2 - top - height / 2) * .075));
        stage.style.setProperty('--entrance-drift', `${drift}px`);
      };
      const queue = () => { if (!frame) frame = requestAnimationFrame(paint); };
      const stop = () => {
        window.removeEventListener('scroll', queue);
        window.removeEventListener('resize', queue);
        cancelAnimationFrame(frame);
        frame = 0;
      };
      const visible = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) { stop(); return; }
        queue();
        window.addEventListener('scroll', queue, { passive: true });
        window.addEventListener('resize', queue);
      });
      visible.observe(stage);
      dispose = () => { seen.disconnect(); visible.disconnect(); stop(); stage.style.removeProperty('--entrance-drift'); };
    };
    setup();
    preference.addEventListener('change', setup);
    return () => { dispose(); preference.removeEventListener('change', setup); };
  }, []);
  return <div className="public-entrance" ref={entrance}>
    <section className="entrance-hero" aria-labelledby="entrance-title">
      <div className="entrance-copy">
        <p className="entrance-kicker"><span aria-hidden="true">✦</span> {t('entranceLabel')}</p>
        <h1 id="entrance-title">{t('entranceTitle')} <span>{t('entranceAccent')}</span></h1>
        <p className="entrance-lead">{t('entranceLead')}</p>
        {children}
        <a className="entrance-explore" href="#public-journey">{t('entranceExplore')} <span aria-hidden="true">↓</span></a>
      </div>
      <div className="entrance-scene" ref={scene} aria-hidden="true">
        <div className="entrance-orbit" data-entrance-reveal />
        <div className="entrance-core"><span>H<span>R</span></span></div>
        {chapters.map((chapter, i) => <div className={`entrance-float entrance-float-${i + 1}`} key={chapter.art}>
          <div className="entrance-tile" data-entrance-reveal>
            <Emblem art={chapter.art}/>
            <span><small>0{i + 1} / {t(chapter.name)}</small><strong>{t(chapter.sample)}</strong></span>
          </div>
        </div>)}
        <span className="entrance-scene-caption">{t('entranceExamples')}</span>
      </div>
    </section>
    <section id="public-journey" className="entrance-journey" tabIndex={-1} aria-labelledby="entrance-steps">
      <p className="entrance-kicker"><span aria-hidden="true">✦</span> {t('entranceExplore')}</p>
      <h2 id="entrance-steps">{t('entranceStepsTitle')}</h2>
      <ol className="entrance-chapters">
        {chapters.map((chapter, i) => <li key={chapter.art}>
          <div className={`entrance-chapter-art chapter-${chapter.art}`} data-entrance-reveal aria-hidden="true"><Emblem art={chapter.art}/><span>0{i + 1}</span></div>
          <h3>{t(chapter.name)}</h3>
          <p>{t(chapter.detail)}</p>
        </li>)}
      </ol>
      <a className="entrance-explore entrance-return" href="#public-sign-in">{t('entranceTop')} <span aria-hidden="true">↑</span></a>
    </section>
  </div>;
}
