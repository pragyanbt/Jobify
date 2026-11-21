import Image from "next/image";

/**
 * Junu's avatar. Small sizes use a close-up of her face in a circle; `full`
 * shows the whole illustration (for large, empty-state spots).
 */
export function JunuAvatar({ size = 32, full = false, className = "" }: { size?: number; full?: boolean; className?: string }) {
  if (full) {
    return <Image src="/junu.png" alt="Junu" width={size} height={size} style={{ width: size, height: size }} className={`shrink-0 select-none self-start ${className}`} draggable={false} priority />;
  }
  return (
    <Image
      src="/junu-face.png"
      alt="Junu"
      width={size}
      height={size}
      // Fixed box: flex rows must not stretch it into an oval.
      style={{ width: size, height: size }}
      className={`shrink-0 select-none self-start rounded-full bg-brand-100 object-cover ring-1 ring-brand-200/70 ${className}`}
      draggable={false}
    />
  );
}
