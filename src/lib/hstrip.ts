/**
 * 縦スクロールで写真の列を横に流す。
 * セクションの高さを「横に流す距離 + 画面の高さ」にして中身を sticky で固定し、
 * スクロール量に合わせて列を横に動かす。進み具合は細い線（--progress）で示す。
 * JS が無い環境では、列はふつうの横スクロールになる。
 */
export function mountHStrip(section: HTMLElement) {
  const sticky = section.querySelector<HTMLElement>('[data-sticky]')!;
  const viewport = section.querySelector<HTMLElement>('[data-viewport]')!;
  const track = section.querySelector<HTMLElement>('[data-track]')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  section.classList.add('is-live');

  let maxShift = 0;
  let range = 1;
  let target = 0;
  let current = 0;
  let raf = 0;

  function measure() {
    maxShift = Math.max(0, track.scrollWidth - viewport.clientWidth);
    section.style.height = `${maxShift + sticky.offsetHeight}px`;
    range = Math.max(1, section.offsetHeight - sticky.offsetHeight);
    onScroll();
  }

  function onScroll() {
    const p = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / range));
    target = p * maxShift;
    if (reduced.matches) {
      current = target;
      apply();
    } else if (!raf) {
      raf = requestAnimationFrame(tick);
    }
  }

  function tick() {
    raf = 0;
    current += (target - current) * 0.14;
    if (Math.abs(target - current) < 0.4) current = target;
    apply();
    if (current !== target) raf = requestAnimationFrame(tick);
  }

  function apply() {
    track.style.transform = `translate3d(${-current}px, 0, 0)`;
    sticky.style.setProperty('--progress', String(maxShift ? current / maxShift : 0));
  }

  // トラックパッドの横スワイプも縦スクロールとして扱う
  section.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
        window.scrollBy(0, e.deltaX);
        e.preventDefault();
      }
    },
    { passive: false },
  );

  window.addEventListener('scroll', onScroll, { passive: true });
  new ResizeObserver(measure).observe(viewport);
  measure();
}
