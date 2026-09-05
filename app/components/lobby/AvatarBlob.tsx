interface AvatarBlobProps {
  colour: string;
  initial: string;
  size?: "sm" | "md" | "lg";
}

// Placeholder avatar: a colour blob with an initial.
export function AvatarBlob({ colour, initial, size = "md" }: AvatarBlobProps) {
  const dimensionClass =
    size === "sm"
      ? "h-10 w-10 text-sm"
      : size === "lg"
        ? "h-20 w-20 text-2xl"
        : "h-16 w-16 text-xl";

  return (
    <div
      className={`avatar-blob flex items-center justify-center rounded-full font-bold text-white ${dimensionClass}`}
      style={{ backgroundColor: colour }}
    >
      {initial}
    </div>
  );
}
