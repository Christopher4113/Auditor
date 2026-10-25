import { useState } from "react";
import { Pause, Play } from "lucide-react";
import "./SponsorRibbon.css";

const partners = [
  { name: "Hyphenate", mark: "hyphenate", style: "hyphenate" },
  { name: "Convex", mark: "convex", style: "convex" },
  { name: "Moss", mark: "moss", style: "moss" },
  { name: "CRS Credit", mark: "credit", style: "credit" },
  { name: "Anthropic", mark: "anthropic", style: "anthropic" },
  { name: "Vultr", mark: "vultr", style: "vultr" },
  { name: "context.dev", mark: "context", style: "context" },
] as const;

function PartnerNames({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <ul className="sponsor-ribbon__names" aria-hidden={duplicate || undefined}>
      {partners.map((partner) => (
        <li
          className={`sponsor-ribbon__partner sponsor-ribbon__partner--${partner.style}`}
          key={partner.name}
        >
          <span
            className={`sponsor-ribbon__mark sponsor-ribbon__mark--${partner.mark}`}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>{partner.name}</span>
        </li>
      ))}
    </ul>
  );
}

export default function SponsorRibbon() {
  const [paused, setPaused] = useState(false);

  return (
    <section
      className={`sponsor-ribbon${paused ? " sponsor-ribbon--paused" : ""}`}
      aria-label="Cal Hacks tracks and technology"
    >
      <div className="sponsor-ribbon__heading">
        <span className="sponsor-ribbon__eyebrow">Cal Hacks 13.0</span>
        <span className="sponsor-ribbon__label">
          <span aria-hidden="true" /> Tracks &amp; technology
        </span>
      </div>
      <div className="sponsor-ribbon__viewport">
        <div className="sponsor-ribbon__track" id="sponsor-ribbon-track">
          <PartnerNames />
          <PartnerNames duplicate />
        </div>
      </div>
      <button
        className="sponsor-ribbon__motion"
        type="button"
        aria-label={
          paused
            ? "Resume company name animation"
            : "Pause company name animation"
        }
        aria-pressed={paused}
        aria-controls="sponsor-ribbon-track"
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? <Play size={13} /> : <Pause size={13} />}
      </button>
    </section>
  );
}
