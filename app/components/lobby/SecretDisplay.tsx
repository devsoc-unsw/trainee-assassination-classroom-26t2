import type { PlayerSecret } from "@/shared/types";

interface SecretDisplayProps {
  secret: PlayerSecret;
}

export function SecretDisplay({ secret }: SecretDisplayProps) {
  const isImposter = "isImposter" in secret;

  return (
    <div className="relative w-[320px] h-[140px] overflow-hidden">
      <div
        className="frame-imposter-chameleon-reveal absolute top-0 left-0 w-[140px] h-[320px]"
        style={{
          transform: "rotate(-90deg) translateX(-100%)",
          transformOrigin: "top left",
        }}
        aria-hidden
      />
      <div className="absolute left-[110px] right-[10px] top-[8px] bottom-[52px] flex flex-col items-center justify-center gap-1 text-center">
        {isImposter ? (
          <>
            <p className="text-xs font-bold text-red-600">YOU ARE AN IMPOSTER!</p>
            <p className="text-xs font-bold text-black">Hint: {secret.category}</p>
          </>
        ) : (
          <>
            <p className="text-xs font-bold text-black">Category: {secret.category}</p>
            <p className="text-xs font-bold text-black">Word: {secret.word}</p>
          </>
        )}
      </div>
    </div>
  );
}
