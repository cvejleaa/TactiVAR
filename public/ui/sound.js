// Lyden (v3.32.2, D5 – docs/spec.md §10b): fløjt ved kampstart og slutfløjt, bip ved VAR-tjek, kort jubel ved dit mål. Web Audio
// uden lydfiler. FRA som standard; valget ligger under sin egen nøgle (ikke i ligaen – intet skema-bump, ingen fixture).
// AudioContext oprettes/genoptages kun i et klik (▶ Spil runde, kontakten) – ellers holder browserens autoplay-regel den tavs.
// Mangler AudioContext (eller kaster den), er der ingen lyd og ingen fejlboks.
export const SOUND_KEY = 'tactivar_sound';
export function soundOn(storage) { try { return storage.getItem(SOUND_KEY) === '1'; } catch { return false; } }
export function setSound(storage, on) { try { storage.setItem(SOUND_KEY, on ? '1' : '0'); return true; } catch { return false; } }

let ctx = null;
const live = new Set();   // lyde, der spiller eller venter – ⚡ stopper dem
// Kaldes i klikket. Opretter kun en AudioContext, når lyden er slået til.
export function unlockSound(win = globalThis) {
  try {
    const AC = win.AudioContext || win.webkitAudioContext;
    if (!AC) return null;
    ctx ||= new AC();
    if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {});
    return ctx;
  } catch { ctx = null; return null; }
}
export function stopSounds() {
  for (const o of live) { try { o.stop(); } catch { /* allerede stoppet */ } }
  live.clear();
}
// tone: [frekvens, start (s), varighed (s), styrke, form, glid-til-frekvens?]
function tones(list) {
  if (!ctx) return false;
  try {
    const t0 = ctx.currentTime + 0.02;
    for (const [f, at, dur, vol, type = 'sine', to] of list) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0 + at);
      if (to) o.frequency.linearRampToValueAtTime(to, t0 + at + dur);
      g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(vol, t0 + at + 0.02); g.gain.linearRampToValueAtTime(0, t0 + at + dur);
      o.connect(g); g.connect(ctx.destination);
      o.onended = () => live.delete(o);
      live.add(o); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
    }
    return true;
  } catch { return false; }
}
const WHISTLE = (n) => Array.from({ length: n }, (_, i) => [2900, i * 0.32, i === n - 1 ? 0.55 : 0.22, 0.12, 'triangle', 2700]);
const SOUNDS = {
  whistle: () => WHISTLE(1),                        // kampstart
  final: () => WHISTLE(3),                          // slutfløjt (tre stød)
  bip: () => [[880, 0, 0.12, 0.1, 'square'], [880, 0.2, 0.12, 0.1, 'square']],   // VAR tjekker
  cheer: () => [[523, 0, 0.14, 0.12, 'sawtooth'], [659, 0.12, 0.14, 0.12, 'sawtooth'], [784, 0.24, 0.3, 0.12, 'sawtooth']],
};
export function playSound(kind) { const f = SOUNDS[kind]; return f ? tones(f()) : false; }
