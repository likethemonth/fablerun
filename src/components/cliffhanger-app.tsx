"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ScrollLockedVideoHero from "@/components/ui/scroll-locked-video-hero";

type Stage =
  | "landing"
  | "profile"
  | "permissions"
  | "calibration"
  | "briefing"
  | "run"
  | "choice"
  | "ending"
  | "summary";
type Difficulty = "beginner" | "regular" | "intense";
type Relationship = "Partner" | "Friend" | "Sibling" | "Parent";
type PermissionState = "idle" | "ready" | "fallback";
type RunResult = "strong" | "success" | "near" | "miss";

interface Profile {
  savee: string;
  relationship: Relationship;
  difficulty: Difficulty;
}

interface RunScene {
  instruction: "RUN" | "PUSH" | "SPRINT" | "RECOVER" | "DECIDE";
  label: string;
  duration: number;
  story: (name: string) => string;
  pace: string;
  intensity: number;
}

export interface CliffhangerAppProps {
  episodeTitle?: string;
  initialDemoMode?: boolean;
}

const runScenes: RunScene[] = [
  {
    instruction: "RUN",
    label: "Quiet streets",
    duration: 52,
    story: (name) => `Keep it quiet. ${name} is three blocks beyond the bridge.`,
    pace: "6:04",
    intensity: 34,
  },
  {
    instruction: "PUSH",
    label: "Bridge approach",
    duration: 34,
    story: () => "The bridge is lifting. Beat it—or take the tunnel.",
    pace: "5:18",
    intensity: 63,
  },
  {
    instruction: "SPRINT",
    label: "Swarm crossing",
    duration: 22,
    story: (name) => `${name} can see you. Twenty seconds. Make them count.`,
    pace: "4:31",
    intensity: 94,
  },
  {
    instruction: "RECOVER",
    label: "Service corridor",
    duration: 42,
    story: () => "Door sealed. Breathe. Even the undead hate stairs.",
    pace: "7:46",
    intensity: 29,
  },
  {
    instruction: "SPRINT",
    label: "Extraction",
    duration: 28,
    story: (name) => `Extraction is moving. Get ${name} to the light.`,
    pace: "4:42",
    intensity: 100,
  },
];

const difficultyCopy: Record<Difficulty, { label: string; detail: string; time: string }> = {
  beginner: { label: "Beginner", detail: "Shorter pushes, longer cover", time: "8 min" },
  regular: { label: "Regular", detail: "Balanced cinematic intervals", time: "10 min" },
  intense: { label: "Intense", detail: "Fast cuts, tighter recoveries", time: "12 min" },
};

