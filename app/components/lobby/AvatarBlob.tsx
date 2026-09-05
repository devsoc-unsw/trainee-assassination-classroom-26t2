interface AvatarBlobProps {
  colour: string;
  initial: string;
  size?: "sm" | "md" | "lg";
  // Replaces the `size` preset's height/width/text classes outright, for callers
  // that size the blob fluidly instead of picking a preset (the drawing round
  // scales it from its layout container). Passing both would leave two competing
  // height utilities whose winner depends on stylesheet order, so it is one or
  // the other.
  className?: string;
}

// Placeholder avatar: a colour blob with an initial.
export function AvatarBlob({
  colour,
  initial,
  size = "md",
  className,
}: AvatarBlobProps) {
  const dimensionClass =
    className ??
    (size === "sm"
      ? "h-10 w-10 text-sm"
      : size === "lg"
        ? "h-20 w-20 text-2xl"
        : "h-16 w-16 text-xl");

  return (
    <div
      className={`avatar-blob flex items-center justify-center rounded-full font-bold text-white ${dimensionClass}`}
      style={{ backgroundColor: colour }}
    >
      {initial}
    </div>
  );
}
