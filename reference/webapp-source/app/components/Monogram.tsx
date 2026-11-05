import Image from "next/image";

// Rundes Wappen des Clans (Helm und Schwerter). Für kleine Größen im Menü und auf Karten.
export default function Monogram({ size = 44 }: { size?: number }) {
  return (
    <Image
      src="/vza-emblem.webp"
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full"
      priority={size >= 64}
    />
  );
}
