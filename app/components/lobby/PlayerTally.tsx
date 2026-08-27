interface PlayerTallyProps {
  count: number;
  min: number;
  max: number;
}

export function PlayerTally({ count, min, max }: PlayerTallyProps) {
  const met = count >= min;

  return (
    <p
      className={`player-tally text-sm font-semibold ${met ? "text-green-700" : "text-black/60"}`}
    >
      {count}/{max} Players
    </p>
  );
}
