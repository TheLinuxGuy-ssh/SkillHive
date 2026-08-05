<img width="1983" height="793" alt="SkillHiive Banner" src="https://github.com/user-attachments/assets/c5f7801e-c4f7-4db1-9f69-f79653b9bccf" />

# SkillHiive Web

If you are reading this, you are looking at the web foundation of SkillHiive.

SkillHiive is a learning and community platform for people who want to connect, collaborate, and grow together. This repository contains the browser experience: the main product surface for discovery, learning flows, social interaction, and account-level platform management.

This repo is closely related to **SkillHiive Mobile**. Think of this codebase as the broad, desktop-capable platform layer, while the mobile repo delivers a focused, native-first experience for users on the go. Both should feel like the same product, not two disconnected apps.

## What this repository is responsible for

This web repo is where we shape the core product experience in a browser context, including:

- onboarding and account lifecycle flows
- learning content discovery and participation
- community and collaboration interfaces
- platform-level UX patterns and reusable UI primitives
- integrations needed for a full web experience

If you are implementing a feature that requires larger information density, advanced navigation, or workspace-style usage, this is usually the right place.

## How this repo relates to SkillHiive Mobile

The relationship is intentional:

- **SkillHiive Web** is the broad platform surface and often the fastest place to introduce full-featured workflows.
- **SkillHiive Mobile** is the mobile app companion, optimized for everyday usage, quick interaction loops, and device-native behavior.
- Product behavior, terminology, and user expectations should stay consistent between the two repos.
- Feature rollout may happen in one repo first, but parity planning should always be explicit.

If you change product language, domain logic assumptions, or API contracts here, consider the downstream impact on mobile before merging.

## Tech profile

This repository is primarily implemented in **TypeScript** with styling in **CSS**.

That means the default expectation for contributions is typed, maintainable frontend architecture with clear component boundaries and predictable styling behavior.

## Local development

Clone the repository and install dependencies with your preferred package manager:

```bash
git clone https://github.com/SkillHiive/web.git
cd web
cp .env.example .env.local
npm install
```

Start the development server using your project’s script conventions:

```bash
npm run dev
```

Build and validate before opening a pull request:

```bash
npm run build
npm run lint
```

If script names differ, use the scripts defined in `package.json`.

## Engineering expectations

When contributing here, optimize for long-term product quality, not short-term patching.

- Keep UI and domain logic separated.
- Preserve type safety; avoid bypassing types unless there is a documented reason.
- Prefer composable components over one-off screens.
- Treat accessibility, performance, and responsiveness as baseline requirements.
- Document any behavior that mobile teams need to mirror.

## Cross-repo contribution workflow (Web + Mobile)

For any non-trivial feature, ask and answer these questions in your PR:

1. Does this change alter shared product behavior?
2. Does the Mobile version need a matching implementation or follow-up issue?
3. Are API or data-shape assumptions still valid for both clients?
4. Are copy and interaction patterns still consistent across platforms?

This habit keeps SkillHiive coherent as one product.

## Pull requests

A strong PR in this repository includes:

- clear problem statement and user impact
- screenshots or recordings for UI changes
- notes about mobile implications when relevant
- migration notes for breaking changes
- explicit follow-up tasks when parity is deferred

## License

AGPLv3
