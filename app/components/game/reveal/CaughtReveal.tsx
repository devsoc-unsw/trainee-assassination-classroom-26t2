import { CAUGHT_RESULT_STAGE, resultCopy } from "@/app/lib/reveal";
import type { RoundReveal as RoundRevealData } from "@/shared/types";

interface CaughtRevealProps {
  reveal: RoundRevealData;
  stage: number;
}

export function CaughtReveal({ reveal, stage }: CaughtRevealProps) {
  const guessText = reveal.finalGuess?.text || null;

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <section className="reveal-beat">
        <h2 className="text-lg font-semibold">
          The word was <strong>{reveal.word}</strong>
        </h2>
        <p className="mt-2">
          {guessText ? `They guessed: "${guessText}"` : "They never answered."}
        </p>
      </section>

      {stage >= CAUGHT_RESULT_STAGE && (
        <section className="reveal-beat">
          <h2 className="text-lg font-semibold">
            {resultCopy(reveal.winner, true)}
          </h2>
        </section>
      )}
    </div>
  );
}