export default function CliffhangerApp({
  episodeTitle = "Last Light",
  initialDemoMode = true,
}: CliffhangerAppProps) {
  const [stage, setStage] = useState<Stage>("landing");
  const [profile, setProfile] = useState<Profile>({
    savee: "Natalie",
    relationship: "Partner",
    difficulty: "regular",
  });
  const [demoMode, setDemoMode] = useState(initialDemoMode);
  const [locationState, setLocationState] = useState<PermissionState>("idle");
  const [audioState, setAudioState] = useState<PermissionState>("idle");
  const [motionState, setMotionState] = useState<PermissionState>("idle");
  const [calibrationTime, setCalibrationTime] = useState(12);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [sceneTime, setSceneTime] = useState(runScenes[0].duration);
  const [paused, setPaused] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [spectator, setSpectator] = useState(false);
  const [result, setResult] = useState<RunResult>("success");
  const [choice, setChoice] = useState<"roof" | "tunnel" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0.84);
  const stageTitleRef = useRef<HTMLHeadingElement>(null);

  const scene = runScenes[sceneIndex];
  const threatDistance = Math.max(
    18,
    Math.round(128 - sceneIndex * 19 + (result === "strong" ? 16 : result === "miss" ? -18 : 0)),
  );
  const runProgress = ((sceneIndex + (1 - sceneTime / scene.duration)) / runScenes.length) * 100;

  useEffect(() => {
    if (stage === "landing") return;
    const timeout = window.setTimeout(() => stageTitleRef.current?.focus(), 120);
    return () => window.clearTimeout(timeout);
  }, [stage, spectator]);

  useEffect(() => {
    if (stage !== "calibration" || paused) return;
    const timer = window.setInterval(() => {
      setCalibrationTime((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          window.setTimeout(() => setStage("briefing"), 250);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage, paused]);

  useEffect(() => {
    if (stage !== "run" || paused || spectator) return;
    const timer = window.setInterval(() => {
      setElapsed((value) => value + 1);
      setDistance((value) => Number((value + 0.0034).toFixed(3)));
      setSceneTime((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage, paused, spectator]);

  const recentEvent = useMemo(() => {
    if (result === "strong") return "Shortcut unlocked · extra survivor found";
    if (result === "near") return "Radio dropped · swarm gained 12m";
    if (result === "miss") return "Route blocked · story redirected safely";
    return "Interval held · route remains clear";
  }, [result]);

  const goTo = (next: Stage) => {
    setStage(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = profile.savee.trim() || "Alex";
    const next = { ...profile, savee: trimmed };
    setProfile(next);
    try {
      window.localStorage.setItem("cliffhanger-profile", JSON.stringify(next));
    } catch {
      // Continue without persistence.
    }
    goTo("permissions");
  };

  const requestLocation = () => {
    if (demoMode || !navigator.geolocation) {
      setLocationState("fallback");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setLocationState("ready"),
      () => setLocationState("fallback"),
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 3000 },
    );
  };

  const enableAudio = () => {
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Comms online.");
        utterance.volume = 0.3;
        window.speechSynthesis.speak(utterance);
        setAudioState("ready");
      } else setAudioState("fallback");
    } catch {
      setAudioState("fallback");
    }
  };

  const beginCalibration = () => {
    if (locationState === "idle") setLocationState("fallback");
    if (audioState === "idle") setAudioState("fallback");
    if (motionState === "idle") setMotionState("fallback");
    setCalibrationTime(12);
    goTo("calibration");
  };

  const startRun = () => {
    setSceneIndex(0);
    setSceneTime(runScenes[0].duration);
    setElapsed(0);
    setDistance(0);
    setPaused(false);
    goTo("run");
  };

  const advanceScene = () => {
    if (sceneIndex === 2 && !choice) {
      goTo("choice");
      return;
    }
    if (sceneIndex >= runScenes.length - 1) {
      goTo("ending");
      return;
    }
    const next = sceneIndex + 1;
    setSceneIndex(next);
    setSceneTime(runScenes[next].duration);
  };

  const selectChoice = (nextChoice: "roof" | "tunnel") => {
    setChoice(nextChoice);
    setResult(nextChoice === "roof" ? "strong" : "success");
    const next = Math.min(3, runScenes.length - 1);
    setSceneIndex(next);
    setSceneTime(runScenes[next].duration);
    goTo("run");
  };

  if (stage === "landing") {
    return <ScrollLockedVideoHero onContinue={() => goTo("profile")} />;
  }

  if (spectator) {
    return (
      <SpectatorView
        scene={scene}
        sceneTime={sceneTime}
        profile={profile}
        distance={distance}
        threatDistance={threatDistance}
        recentEvent={recentEvent}
        onExit={() => setSpectator(false)}
        headingRef={stageTitleRef}
      />
    );
  }

  return (
    <main className={`app-shell stage-${stage}`}>
      <AmbientChrome />
      {stage !== "run" && <AppHeader onHome={() => goTo("landing")} demoMode={demoMode} />}

      {stage === "profile" && (
        <section className="screen screen--form">
          <ProgressHeader current={1} total={3} label="Create your stakes" />
          <div className="screen__copy">
            <p className="eyebrow danger">PERSONALISE THE MISSION</p>
            <h1 ref={stageTitleRef} tabIndex={-1}>Who gets you to the finish line?</h1>
            <p>We’ll thread them into the story. Nothing leaves this device.</p>
          </div>
          <form className="profile-form" onSubmit={saveProfile}>
            <label className="field-label" htmlFor="savee">Who are you trying to save?</label>
            <div className="name-field">
              <span aria-hidden="true">01</span>
              <input
                id="savee"
                value={profile.savee}
                onChange={(event) => setProfile({ ...profile, savee: event.target.value })}
                placeholder="Their first name"
                autoComplete="off"
                maxLength={24}
                required
              />
            </div>

            <fieldset>
              <legend className="field-label">They’re your…</legend>
              <div className="choice-grid choice-grid--relationship">
                {(["Partner", "Friend", "Sibling", "Parent"] as Relationship[]).map((relationship) => (
                  <ChoiceButton
                    key={relationship}
                    selected={profile.relationship === relationship}
                    onClick={() => setProfile({ ...profile, relationship })}
                  >
                    {relationship}
                  </ChoiceButton>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="field-label">Choose the pressure</legend>
              <div className="difficulty-stack">
                {(Object.keys(difficultyCopy) as Difficulty[]).map((difficulty) => {
                  const item = difficultyCopy[difficulty];
                  return (
                    <button
                      type="button"
                      className={`difficulty-card ${profile.difficulty === difficulty ? "is-selected" : ""}`}
                      key={difficulty}
                      onClick={() => setProfile({ ...profile, difficulty })}
                      aria-pressed={profile.difficulty === difficulty}
                    >
                      <i aria-hidden="true"><b /><b /><b /></i>
                      <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                      <em>{item.time}</em>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <button className="primary-action" type="submit">
              <span>Build my episode</span><ArrowIcon />
            </button>
          </form>
        </section>
      )}

      {stage === "permissions" && (
        <section className="screen screen--permissions">
          <ProgressHeader current={2} total={3} label="Systems check" />
          <div className="screen__copy">
            <p className="eyebrow safe">ON-DEVICE · PRIVATE</p>
            <h1 ref={stageTitleRef} tabIndex={-1}>Ready your field kit.</h1>
            <p>Cliffhanger only uses live signals to pace this episode. Precise location stays on your phone.</p>
          </div>

          <div className="permission-list">
            <PermissionCard
              icon="⌖"
              title="Location"
              detail="Distance and relative pace"
              state={locationState}
              onClick={requestLocation}
              action="Enable GPS"
            />
            <PermissionCard
              icon="◖))"
              title="Audio"
              detail="Narration, signals and adaptive mix"
              state={audioState}
              onClick={enableAudio}
              action="Test audio"
            />
            <PermissionCard
              icon="≈"
              title="Motion"
              detail="Optional cadence enhancement"
              state={motionState}
              onClick={() => setMotionState("fallback")}
              action="Use timed fallback"
            />
          </div>

          <div className="demo-switch-card">
            <div><span className="demo-pill">JUDGE MODE</span><strong>Reliable simulation</strong><small>Runs without GPS or external voice services.</small></div>
            <button
              type="button"
              className={`toggle ${demoMode ? "is-on" : ""}`}
              role="switch"
              aria-checked={demoMode}
              aria-label="Enable judging simulation"
              onClick={() => setDemoMode(!demoMode)}
            ><i /></button>
          </div>

          <button className="primary-action" onClick={beginCalibration}>
            <span>Calibrate my pace</span><ArrowIcon />
          </button>
          <button className="text-action" onClick={beginCalibration}>Continue with safe fallbacks</button>
        </section>
      )}

      {stage === "calibration" && (
        <section className="screen screen--calibration">
          <ProgressHeader current={3} total={3} label="Pace calibration" />
          <div className="calibration-orbit" aria-hidden="true">
            <div className="radar-sweep" />
            <i className="runner-dot" />
            <span className="threat-dot threat-dot--a" />
            <span className="threat-dot threat-dot--b" />
          </div>
          <div className="calibration-copy">
            <p className="eyebrow safe">BASELINE ACQUIRING</p>
            <h1 ref={stageTitleRef} tabIndex={-1}>Walk, then find your easy run.</h1>
            <p>No heroics yet. We’re learning what “fast” means for you.</p>
          </div>
          <div className="calibration-metric">
            <strong>{`00:${String(calibrationTime).padStart(2, "0")}`}</strong>
            <span>CALIBRATION REMAINING</span>
          </div>
          <div className="waveform waveform--wide" aria-label="Audio signal active">
            {Array.from({ length: 28 }, (_, index) => <i key={index} style={{ "--wave": `${24 + ((index * 17) % 62)}%` } as React.CSSProperties} />)}
          </div>
          <button className="secondary-action" onClick={() => goTo("briefing")}>Use demo baseline · 6:12 /km</button>
        </section>
      )}

      {stage === "briefing" && (
        <section className="screen screen--briefing">
          <div className="episode-art" aria-hidden="true">
            <div className="moon" /><div className="skyline" /><div className="episode-art__figure" />
            <span>EP. 01</span>
          </div>
          <div className="briefing-copy">
            <p className="eyebrow danger">TRANSMISSION RECEIVED</p>
            <h1 ref={stageTitleRef} tabIndex={-1}>{episodeTitle}</h1>
            <p>“{profile.savee} is trapped beyond the bridge. The shelter doors close in ten minutes.”</p>
          </div>
          <div className="briefing-stats">
            <span><b>10:00</b> episode</span><span><b>3</b> pushes</span><span><b>2+</b> endings</span>
          </div>
          <div className="safety-note"><ShieldIcon /><span><strong>Your body, your call.</strong> Slow down or end safely at any time. The story always continues.</span></div>
          <button className="primary-action primary-action--danger" onClick={startRun}>
            <span>Start episode</span><PlayIcon />
          </button>
        </section>
      )}

      {stage === "run" && (
        <section className={`run-screen intensity-${scene.instruction.toLowerCase()}`}>
          <div className="run-screen__fog" aria-hidden="true" />
          <header className="run-header">
            <div className="live-mark"><i /> LIVE · EP 01</div>
            <button className="demo-label-button" onClick={() => setDemoOpen(!demoOpen)} aria-expanded={demoOpen}>
              DEMO CONTROLS <ChevronIcon />
            </button>
          </header>

          <div className="run-progress" aria-label={`${Math.round(runProgress)} percent through episode`}><i style={{ width: `${runProgress}%` }} /></div>

          <div className="run-primary">
            <p className="eyebrow">INTERVAL {sceneIndex + 1} · {scene.label}</p>
            <h1 ref={stageTitleRef} tabIndex={-1}>{scene.instruction}</h1>
            <div className="run-countdown" aria-live="polite">{formatTime(sceneTime)}</div>
            <div className="target-line"><i /> {scene.instruction === "RECOVER" ? "Breathe. Keep moving." : "Hold above your baseline"}</div>
          </div>

          <div className="story-transmission">
            <div className="waveform" aria-hidden="true">
              {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--wave": `${18 + ((index * 23) % 70)}%` } as React.CSSProperties} />)}
            </div>
            <blockquote>“{scene.story(profile.savee)}”</blockquote>
            <span>CONTROL · LIVE TRANSMISSION</span>
          </div>

          <div className="run-metrics">
            <Metric label="PACE" value={scene.pace} unit="/KM" />
            <Metric label="DISTANCE" value={distance.toFixed(2)} unit="KM" />
            <div className="threat-metric">
              <div><span>THREAT</span><strong>{threatDistance}<small>M</small></strong></div>
              <div className="threat-track"><i style={{ width: `${Math.max(12, Math.min(90, threatDistance / 1.7))}%` }} /><b /></div>
              <em>{threatDistance < 60 ? "CLOSING" : "HELD"}</em>
            </div>
          </div>

          <div className="run-actions">
            <button className="pause-button" onClick={() => setPaused(true)}><PauseIcon /> PAUSE / END</button>
            <button className="spectator-button" onClick={() => setSpectator(true)}><ScreenIcon /> SPECTATOR</button>
          </div>

          {demoOpen && (
            <aside className="demo-console" aria-label="Demo simulation controls">
              <div><span className="demo-pill">SIMULATION</span><strong>Choose interval result</strong><button onClick={() => setDemoOpen(false)} aria-label="Close demo controls">×</button></div>
              <div className="demo-results">
                {(["strong", "success", "near", "miss"] as RunResult[]).map((item) => (
                  <button key={item} className={result === item ? "is-active" : ""} onClick={() => setResult(item)}>{item === "near" ? "Near miss" : item}</button>
                ))}
              </div>
              <p>{recentEvent}</p>
              <button className="secondary-action" onClick={advanceScene}>{sceneIndex >= runScenes.length - 1 ? "Trigger ending" : sceneIndex === 2 && !choice ? "Trigger decision" : "Advance scene"}</button>
            </aside>
          )}

          {paused && (
            <div className="pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
              <div className="pause-card">
                <p className="eyebrow safe">WORKOUT PAUSED</p>
                <h2 id="pause-title">Take the time you need.</h2>
                <p>The swarm can wait. Your safety can’t.</p>
                <button className="primary-action" onClick={() => setPaused(false)}><span>Resume safely</span><PlayIcon /></button>
                <button className="end-action" onClick={() => { setPaused(false); goTo("ending"); }}>End run & hear my ending</button>
              </div>
            </div>
          )}
        </section>
      )}

      {stage === "choice" && (
        <section className="screen screen--choice">
          <div className="decision-timer"><span>DECISION WINDOW</span><strong>08</strong></div>
          <div className="choice-copy">
            <p className="eyebrow danger">ROUTE COLLAPSED</p>
            <h1 ref={stageTitleRef} tabIndex={-1}>You choose the next move.</h1>
            <p>“I’ve got one flare. Roof is exposed. Tunnel is… definitely full of tunnel things.”</p>
          </div>
          <div className="voice-wave" aria-label="Listening for voice choice"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <p className="listening"><i /> LISTENING · SAY “ROOF” OR “TUNNEL”</p>
          <div className="route-choices">
            <button onClick={() => selectChoice("roof")}><span>A</span><div><strong>Take the roof</strong><small>Fast · exposed · shorter</small></div><ArrowIcon /></button>
            <button onClick={() => selectChoice("tunnel")}><span>B</span><div><strong>Take the tunnel</strong><small>Steady · dark · safer pace</small></div><ArrowIcon /></button>
          </div>
          <button className="text-action" onClick={() => selectChoice("tunnel")}>Can’t speak? Choose the safer route</button>
        </section>
      )}

      {stage === "ending" && (
        <section className={`screen screen--ending ending-${result}`}>
          <div className="ending-light" aria-hidden="true" />
          <div className="ending-copy">
            <p className="eyebrow safe">EXTRACTION // 06:42</p>
            <h1 ref={stageTitleRef} tabIndex={-1}>{result === "miss" ? "You found another way." : "You made the light."}</h1>
            <blockquote>“{profile.savee} grabs your hand as the gates close. ‘Next time, I’m picking the route.’”</blockquote>
            <p>{result === "strong" ? "Your final push saved the medic too. That choice will carry into the next episode." : "You reached them. The radio was lost, but the story is far from over."}</p>
          </div>
          <div className="ending-badge"><i>✓</i><span><strong>{result === "strong" ? "STRONG EXTRACTION" : "EXTRACTION COMPLETE"}</strong><small>STORY CONTINUES · EPISODE 02 UNLOCKED</small></span></div>
          <button className="primary-action" onClick={() => goTo("summary")}><span>See my run</span><ArrowIcon /></button>
        </section>
      )}

      {stage === "summary" && (
        <section className="screen screen--summary">
          <div className="summary-heading">
            <p className="eyebrow safe">EPISODE COMPLETE</p>
            <h1 ref={stageTitleRef} tabIndex={-1}>You changed the ending.</h1>
            <p>{episodeTitle} · Route {choice === "roof" ? "Rooftop" : "Underground"}</p>
          </div>
          <div className="summary-hero-stat"><strong>{formatElapsed(Math.max(402, elapsed))}</strong><span>STORY TIME</span></div>
          <div className="summary-grid">
            <Metric label="DISTANCE" value={Math.max(1.42, distance).toFixed(2)} unit="KM" />
            <Metric label="AVG PACE" value="5:41" unit="/KM" />
            <Metric label="THREAT GAP" value={`+${threatDistance}`} unit="M" />
            <Metric label="STORY SCORE" value={result === "strong" ? "92" : "84"} unit="%" />
          </div>
          <div className="interval-report">
            <div><span>INTERVAL PERFORMANCE</span><strong>3 / 3 survived</strong></div>
            {[92, 78, result === "miss" ? 54 : 88].map((value, index) => (
              <div className="interval-row" key={index}><span>0{index + 1}</span><i><b style={{ width: `${value}%` }} /></i><em>{value >= 85 ? "STRONG" : value >= 70 ? "HELD" : "STORY SHIFT"}</em></div>
            ))}
          </div>
          <div className="story-impact"><span>YOUR STORY IMPACT</span><p>{recentEvent}. {profile.savee} remembers your {choice === "roof" ? "reckless rooftop shortcut" : "very sensible tunnel choice"}.</p></div>
          <button className="primary-action" onClick={() => { setChoice(null); goTo("briefing"); }}><span>Run it differently</span><RestartIcon /></button>
          <button className="text-action" onClick={() => goTo("landing")}>Return to title</button>
        </section>
      )}
    </main>
  );
}

function AmbientChrome() {
  return <><div className="noise-layer" aria-hidden="true" /><div className="global-grid" aria-hidden="true" /><div className="global-vignette" aria-hidden="true" /></>;
}

function AppHeader({ onHome, demoMode }: { onHome: () => void; demoMode: boolean }) {
  return (
    <header className="app-header">
      <button className="wordmark wordmark--button" onClick={onHome}>CLIFF<span>HANGER</span></button>
      {demoMode && <span className="demo-pill">DEMO MODE</span>}
    </header>
  );
}

function ProgressHeader({ current, total, label }: { current: number; total: number; label: string }) {
  return <div className="step-header"><span>{String(current).padStart(2, "0")} / {String(total).padStart(2, "0")}</span><i><b style={{ width: `${(current / total) * 100}%` }} /></i><em>{label}</em></div>;
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={selected ? "is-selected" : ""} onClick={onClick} aria-pressed={selected}><i>{selected ? "✓" : ""}</i>{children}</button>;
}

function PermissionCard({ icon, title, detail, state, action, onClick }: { icon: string; title: string; detail: string; state: PermissionState; action: string; onClick: () => void }) {
  return (
    <button className={`permission-card state-${state}`} onClick={onClick}>
      <i className="permission-card__icon" aria-hidden="true">{icon}</i>
      <span><strong>{title}</strong><small>{state === "ready" ? "Ready" : state === "fallback" ? "Safe fallback ready" : detail}</small></span>
      <em>{state === "idle" ? action : state === "ready" ? "✓" : "SIM"}</em>
    </button>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>;
}

function SpectatorView({ scene, sceneTime, profile, distance, threatDistance, recentEvent, onExit, headingRef }: { scene: RunScene; sceneTime: number; profile: Profile; distance: number; threatDistance: number; recentEvent: string; onExit: () => void; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <main className="spectator-view">
      <AmbientChrome />
      <header><div className="wordmark">CLIFF<span>HANGER</span></div><p>Interactive stories control the workout. The workout controls the ending.</p><div className="live-mark"><i /> RUNNER LIVE</div></header>
      <section className="spectator-stage">
        <div className="spectator-scene">
          <p className="eyebrow danger">SCENE 06 // {scene.label.toUpperCase()}</p>
          <h1 ref={headingRef} tabIndex={-1}>{scene.instruction}</h1>
          <div className="spectator-time">{formatTime(sceneTime)}</div>
          <blockquote>“{scene.story(profile.savee)}”</blockquote>
          <div className="spectator-wave" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ height: `${14 + ((index * 31) % 72)}%` }} />)}</div>
        </div>
        <aside className="spectator-data">
          <div className="spectator-runner"><span>RUNNER</span><strong>Joon</strong><small>RUNNING TO {profile.savee.toUpperCase()}</small></div>
          <div className="spectator-metrics"><Metric label="DISTANCE" value={distance.toFixed(2)} unit="KM" /><Metric label="INTERVAL" value="03" unit="/ 05" /></div>
          <div className="spectator-threat"><span>SWARM DISTANCE</span><strong>{threatDistance}<small> METRES</small></strong><i><b style={{ width: `${Math.min(90, threatDistance / 1.7)}%` }} /></i></div>
          <div className="event-log"><span>RECENT STORY EVENT</span><p>{recentEvent}</p></div>
        </aside>
      </section>
      <button className="spectator-exit" onClick={onExit}>Exit spectator view</button>
    </main>
  );
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatElapsed(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function ArrowIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" /></svg>; }
function ChevronIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 9 5 5 5-5" /></svg>; }
function PlayIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z" /></svg>; }
function PauseIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 6v12M16 6v12" /></svg>; }
function ScreenIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="13" rx="1" /><path d="M9 21h6M12 18v3" /></svg>; }
function RestartIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8V3m0 0h5M4 3l4 4a7 7 0 1 1-2 7" /></svg>; }
function ShieldIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 2.8 8.3 7 10 4.2-1.7 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>; }
