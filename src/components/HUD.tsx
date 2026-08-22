import logo from "@/assets/logo.webp";

export default function HUD() {
  const RING_SIZE = 320;
  const CENTER = RING_SIZE / 2;
  const RADIUS = 128;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const ticks = Array.from({ length: 60 }, (_, i) => {
    const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const major = i % 5 === 0;

    const inner = major ? 138 : 142;
    const outer = major ? 154 : 150;

    return {
      x1: CENTER + inner * Math.cos(angle),
      y1: CENTER + inner * Math.sin(angle),
      x2: CENTER + outer * Math.cos(angle),
      y2: CENTER + outer * Math.sin(angle),
      major,
    };
  });

  const particles = Array.from({ length: 28 }, (_, i) => {
    const seed = (i * 137.508) % 360;
    const angle = (seed / 360) * Math.PI * 2;
    const radius = 52 + (i % 7) * 12;

    return {
      cx: CENTER + radius * Math.cos(angle),
      cy: CENTER + radius * Math.sin(angle),
      r: i % 3 === 0 ? 1.8 : 1,
      accent: i % 5 === 0,
    };
  });

  return (
    <>
      <style>
        {`
          @keyframes hudEnter {
            0% {
              opacity: 0;
              transform: scale(0.88) rotate(-4deg);
              filter: blur(10px);
            }

            60% {
              opacity: 1;
              transform: scale(1.02) rotate(0deg);
              filter: blur(0px);
            }

            100% {
              opacity: 1;
              transform: scale(1);
              filter: blur(0px);
            }
          }

          @keyframes boxEnter {
            0% {
              opacity: 0;
              transform: translateY(18px);
              filter: blur(6px);
            }

            100% {
              opacity: 1;
              transform: translateY(0);
              filter: blur(0px);
            }
          }

          @keyframes glowPulse {
            0%, 100% {
              opacity: 0.25;
              transform: translateY(-50%) scale(1);
            }

            50% {
              opacity: 0.45;
              transform: translateY(-50%) scale(1.05);
            }
          }
        `}
      </style>

      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden">
        {/* Background Dot Grid */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at center, rgba(255,255,255,0.9) 0.8px, transparent 0.8px)",
            backgroundSize: "22px 22px",
          }}
        />

        {/* Horizontal scan lines */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            background:
              "repeating-linear-gradient(to bottom, transparent 0px, transparent 4px, black 5px)",
          }}
        />

        {/* Centered Content Wrapper */}
        <div className="relative z-10 flex flex-col items-center justify-center gap-12">
          {/* Ambient radial glow */}
          <div
            className="absolute top-[110px] w-[420px] h-[420px] rounded-full bg-[#eeff41]/[0.04] blur-3xl"
            style={{
              animation: "glowPulse 4s ease-in-out infinite",
            }}
          />

          {/* Main HUD */}
          <div
            className="
              relative flex items-center justify-center
              opacity-0 scale-90
              animate-[hudEnter_1s_ease-out_forwards]
            "
          >
            {/* Outer frame */}
            <div className="absolute w-[360px] h-[360px] rounded-full border border-[#111111]" />

            {/* Rotating SVG system */}
            <svg
              width={RING_SIZE}
              height={RING_SIZE}
              viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
              className="animate-[spin_36s_linear_infinite]"
            >
              <defs>
                <linearGradient
                  id="arcGrad"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#FFFD01" stopOpacity="1" />
                  <stop offset="60%" stopColor="#D9FF4D" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#FFFD01" stopOpacity="0.25" />
                </linearGradient>
              </defs>

              {/* Outer tick marks */}
              {ticks.map((tick, i) => (
                <line
                  key={i}
                  x1={tick.x1}
                  y1={tick.y1}
                  x2={tick.x2}
                  y2={tick.y2}
                  stroke={tick.major ? "#262626" : "#151515"}
                  strokeWidth={tick.major ? 1.4 : 0.7}
                />
              ))}

              {/* Outer ring */}
              <circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="#0e0e0e60"
                stroke="#151515"
                strokeWidth="1.5"
              />

              {/* Structural rings */}
              <circle
                cx={CENTER}
                cy={CENTER}
                r="96"
                fill="none"
                stroke="#121212"
                strokeWidth="1"
              />

              <circle
                cx={CENTER}
                cy={CENTER}
                r="72"
                fill="none"
                stroke="#101010"
                strokeWidth="0.8"
              />

              {/* Progress Arc */}
              <circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke="url(#arcGrad)"
                strokeWidth="2.5"
                strokeDasharray={`${CIRCUMFERENCE * 0.72} ${
                  CIRCUMFERENCE * 0.28
                }`}
                strokeDashoffset={CIRCUMFERENCE * 0.04}
                strokeLinecap="round"
                transform={`rotate(-90 ${CENTER} ${CENTER})`}
                opacity="0.9"
              />

              {/* Accent head dot */}
              <circle
                cx={CENTER + RADIUS * Math.cos(Math.PI * 1.41)}
                cy={CENTER + RADIUS * Math.sin(Math.PI * 1.41)}
                r="4"
                fill="#FFFD01"
              />

              {/* Floating particles */}
              {particles.map((p, i) => (
                <circle
                  key={i}
                  cx={p.cx}
                  cy={p.cy}
                  r={p.r}
                  fill={p.accent ? "#FFFD01" : "#f4f4f4"}
                  opacity={p.accent ? 0.8 : 0.25}
                />
              ))}

              {/* Crosshair */}
              <line
                x1={CENTER - 18}
                y1={CENTER}
                x2={CENTER - 6}
                y2={CENTER}
                stroke="#e7e7e7"
                strokeWidth="1"
                opacity="0.7"
              />

              <line
                x1={CENTER + 6}
                y1={CENTER}
                x2={CENTER + 18}
                y2={CENTER}
                stroke="#e7e7e7"
                strokeWidth="1"
                opacity="0.7"
              />

              <line
                x1={CENTER}
                y1={CENTER - 18}
                x2={CENTER}
                y2={CENTER - 6}
                stroke="#e7e7e7"
                strokeWidth="1"
                opacity="0.7"
              />

              <line
                x1={CENTER}
                y1={CENTER + 6}
                x2={CENTER}
                y2={CENTER + 18}
                stroke="#e7e7e7"
                strokeWidth="1"
                opacity="0.7"
              />

              {/* Center dot */}
              <circle cx={CENTER} cy={CENTER} r="3" fill="#FFFD01" />
            </svg>

            {/* Center Content */}
            <div className="absolute flex flex-col items-center justify-center">
              <div className="relative flex items-center justify-center w-[92px] h-[92px] rounded-2xl border border-[#1b1b1b] bg-black/80 backdrop-blur-xl shadow-[0_0_40px_rgba(255,253,1,0.05)]">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a]" />

                <div className="relative flex items-center justify-center z-10">
                  <div className="absolute rounded-full" />
                  <img src={logo} alt="Logo" className="w-full h-full object-contain" />
                </div>
              </div>
            </div>

            {/* Corner brackets */}
            <>
              <div className="absolute left-0 top-0 w-10 h-10 border-l border-t border-[#2a2a2a]" />
              <div className="absolute right-0 top-0 w-10 h-10 border-r border-t border-[#2a2a2a]" />
              <div className="absolute left-0 bottom-0 w-10 h-10 border-l border-b border-[#2a2a2a]" />
              <div className="absolute right-0 bottom-0 w-10 h-10 border-r border-b border-[#2a2a2a]" />
            </>
          </div>

          {/* Bottom Readout */}
          <div className="flex items-center gap-10 mt-4 text-[10px] tracking-[0.3em] uppercase text-[#9a9a9a]">
            {/* Box 1 */}
            <div
              className="
                flex flex-col items-center gap-1
                opacity-0 translate-y-4
                animate-[boxEnter_0.6s_ease-out_0.9s_forwards]
              "
            >
              <span>Build</span>
              <span className="text-[#FFFD01]">Precision</span>
            </div>

            {/* Box 2 */}
            <div
              className="
                flex flex-col items-center gap-1
                opacity-0 translate-y-4
                animate-[boxEnter_0.6s_ease-out_1.2s_forwards]
              "
            >
              <span>Network</span>
              <span className="text-white">Presence</span>
            </div>

            {/* Box 3 */}
            <div
              className="
                flex flex-col items-center gap-1
                opacity-0 translate-y-4
                animate-[boxEnter_0.6s_ease-out_1.5s_forwards]
              "
            >
              <span>Evolve</span>
              <span className="text-[#ffbf60]">Momentum</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}