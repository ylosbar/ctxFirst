import { useEffect, useState } from "react";

// Splash d'amorçage : recouvre la surface applicative pendant ~3 s au démarrage,
// puis se fond et se démonte. Rendu à l'intérieur de `.app-rounded-surface`
// (`overflow: hidden`) afin d'hériter du clipping arrondi de la fenêtre et de
// l'état maximisé sans logique propre.
const SPLASH_TOTAL_MS = 3000;
const FADE_MS = 350;

// Logo "CTX" tapé lettre à lettre, puis "FIRST" en fondu.
const WORD = "CTX";
const TYPE_STEP_MS = 180; // délai entre chaque lettre frappée
const FIRST_FADE_MS = 600; // durée du fondu sur "FIRST"

const SplashScreen = () => {
  // `visible` pilote le fondu (entrée puis sortie) ; `done` démonte une fois la
  // sortie terminée pour libérer la surface au workbench.
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  // `typed` = nombre de lettres révélées de "CTX" ; `firstVisible` déclenche le
  // fondu de "FIRST" une fois la frappe terminée.
  const [typed, setTyped] = useState(0);
  const [firstVisible, setFirstVisible] = useState(false);

  useEffect(() => {
    const fadeIn = requestAnimationFrame(() => setVisible(true));
    const fadeOut = window.setTimeout(() => setVisible(false), SPLASH_TOTAL_MS - FADE_MS);
    const remove = window.setTimeout(() => setDone(true), SPLASH_TOTAL_MS);

    // Révèle "C", "T", "X" l'une après l'autre, puis fond "FIRST".
    const typers = Array.from({ length: WORD.length }, (_, i) =>
      window.setTimeout(() => setTyped(i + 1), TYPE_STEP_MS * (i + 1)),
    );
    const showFirst = window.setTimeout(() => setFirstVisible(true), TYPE_STEP_MS * (WORD.length + 1));

    return () => {
      cancelAnimationFrame(fadeIn);
      window.clearTimeout(fadeOut);
      window.clearTimeout(remove);
      typers.forEach(window.clearTimeout);
      window.clearTimeout(showFirst);
    };
  }, []);

  if (done) return null;

  const typingDone = typed >= WORD.length;

  return (
    <div
      aria-hidden
      className={`absolute inset-0 z-[60] flex flex-col items-center justify-center gap-7 bg-background transition-opacity ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div className="font-sans text-6xl font-semibold tracking-[0.35em] text-foreground">
        {WORD.slice(0, typed)}
        {/* Curseur clignotant tant que la frappe n'est pas finie. */}
        {!typingDone && (
          <span className="inline-block w-[0.06em] animate-[splash-caret_0.7s_step-end_infinite] bg-foreground align-baseline" style={{ height: "1em" }}>
            &nbsp;
          </span>
        )}
        <span
          className="text-primary transition-opacity"
          style={{
            opacity: firstVisible ? 1 : 0,
            transitionDuration: `${FIRST_FADE_MS}ms`,
          }}
        >
          FIRST
        </span>
      </div>
      <div className="h-[3px] w-40 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[splash-sweep_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
      </div>
    </div>
  );
};

export default SplashScreen;
