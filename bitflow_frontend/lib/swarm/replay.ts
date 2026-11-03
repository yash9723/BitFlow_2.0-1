/**
 * lib/swarm/replay.ts — ask for the landing-page intro (components/swarm) to play again.
 * On the home page it restarts in place; anywhere else it opens /?intro=1, which the prelude
 * treats as an explicit request (plays even for repeat visits and reduced motion).
 */
export const REPLAY_EVENT = "bf-swarm-replay";

export function replayIntro(pathname: string, push: (href: string) => void) {
  if (pathname === "/") window.dispatchEvent(new Event(REPLAY_EVENT));
  else push("/?intro=1");
}

/** The page's scroll offset, whether the document or <body> is the scrolling element. */
export const scrollOffset = () => ({
  x: window.scrollX || document.body.scrollLeft || 0,
  y: window.scrollY || document.body.scrollTop || 0,
});

export function scrollToTop() {
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
}
