import { useEffect, useRef } from "react";

function PresenceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="5.5" />
      <circle cx="15" cy="15" r="5.5" />
    </svg>
  );
}

function PrivacyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="11" width="12" height="9" rx="1.5" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </svg>
  );
}

function IntentionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AlliesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="12" r="3.2" />
      <circle cx="16.5" cy="12" r="3.2" />
      <path d="M10.3 12h3.4" />
    </svg>
  );
}

const pillars = [
  {
    index: "01",
    label: "Presence",
    line: "Work with people, not next to a notification.",
    icon: PresenceIcon,
  },
  {
    index: "02",
    label: "Privacy",
    line: "Some conversations are just between two people.",
    icon: PrivacyIcon,
  },
  {
    index: "03",
    label: "Intention",
    line: "A feed you open. Not one that opens you.",
    icon: IntentionIcon,
  },
  {
    index: "04",
    label: "Allies",
    line: "No followers. No audience. Just people who chose each other.",
    icon: AlliesIcon,
  },
];

export default function Features() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Staggered scroll reveal (unchanged behavior from before)
  useEffect(() => {
    const els = sectionRef.current?.querySelectorAll(".f-reveal");
    if (!els) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const delay = el.dataset.delay ? parseInt(el.dataset.delay) : 0;
            setTimeout(() => el.classList.add("f-in"), delay);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.1 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Ambient cursor glow over the pillar grid — quiet, not a spotlight/toy.
  // Skipped on touch devices and when the user prefers reduced motion.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof window === "undefined") return;

    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!canHover || reduceMotion) return;

    const handleMove = (e: MouseEvent) => {
      const rect = grid.getBoundingClientRect();
      grid.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
      grid.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
    };
    const handleEnter = () => grid.classList.add("fs-grid-active");
    const handleLeave = () => grid.classList.remove("fs-grid-active");

    grid.addEventListener("mousemove", handleMove);
    grid.addEventListener("mouseenter", handleEnter);
    grid.addEventListener("mouseleave", handleLeave);
    return () => {
      grid.removeEventListener("mousemove", handleMove);
      grid.removeEventListener("mouseenter", handleEnter);
      grid.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return (
    <section className="fs-root" ref={sectionRef}>
      <div className="fs-vignette" aria-hidden="true" />
      <div className="fs-glow" aria-hidden="true" />

      <div className="fs-inner">
        <div className="fs-lede f-reveal" data-delay="0">
          <p className="section-label">Built different</p>
          <h2 className="fs-headline">
            Most platforms want your time.
            <br />
            <span className="fs-accent">We value your presence.</span>
          </h2>
        </div>

        <div className="fs-pillars-grid" ref={gridRef}>
          <div className="fs-grid-spot" aria-hidden="true" />
          <span className="fs-grid-mark" aria-hidden="true" />

          {pillars.map((p, i) => {
            const Icon = p.icon;
            return (
              <div
                key={p.label}
                className="fs-pillar-cell f-reveal"
                data-delay={`${i * 120}`}
              >
                <span className="fs-pillar-ghost" aria-hidden="true">
                  {p.index}
                </span>
                <div className="fs-pillar-icon">
                  <Icon />
                </div>
                <h3 className="fs-pillar-name">{p.label}</h3>
                <p className="fs-pillar-line">{p.line}</p>
              </div>
            );
          })}
        </div>

        <div className="fs-closer f-reveal" data-delay="500">
          <span className="fs-closer-mark" aria-hidden="true">
            &rdquo;
          </span>
          <p className="fs-closer-text">
            You&apos;ll understand the rest once you use it.
          </p>
        </div>
      </div>

      <style>{`
        .f-reveal {
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.85s cubic-bezier(0.16,1,0.3,1),
                      transform 0.85s cubic-bezier(0.16,1,0.3,1);
        }
        .f-reveal.f-in {
          opacity: 1;
          transform: translateY(0);
        }

        .fs-root {
          position: relative;
          padding: 0;
          background: var(--bg);
        }

        .fs-inner {
          max-width: 900px;
          margin: 0 auto;
          padding: 10rem 4rem;
          position: relative;
          z-index: 1;
        }

        .fs-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse 70% 50% at 50% 20%,
            rgba(200, 197, 42, 0.025) 0%,
            transparent 60%
          );
          pointer-events: none;
          z-index: 0;
        }

        .fs-glow {
          position: absolute;
          top: 20%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 60vw;
          height: 60vw;
          max-width: 800px;
          max-height: 800px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(200, 197, 42, 0.02) 0%,
            transparent 70%
          );
          pointer-events: none;
          z-index: 0;
          animation: ambientDrift 10s ease-in-out infinite;
        }

        .fs-lede {
          margin-bottom: 5.5rem;
        }

        .fs-headline {
          font-family: Helvetica, sans-serif;
          font-size: clamp(2.6rem, 6vw, 5.5rem);
          font-weight: 900;
          line-height: 0.95;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin: 1.5rem 0 0;
        }

        .fs-accent {
          color: var(--ember);
          font-style: italic;
        }

        /* ---------- pillar grid ---------- */

        .fs-pillars-grid {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-top: 1px solid var(--ink-faint);
          border-bottom: 1px solid var(--ink-faint);
        }

        .fs-pillars-grid::before,
        .fs-pillars-grid::after {
          content: "";
          position: absolute;
          background: var(--ink-faint);
          z-index: 1;
        }
        .fs-pillars-grid::before {
          top: 0;
          bottom: 0;
          left: 50%;
          width: 1px;
        }
        .fs-pillars-grid::after {
          left: 0;
          right: 0;
          top: 50%;
          height: 1px;
        }

        .fs-grid-spot {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.5s ease;
          background: radial-gradient(
            circle 280px at var(--spot-x, 50%) var(--spot-y, 50%),
            color-mix(in srgb, var(--ember) 7%, transparent),
            transparent 70%
          );
          z-index: 0;
        }
        .fs-grid-active .fs-grid-spot {
          opacity: 1;
        }

        .fs-grid-mark {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--ember);
          transform: translate(-50%, -50%);
          z-index: 2;
          animation: fsBreathe 4s ease-in-out infinite;
        }

        @keyframes fsBreathe {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.85; transform: translate(-50%, -50%) scale(1.7); }
        }

        .fs-pillar-cell {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          padding: 3.25rem 3rem;
          overflow: hidden;
        }

        .fs-pillar-ghost {
          position: absolute;
          top: 1rem;
          right: 1.5rem;
          font-family: Helvetica, sans-serif;
          font-weight: 800;
          font-size: clamp(3rem, 5vw, 4.5rem);
          line-height: 1;
          color: color-mix(in srgb, var(--ink) 5%, transparent);
          user-select: none;
          z-index: 0;
          transition: color 0.4s ease, transform 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        .fs-pillar-cell:hover .fs-pillar-ghost {
          color: color-mix(in srgb, var(--ember) 18%, transparent);
          transform: scale(1.05);
        }

        .fs-pillar-icon {
          position: relative;
          z-index: 1;
          width: 26px;
          height: 26px;
          color: var(--ink-muted);
          transition: color 0.35s ease;
        }
        .fs-pillar-icon svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .fs-pillar-cell:hover .fs-pillar-icon {
          color: var(--ember);
        }

        .fs-pillar-name {
          position: relative;
          z-index: 1;
          display: inline-block;
          font-family: Helvetica;
          font-size: clamp(1.5rem, 2.6vw, 2.1rem);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin: 0.25rem 0 0;
          padding-bottom: 0.5rem;
          transition: color 0.3s ease;
        }
        .fs-pillar-name::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: 0;
          height: 2px;
          width: 0;
          background: var(--ember);
          transition: width 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        .fs-pillar-cell:hover .fs-pillar-name {
          color: var(--ember);
        }
        .fs-pillar-cell:hover .fs-pillar-name::after {
          width: 2.25rem;
        }

        .fs-pillar-line {
          position: relative;
          z-index: 1;
          font-family: var(--font-mono);
          font-size: 0.78rem;
          line-height: 1.8;
          color: var(--ink-muted);
          margin: 0;
          max-width: 340px;
        }

        /* ---------- closer ---------- */

        .fs-closer {
          position: relative;
          margin-top: 6rem;
          padding-top: 3rem;
          text-align: center;
          border-top: 1px solid var(--ink-faint);
        }

        .fs-closer-mark {
          position: absolute;
          top: 0.5rem;
          left: 50%;
          transform: translateX(-50%);
          font-family: Helvetica, sans-serif;
          font-size: 6rem;
          line-height: 1;
          color: color-mix(in srgb, var(--ink) 8%, transparent);
          z-index: 0;
          pointer-events: none;
        }

        .fs-closer-text {
          position: relative;
          z-index: 1;
          font-family: Helvetica;
          font-size: clamp(1.4rem, 3vw, 2.4rem);
          font-style: italic;
          font-weight: 600;
          line-height: 1.55;
          text-align: center;
          letter-spacing: -0.02em;
          color: var(--ink-muted);
          max-width: 500px;
          margin: 0 auto;
        }

        @media (prefers-reduced-motion: reduce) {
          .f-reveal {
            transition: none;
            opacity: 1;
            transform: none;
          }
          .fs-glow,
          .fs-grid-mark {
            animation: none;
          }
        }

        @media (max-width: 768px) {
          .fs-inner {
            padding: 5rem 1.5rem;
          }
          .fs-lede {
            margin-bottom: 3.5rem;
          }
          .fs-pillars-grid {
            grid-template-columns: 1fr;
          }
          .fs-pillars-grid::before,
          .fs-pillars-grid::after {
            display: none;
          }
          .fs-grid-mark {
            display: none;
          }
          .fs-pillar-cell {
            padding: 2.25rem 0.5rem;
            border-bottom: 1px solid var(--ink-faint);
          }
          .fs-pillar-cell:last-child {
            border-bottom: none;
          }
          .fs-pillar-ghost {
            font-size: 2.75rem;
            top: 1.75rem;
            right: 0;
          }
          .fs-closer {
            margin-top: 4rem;
          }
        }
      `}</style>
    </section>
  );
}