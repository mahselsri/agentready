import Link from "next/link";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0b2545" />
      <rect x="7" y="19" width="18" height="5" rx="1.5" fill="#ffe066" />
      <path d="M9 14l-3-3 3-3M23 14l3-3-3-3" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo() {
  return (
    <Link href="/" className="logo" aria-label="AgentReady home">
      <LogoMark />
      AgentReady
    </Link>
  );
}
