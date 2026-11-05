import Image from "next/image";

// Das vollständige Logo mit Schriftzug, z. B. auf der Anmeldeseite.
export default function ClanLogo({ size = 240 }: { size?: number }) {
  return (
    <div className="hud-radar mx-auto" style={{ maxWidth: size }}>
      <Image
        src="/vza-logo.webp"
        alt="Clan Vizsla"
        width={size}
        height={size}
        priority
        className="mx-auto h-auto drop-shadow-[0_0_24px_rgba(53,214,255,0.15)]"
      />
    </div>
  );
}
