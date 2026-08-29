# Cliffhanger Build Log

## Current architecture

- Next.js App Router with React, TypeScript, and Tailwind CSS.
- Deterministic client-side story state machine; live and demo inputs share the same scoring path.
- Browser geolocation with timed simulation fallback; precise coordinates remain in memory only.
- Web Audio and speech synthesis fallback, with a server-only ElevenLabs route when configured.
- Local-first run state with no authentication or database dependency.

## Important assumptions

- The first episode targets a condensed hackathon demo while preserving the shape of an 8–12 minute real run.
- Demo mode is explicitly labelled and can accelerate intervals without changing story logic.
- Missing GPS, motion access, or ElevenLabs must never block the complete experience.
- The repository has no configured remote; stable milestones will be committed locally until a remote exists.

## Major decisions

- Use deterministic authored nodes instead of runtime LLM generation so every branch is safe and demonstrable.
- Score relative to calibration and selected difficulty so the experience rewards personal effort rather than elite speed.
- Keep exact GPS samples on-device and expose only derived pace/distance to the story engine and spectator view.
- Build original procedural audio layers and browser speech fallback to avoid copyrighted assets and network fragility.

## Implementation plan

1. Scaffold the application, design tokens, and quality gates.
2. Implement the authored episode, interval scoring, and branching outcomes.
3. Add geolocation, simulation, narration, and adaptive audio services.
4. Build the cinematic mobile run, decisions, endings, summary, and spectator view.
5. Verify the complete loop in live-fallback and demo modes, then deploy and test over HTTPS.

## Completed milestones

- Repository and environment audit completed.

## Known limitations

- No Git remote is configured, so pushes are currently impossible.
- ElevenLabs availability is unknown; browser speech synthesis is the guaranteed baseline.

## Next highest-priority task

- Scaffold the mobile-first experience and establish isolated agent ownership boundaries.
