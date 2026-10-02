import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { extractPdfText } from "./lib/pdf";
import {
  MAX_CHARS,
  SPEEDS,
  VOICES,
  formatSpeed,
  generateSpeech,
  spokenText,
} from "./lib/tts";

const AUTOPLAY_KEY = "listenly-autoplay";
const MAX_PDF_BYTES = 20 * 1024 * 1024;

type InputMode = "text" | "pdf";

type PdfSelection = {
  name: string;
  size: number;
  pages: number;
  text: string;
};

function readAutoplay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) === "1";
  } catch {
    return false;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    const kilobytes = bytes / 1024;
    const text = kilobytes >= 10 ? String(Math.round(kilobytes)) : kilobytes.toFixed(1);
    return `${text} KB`;
  }
  const megabytes = bytes / (1024 * 1024);
  const text = megabytes >= 10 ? String(Math.round(megabytes)) : megabytes.toFixed(1);
  return `${text} MB`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

export default function App() {
  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [pdf, setPdf] = useState<PdfSelection | null>(null);
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [speed, setSpeed] = useState("1");
  const [generating, setGenerating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playOnReady, setPlayOnReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoplay, setAutoplay] = useState(readAutoplay);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioUrlRef = useRef<string | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const activeText = mode === "text" ? text : (pdf?.text ?? "");
  const spoken = spokenText(activeText);
  const tooLong = spoken.length > MAX_CHARS;
  const canGenerate = spoken.length > 0 && !tooLong && !generating && !extracting;
  const message =
    error ||
    (tooLong
      ? `Text is too long. Keep it under ${MAX_CHARS.toLocaleString()} characters.`
      : "");

  useEffect(() => {
    if (!settingsOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [settingsOpen]);

  function updateAutoplay(next: boolean) {
    setAutoplay(next);
    try {
      localStorage.setItem(AUTOPLAY_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage failures in private browsing.
    }
  }

  async function loadPdf(file: File) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Choose a PDF file.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("PDF must be 20 MB or smaller.");
      return;
    }
    setExtracting(true);
    setError("");
    try {
      const extracted = await extractPdfText(await file.arrayBuffer());
      if (!extracted.text) {
        setPdf(null);
        setError(
          "This PDF has no selectable text. Try a PDF with a text layer, or paste the text instead.",
        );
        return;
      }
      setPdf({
        name: file.name,
        size: file.size,
        pages: extracted.pageCount,
        text: extracted.text,
      });
    } catch {
      setPdf(null);
      setError("Could not read that PDF. If it is password-protected, paste the text instead.");
    } finally {
      setExtracting(false);
    }
  }

  async function onGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setError("");
    try {
      const blob = await generateSpeech(spoken, voice, Number(speed));
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      setPlayOnReady(autoplay);
      setAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate audio.");
    } finally {
      setGenerating(false);
    }
  }

  const countLabel = `${text.length.toLocaleString()} ${text.length === 1 ? "character" : "characters"}`;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -left-24 top-0 h-[28rem] w-[28rem] rounded-full bg-[#e4dcff] blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-[32rem] w-[32rem] rounded-full bg-[#d7ebff] blur-3xl" />
      <div className="pointer-events-none absolute top-1/4 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#f3e9ff]/80 blur-3xl" />

      <main className="relative w-full max-w-[540px] rounded-[28px] border border-[#efeef6] bg-white px-7 py-7 shadow-[0_24px_80px_rgba(88,80,160,0.12)] sm:px-8">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <WaveformIcon />
            <div>
              <h1 className="text-[22px] leading-none font-bold tracking-tight text-[#1b1536]">
                Listenly-ai
              </h1>
              <p className="mt-1.5 text-[14px] text-[#9aa1b5]">Turn your text or PDF into audio</p>
            </div>
          </div>
          <div className="relative" ref={settingsRef}>
            <button
              type="button"
              aria-label="Settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
              className="mt-0.5 cursor-pointer rounded-full p-1 text-[#b0b6c6] transition hover:text-[#6d5efc]"
            >
              <GearIcon />
            </button>
            {settingsOpen && (
              <div className="absolute top-10 right-0 z-20 w-64 rounded-2xl border border-[#eceef5] bg-white p-4 shadow-[0_16px_40px_rgba(60,50,120,0.12)]">
                <p className="text-sm font-semibold text-[#1b1536]">Settings</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <label htmlFor="autoplay" className="text-[13px] text-[#5c6378]">
                    Autoplay when ready
                  </label>
                  <button
                    id="autoplay"
                    type="button"
                    role="switch"
                    aria-checked={autoplay}
                    onClick={() => updateAutoplay(!autoplay)}
                    className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition ${autoplay ? "bg-[#6d5efc]" : "bg-[#e4e6f0]"}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${autoplay ? "translate-x-5" : ""}`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <div role="tablist" aria-label="Input type" className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-[#f4f3f8] p-1">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "text"}
            onClick={() => {
              setMode("text");
              setError("");
            }}
            className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-[#2c2848] ${mode === "text" ? "bg-[#f3f0ff] shadow-[inset_0_0_0_1px_#e4dcff]" : ""}`}
          >
            <TextDocIcon />
            Text
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "pdf"}
            onClick={() => {
              setMode("pdf");
              setError("");
            }}
            className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-[#2c2848] ${mode === "pdf" ? "bg-[#f3f0ff] shadow-[inset_0_0_0_1px_#e4dcff]" : ""}`}
          >
            <PdfDocIcon />
            PDF
          </button>
        </div>

        {mode === "text" ? (
          <div className="mt-4 rounded-2xl border border-[#e7e9f2] bg-[#fcfcff]">
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                if (error) setError("");
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canGenerate) {
                  event.preventDefault();
                  void onGenerate();
                }
              }}
              placeholder="Paste your text here..."
              disabled={generating}
              className="block max-h-[200px] min-h-[124px] w-full resize-none overflow-y-auto bg-transparent px-4 pt-4 pb-2 text-[15px] leading-6 text-[#2c2848] outline-none placeholder:text-[#c5c9d6] disabled:opacity-70"
            />
            <div className="px-4 pt-1 pb-3 text-right">
              <span className={`text-[12px] ${tooLong ? "text-rose-500" : "text-[#c0c4d2]"}`}>
                {countLabel}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <div
              className={`flex min-h-[210px] flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition ${dragOver ? "border-[#6d5efc] bg-[#f7f5ff]" : "border-[#ddd6fe] bg-[#fbfaff]"}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragOver(false);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                const file = event.dataTransfer.files[0];
                if (file && !generating && !extracting) void loadPdf(file);
              }}
            >
              <PdfDropIcon />
              <p className="mt-3 text-[15px] font-semibold text-[#1b1536]">
                {extracting ? "Reading PDF..." : "Drop your PDF here"}
              </p>
              <p className="mt-1 text-[13px] text-[#b0b4c4]">or</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={generating || extracting}
                className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#e6e4f2] bg-white px-4 py-2 text-[14px] font-semibold text-[#2c2848] shadow-[0_1px_2px_rgba(40,30,80,0.04)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UploadArrowIcon />
                Choose PDF
              </button>
              <p className="mt-3 text-[12px] text-[#b7bccb]">PDF up to 20 MB</p>
            </div>
            {pdf && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#eceef5] bg-white px-3 py-2.5">
                <PdfDocIcon />
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[14px] font-medium text-[#1b1536]">{pdf.name}</p>
                  <p className="text-[12px] text-[#9aa1b5]">
                    {pdf.pages} {pdf.pages === 1 ? "page" : "pages"} • {formatFileSize(pdf.size)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Remove PDF"
                  onClick={() => {
                    setPdf(null);
                    setError("");
                  }}
                  disabled={generating}
                  className="cursor-pointer rounded-full p-1 text-[#b0b6c6] hover:text-[#6b7280] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CloseIcon />
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void loadPdf(file);
              }}
            />
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldSelect
            label="Voice"
            value={voice}
            disabled={generating}
            icon={<PersonIcon />}
            onChange={setVoice}
          >
            {VOICES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </FieldSelect>
          <FieldSelect
            label="Speed"
            value={speed}
            disabled={generating}
            icon={<GaugeIcon />}
            onChange={setSpeed}
          >
            {SPEEDS.map((option) => (
              <option key={option} value={String(option)}>
                {formatSpeed(option)}
              </option>
            ))}
          </FieldSelect>
        </div>

        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={!canGenerate}
          className="mt-5 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-[#7A5AF8] via-[#6672FF] to-[#4C8DFF] text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(90,100,240,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {generating ? <Spinner /> : <SparkleIcon />}
          {generating ? "Generating..." : "Generate Audio"}
        </button>

        {message && (
          <p role="alert" className="mt-3 text-center text-[13px] text-rose-500">
            {message}
          </p>
        )}

        {audioUrl && (
          <>
            <div className="mt-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#eceef3]" />
              <span className="text-[11px] font-medium tracking-[0.14em] text-[#c5c8d4]">OR</span>
              <div className="h-px flex-1 bg-[#eceef3]" />
            </div>
            <ReadyPanel key={audioUrl} src={audioUrl} autoPlay={playOnReady} />
          </>
        )}
      </main>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  disabled,
  icon,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-semibold text-[#2a2642]">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[#8b90a6]">
          {icon}
        </span>
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-[#e6e8f2] bg-white pr-10 pl-10 text-[14.5px] font-medium text-[#2c2848] outline-none focus:border-[#6d5efc] focus:ring-2 focus:ring-[#6d5efc]/15 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {children}
        </select>
        <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[#a0a4b8]">
          <ChevronIcon />
        </span>
      </div>
    </div>
  );
}

function ReadyPanel({ src, autoPlay }: { src: string; autoPlay: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <section className="mt-4 rounded-[18px] border border-[#ece8ff] bg-[#f6f4ff] p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#22c55e] text-white">
          <CheckIcon />
        </span>
        <h2 className="text-[16px] font-bold text-[#1b1536]">Your audio is ready</h2>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#eceef6] bg-white px-3 py-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#6d5efc] text-white"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          aria-label="Seek"
          onChange={(event) => {
            const next = Number(event.target.value);
            if (audioRef.current) audioRef.current.currentTime = next;
            setCurrent(next);
          }}
          className="slider min-w-0 flex-1"
          style={{ "--pct": `${progress}%` } as CSSProperties}
        />
        <span className="shrink-0 text-[12px] text-[#9aa0b4] tabular-nums">
          <span className="text-[#5c6178]">{formatTime(current)}</span>
          <span> / {formatTime(duration)}</span>
        </span>
        <span className="shrink-0 text-[#8b90a6]">
          <VolumeIcon muted={volume === 0} />
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          aria-label="Volume"
          onChange={(event) => setVolume(Number(event.target.value))}
          className="slider w-16 shrink-0"
          style={{ "--pct": `${volume * 100}%` } as CSSProperties}
        />
      </div>

      <a
        href={src}
        download="listenly-audio.mp3"
        className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e4e0fb] bg-white text-[14.5px] font-semibold text-[#6d5efc] transition hover:bg-[#faf9ff]"
      >
        <DownloadIcon />
        Download MP3
      </a>

      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
          setDuration(audio.duration);
          audio.volume = volume;
          if (autoPlay) void audio.play().catch(() => undefined);
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </section>
  );
}

function TextDocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[#7c6bf5]">
      <path
        d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M14 3.8V8h4.2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8.5 12.5h7M8.5 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PdfDocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z"
        stroke="#f04444"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M14 3.8V8h4.2" stroke="#f04444" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8.2 16.2h2.1a1.5 1.5 0 0 0 0-3H8.2v4.6" stroke="#f04444" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.4 13.2h1.6M12.4 15.1h1.4" stroke="#f04444" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PdfDropIcon() {
  return (
    <svg width="42" height="46" viewBox="0 0 42 46" fill="none" aria-hidden="true">
      <path
        d="M10 4h14l10 10v24a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z"
        fill="#f4f2fb"
        stroke="#d9d4ea"
        strokeWidth="1.6"
      />
      <path d="M24 4v10h10" stroke="#d9d4ea" strokeWidth="1.6" />
      <rect x="11" y="28" width="20" height="10" rx="2" fill="#f04444" />
      <text x="21" y="35.5" textAnchor="middle" fill="white" fontSize="6.5" fontFamily="sans-serif" fontWeight="700">
        PDF
      </text>
    </svg>
  );
}

function UploadArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[#7c6bf5]">
      <path d="M12 16V6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.2 9.2 12 5.4l3.8 3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 18.5h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function WaveformIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="10" width="3.2" height="8" rx="1.6" fill="#8B7CFF" />
      <rect x="6.4" y="6" width="3.2" height="16" rx="1.6" fill="#7A68F8" />
      <rect x="11.8" y="3" width="3.2" height="22" rx="1.6" fill="#6D5EF8" />
      <rect x="17.2" y="7" width="3.2" height="14" rx="1.6" fill="#7A68F8" />
      <rect x="22.6" y="11" width="3.2" height="6" rx="1.6" fill="#8B7CFF" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M19.4 13.1a7.7 7.7 0 0 0 .1-2.2l2-1.5-2-3.4-2.4 1a7.8 7.8 0 0 0-1.9-1.1L14.8 3h-3.6l-.4 2.9a7.8 7.8 0 0 0-1.9 1.1l-2.4-1-2 3.4 2 1.5a7.7 7.7 0 0 0 .1 2.2l-2 1.5 2 3.4 2.4-1a7.8 7.8 0 0 0 1.9 1.1l.4 2.9h3.6l.4-2.9a7.8 7.8 0 0 0 1.9-1.1l2.4 1 2-3.4-2-1.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M6.2 18.4c.8-2.5 2.9-3.9 5.8-3.9s5 1.4 5.8 3.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 16.5a8 8 0 1 1 14 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M12 16.2 15.2 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.2 13.3 8.4 19.5 9.7 13.3 11 12 17.2 10.7 11 4.5 9.7 10.7 8.4 12 2.2Z" />
      <path d="M18.2 13.6 18.9 16.2 21.5 16.9 18.9 17.6 18.2 20.2 17.5 17.6 14.9 16.9 17.5 16.2 18.2 13.6Z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2.4" />
      <path d="M12 4a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5 9.2 17 19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 7.2v9.6l8-4.8-8-4.8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="7" y="6" width="3.2" height="12" rx="1" />
      <rect x="13.8" y="6" width="3.2" height="12" rx="1" />
    </svg>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10h3.2L11 6.8v10.4L7.2 14H4v-4Z" fill="currentColor" />
      {muted ? (
        <path d="M15 10.2 19.2 14.4M19.2 10.2 15 14.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M15 9.2a3.6 3.6 0 0 1 0 5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.2 10.8 12 14.6l3.8-3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
