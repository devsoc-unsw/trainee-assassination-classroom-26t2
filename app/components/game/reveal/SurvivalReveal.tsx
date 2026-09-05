import {
  SURVIVAL_IMPOSTER_STAGE,
  SURVIVAL_RESULT_STAGE,
  resultCopy,
  tallyVotesForDisplay,
} from "@/app/lib/reveal";
import type {
  Player,
  PlayerId,
  RoundReveal as RoundRevealData,
} from "@/shared/types";

interface SurvivalRevealProps {
  reveal: RoundRevealData;
  accusedId: PlayerId | null;
  players: Player[];
  stage: number;
}

export function SurvivalReveal({
  reveal,
  accusedId,
  players,
  stage,
}: SurvivalRevealProps) {
  const tally = tallyVotesForDisplay(reveal.votes, players);
  const accused = accusedId ? players.find((p) => p.id === accusedId) : null;
  const imposter = players.find((p) => p.id === reveal.imposterId);

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <section className="reveal-beat">
        <h2 className="text-lg font-semibold">How the room voted</h2>
        {tally.length === 0 ? (
          <p>Nobody was singled out.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {tally.map(({ player, count }) => (
              <li key={player.id} style={{ color: player.colour }}>
                {player.nickname} — {count} vote{count === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        )}
      </section>

      {stage >= 1 && (
        <section className="reveal-beat">
          <h2 className="text-lg font-semibold">Who the room accused</h2>
          <p className="mt-2">
            {accused ? (
              <span style={{ color: accused.colour }}>{accused.nickname}</span>
            ) : (
              "No one. The vote was a tie!"
            )}
          </p>
        </section>
      )}

      {stage >= SURVIVAL_IMPOSTER_STAGE && imposter && (
        <section className="reveal-beat reveal-imposter-flourish">
          <h2 className="text-lg font-semibold">The imposter was...</h2>
          <p
            className="mt-2 text-xl font-bold"
            style={{ color: imposter.colour }}
          >
            {imposter.nickname}
          </p>
        </section>
      )}

      {stage >= 3 && (
        <section className="reveal-beat">
          <h2 className="text-lg font-semibold">The word was</h2>
          <p className="mt-2 text-xl font-bold">{reveal.word}</p>
        </section>
      )}

      {stage >= SURVIVAL_RESULT_STAGE && (
        <section className="reveal-beat">
          <h2 className="text-lg font-semibold">
            {resultCopy(reveal.winner, false)}
          </h2>
        </section>
      )}
    </div>
  );
}
