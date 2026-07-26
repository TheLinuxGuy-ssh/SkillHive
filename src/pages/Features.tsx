import { useEffect, useRef } from "react";

const pillars = [
  {
    index: "01",
    label: "Presence",
    line: "Work with people, not next to a notification.",
  },
  {
    index: "02",
    label: "Privacy",
    line: "Some conversations are just between two people.",
  },
  {
    index: "03",
    label: "Intention",
    line: "A feed you open. Not one that opens you.",
  },
  {
    index: "04",
    label: "Allies",
    line: "No followers. No audience. Just people who chose each other.",
  },
];

export default function Features() {
  const sectionRef = useRef<HTMLDivElement>(null);

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

        <div className="fs-pillars">
          {pillars.map((p, i) => (
            <div
              key={p.index}
              className="fs-pillar f-reveal"
              data-delay={`${i * 150}`}
            >
              <span className="fs-pillar-index">{p.index}</span>
              <div className="fs-pillar-body">
                <h3 className="fs-pillar-name">{p.label}</h3>
                <p className="fs-pillar-line">{p.line}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="fs-closer">
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
          margin-bottom: 6rem;
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

        .fs-pillars {
          display: flex;
          flex-direction: column;
          border-top: 1px solid var(--ink-faint);
          border-bottom: 1px solid var(--ink-faint);
        }

        .fs-pillar {
          display: grid;
          grid-template-columns: 4rem 1fr;
          gap: 2rem;
          align-items: baseline;
          padding: 3rem 0;
          border-bottom: 1px solid var(--ink-faint);
          position: relative;
        }

        .fs-pillar::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--ember);
          transform: scaleY(0);
          transform-origin: bottom;
          transition: transform 0.35s cubic-bezier(0.16,1,0.3,1);
        }

        .fs-pillar:hover::before {
          transform: scaleY(1);
        }

        .fs-pillar:last-child {
          border-bottom: none;
        }

        .fs-pillar-index {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          letter-spacing: 0.25em;
          color: var(--ember);
          padding-top: 0.5rem;
        }

        .fs-pillar-body {
          display: flex;
          align-items: baseline;
          gap: 2.5rem;
          flex-wrap: wrap;
        }

        .fs-pillar-name {
          font-family: Helvetica;
          font-size: clamp(1.6rem, 4vw, 3.5rem);
          font-weight: 800;
          line-height: 0.95;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin: 0;
          transition: color 0.3s ease;
        }

        .fs-pillar:hover .fs-pillar-name {
          color: var(--ember);
        }

        .fs-pillar-line {
          font-family: var(--font-mono);
          font-size: 0.78rem;
          line-height: 1.8;
          color: var(--ink-muted);
          margin: 0;
          max-width: 380px;
          transition: color 0.3s ease;
        }

        .fs-closer {
          margin-top: 6rem;
          padding-top: 3rem;
          text-align: center;
          border-top: 1px solid var(--ink-faint);
        }

        .fs-closer-text {
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

        @media (max-width: 768px) {
          .fs-inner {
            padding: 5rem 1.5rem;
          }
          .fs-pillar {
            grid-template-columns: 2.5rem 1fr;
            gap: 1rem;
            padding-left: 0.5rem;
            padding-top: 2rem;
            padding-bottom: 2rem;
          }
          .fs-pillar-body {
            flex-direction: column;
            gap: 0.6rem;
          }
          .fs-lede {
            margin-bottom: 4rem;
          }
        }
      `}</style>
    </section>
  );
}