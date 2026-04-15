import { useEffect, useMemo, useRef, useState } from "react";

type NoteToken = {
  raw: string;
  degree: string;
  duration: number;
  octaveShift: number;
  isRest: boolean;
};

type Segment = {
  size: number;
  cells: string[];
  beats: number;
  notes: NoteToken[];
};

type LineData = {
  segments: Segment[];
  startTime?: string;
  endTime?: string;
  totalBeats: number;
};

const SCALE_OFFSETS: Record<string, number> = {
  "1": 0,
  "2": 2,
  "3": 4,
  "4": 5,
  "5": 7,
  "6": 9,
  "7": 11,
};

const KEY_ROOTS: Record<string, number> = {
  C: 60,
  D: 62,
  E: 64,
  F: 65,
  G: 67,
  A: 69,
  B: 71,
  Bb: 70,
  Eb: 63,
};

function splitLines(text: string) {
  return text.split(/\r?\n/);
}

function splitByPause(line: string) {
  return line
    .split(/[,，、/|｜\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokenizeLyricPart(part: string) {
  const asciiTokens = part.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) || [];
  const placeholder = part.replace(/[A-Za-z]+(?:'[A-Za-z]+)*/g, "◻");
  const chars = Array.from(placeholder).filter((ch) => /[\u4e00-\u9fff0-9◻]/.test(ch));

  let asciiIndex = 0;
  return chars.map((ch) => {
    if (ch === "◻") {
      const token = asciiTokens[asciiIndex] || "";
      asciiIndex += 1;
      return token;
    }
    return ch;
  });
}

function parsePatternLine(line: string) {
  return line
    .split(/[-,，、/|｜\s]+/)
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => Number(n))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function parseTimeToSeconds(value?: string) {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  const parts = raw.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function formatSeconds(seconds?: number | null) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "";
  const min = Math.floor(seconds / 60);
  const sec = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${min}:${sec}`;
}

function parseNoteToken(token: string): NoteToken {
  const trimmed = token.trim();
  if (!trimmed) {
    return { raw: token, degree: "0", duration: 1, octaveShift: 0, isRest: true };
  }

  const [pitchPart, durPart] = trimmed.split(":");
  const duration = durPart ? Number(durPart) : 1;
  const safeDuration = !Number.isNaN(duration) && duration > 0 ? duration : 1;

  let octaveShift = 0;
  let degreePart = pitchPart;

  while (degreePart.startsWith(".")) {
    octaveShift -= 1;
    degreePart = degreePart.slice(1);
  }
  while (degreePart.endsWith(".")) {
    octaveShift += 1;
    degreePart = degreePart.slice(0, -1);
  }

  const degree = degreePart || "0";

  return {
    raw: trimmed,
    degree,
    duration: safeDuration,
    octaveShift,
    isRest: degree === "0",
  };
}

function tokenToMidi(token: NoteToken, keyRoot: string) {
  if (token.isRest) return null;
  const base = KEY_ROOTS[keyRoot] ?? KEY_ROOTS.C;
  const offset = SCALE_OFFSETS[token.degree];
  if (offset === undefined) return null;
  return base + offset + token.octaveShift * 12;
}

function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function lineFromPattern(patternLine: string): LineData {
  const nums = parsePatternLine(patternLine);
  const segments = nums.map((n) => ({
    size: n,
    cells: Array.from({ length: n }, () => ""),
    beats: n,
    notes: [] as NoteToken[],
  }));

  return {
    segments,
    startTime: "",
    endTime: "",
    totalBeats: segments.reduce((sum, seg) => sum + seg.beats, 0),
  };
}

function lineFromLyric(rawLine: string): LineData {
  const parts = splitByPause(rawLine);
  const segments = parts.map((part) => {
    const tokens = tokenizeLyricPart(part);
    return {
      size: Math.max(tokens.length, 1),
      cells: tokens.length ? tokens : [""],
      beats: Math.max(tokens.length, 1),
      notes: [] as NoteToken[],
    };
  });

  return {
    segments,
    startTime: "",
    endTime: "",
    totalBeats: segments.reduce((sum, seg) => sum + seg.beats, 0),
  };
}

function lineFromJianpu(rawLine: string): LineData {
  const parts = rawLine
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const segments = parts.map((part) => {
    const notes = part
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .map(parseNoteToken);

    const beats = notes.reduce((sum, note) => sum + note.duration, 0) || 1;

    return {
      size: Math.max(notes.length, 1),
      cells: Array.from({ length: Math.max(notes.length, 1) }, () => ""),
      beats,
      notes,
    };
  });

  return {
    segments,
    startTime: "",
    endTime: "",
    totalBeats: segments.reduce((sum, seg) => sum + seg.beats, 0),
  };
}

function buildLinesFromPatternText(text: string): LineData[] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(lineFromPattern);
}

function buildLinesFromLyricsText(text: string): LineData[] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(lineFromLyric);
}

function buildLinesFromJianpuText(text: string): LineData[] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(lineFromJianpu);
}

function cloneLines(lines: LineData[]) {
  return lines.map((line) => ({
    ...line,
    segments: line.segments.map((seg) => ({
      ...seg,
      cells: [...seg.cells],
      notes: seg.notes.map((note) => ({ ...note })),
    })),
  }));
}

function linesToPatternText(lines: LineData[]) {
  return lines.map((line) => line.segments.map((seg) => seg.size).join(" ")).join("\n");
}

function lineCellsFilled(line: LineData) {
  return line.segments.every((seg) => seg.cells.every((cell) => cell.trim().length > 0));
}

function buildPreviewText(line: LineData) {
  return line.segments.map((seg) => seg.cells.map((cell) => cell || "□").join("")).join(" / ");
}

function sumLineBeats(line: LineData) {
  return line.segments.reduce((sum, seg) => sum + seg.beats, 0);
}

function lineHasNotes(line: LineData) {
  return line.segments.some((seg) => seg.notes.length > 0);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"build" | "write">("build");
  const [patternText, setPatternText] = useState(`4 4 5\n4 4 5\n7 7`);
  const [sourceLyricsText, setSourceLyricsText] = useState(`春风 轻轻 吹过\n心事 慢慢 说破\n若你还在 远方等我`);
  const [jianpuText, setJianpuText] = useState(`1 2 3 5 | 5 3 2 1\n1 2 3:2 | 5 3 2 1\n5 6 1. 2. | 3.:2 2. 1.`);
  const [draftLines, setDraftLines] = useState<LineData[]>(() =>
    buildLinesFromJianpuText(`1 2 3 5 | 5 3 2 1\n1 2 3:2 | 5 3 2 1\n5 6 1. 2. | 3.:2 2. 1.`)
  );
  const [tempoBpm, setTempoBpm] = useState("90");
  const [firstLineStart, setFirstLineStart] = useState("0:00.0");
  const [keyRoot, setKeyRoot] = useState("C");
  const [playingLabel, setPlayingLabel] = useState("");
  const [activeMode, setActiveMode] = useState<"jianpu" | "fallback">("jianpu");

  const audioContextRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    autoGenerateLineTimes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const overallStats = useMemo(() => {
    const totalLines = draftLines.length;
    const doneLines = draftLines.filter(lineCellsFilled).length;
    const totalCells = draftLines.reduce(
      (sum, line) => sum + line.segments.reduce((a, seg) => a + seg.size, 0),
      0
    );
    const filledCells = draftLines.reduce(
      (sum, line) =>
        sum + line.segments.reduce((a, seg) => a + seg.cells.filter((c) => c.trim().length > 0).length, 0),
      0
    );
    return { totalLines, doneLines, totalCells, filledCells };
  }, [draftLines]);

  const stopPlayback = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.suspend().catch(() => {});
    }
    setPlayingLabel("");
  };

  const ensureAudioContext = async () => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new window.AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const scheduleTone = (ctx: AudioContext, freq: number, startAt: number, durationSec: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + Math.max(durationSec - 0.02, 0.03));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startAt);
    osc.stop(startAt + durationSec);
  };

  const playLineMelody = async (line: LineData, lineIndex: number) => {
    if (!lineHasNotes(line)) return;

    stopPlayback();

    const bpm = Number(tempoBpm);
    if (Number.isNaN(bpm) || bpm <= 0) return;

    const ctx = await ensureAudioContext();
    const secondsPerBeat = 60 / bpm;
    let cursor = ctx.currentTime + 0.05;

    line.segments.forEach((seg) => {
      seg.notes.forEach((note) => {
        const durationSec = note.duration * secondsPerBeat;
        const midi = tokenToMidi(note, keyRoot);
        if (midi !== null) {
          scheduleTone(ctx, midiToFrequency(midi), cursor, durationSec);
        }
        cursor += durationSec;
      });
    });

    setPlayingLabel(`播放第 ${lineIndex + 1} 行旋律`);
    const doneTimer = window.setTimeout(() => {
      setPlayingLabel("");
    }, Math.max(100, (cursor - ctx.currentTime) * 1000));
    timersRef.current.push(doneTimer);
  };

  const autoGenerateLineTimes = (overrideLines?: LineData[]) => {
    const bpm = Number(tempoBpm);
    const start = parseTimeToSeconds(firstLineStart);
    if (Number.isNaN(bpm) || bpm <= 0 || start === null) return;

    const secondsPerBeat = 60 / bpm;
    const inputLines = overrideLines ? cloneLines(overrideLines) : cloneLines(draftLines);

    let cursor = start;
    inputLines.forEach((line) => {
      line.totalBeats = sumLineBeats(line) || 1;
      line.startTime = formatSeconds(cursor);
      cursor += line.totalBeats * secondsPerBeat;
      line.endTime = formatSeconds(cursor);
    });

    setDraftLines(inputLines);
  };

  const buildFromJianpu = () => {
    const next = buildLinesFromJianpuText(jianpuText);
    if (next.length > 0) {
      setDraftLines(next);
      setPatternText(linesToPatternText(next));
      autoGenerateLineTimes(next);
      setActiveMode("jianpu");
      setActiveTab("write");
    }
  };

  const loadFromPattern = () => {
    const next = buildLinesFromPatternText(patternText);
    if (next.length > 0) {
      setDraftLines(next);
      autoGenerateLineTimes(next);
      setActiveMode("fallback");
      setActiveTab("write");
    }
  };

  const detectFromLyrics = () => {
    const next = buildLinesFromLyricsText(sourceLyricsText);
    if (next.length > 0) {
      setDraftLines(next);
      setPatternText(linesToPatternText(next));
      autoGenerateLineTimes(next);
      setActiveMode("fallback");
      setActiveTab("write");
    }
  };

  const loadExample1 = () => {
    const example = `1 2 3 5 | 5 3 2 1\n1 2 3:2 | 5 3 2 1\n5 6 1. 2. | 3.:2 2. 1.`;
    setJianpuText(example);
    const next = buildLinesFromJianpuText(example);
    setDraftLines(next);
    setPatternText(linesToPatternText(next));
    autoGenerateLineTimes(next);
    setActiveMode("jianpu");
  };

  const loadExample2 = () => {
    const fallback = `4 4 5\n4 4 5\n7 7`;
    const lyrics = `春风 轻轻 吹过\n心事 慢慢 说破\n若你还在 远方等我`;
    setPatternText(fallback);
    setSourceLyricsText(lyrics);
    const next = buildLinesFromLyricsText(lyrics);
    setDraftLines(next);
    autoGenerateLineTimes(next);
    setActiveMode("fallback");
  };

  const resetAll = () => {
    stopPlayback();
    setPatternText("");
    setSourceLyricsText("");
    setJianpuText("");
    setDraftLines([]);
  };

  const updateCell = (lineIdx: number, segIdx: number, cellIdx: number, value: string) => {
    setDraftLines((prev) => {
      const next = cloneLines(prev);
      if (!next[lineIdx]?.segments[segIdx]?.cells) return prev;
      next[lineIdx].segments[segIdx].cells[cellIdx] = value;
      return next;
    });
  };

  const adjustSegmentSize = (lineIdx: number, segIdx: number, delta: number) => {
    setDraftLines((prev) => {
      const next = cloneLines(prev);
      const seg = next[lineIdx]?.segments[segIdx];
      if (!seg) return prev;

      const newSize = Math.max(1, seg.size + delta);
      if (newSize > seg.size) {
        seg.cells.push(...Array.from({ length: newSize - seg.size }, () => ""));
      } else if (newSize < seg.size) {
        seg.cells = seg.cells.slice(0, newSize);
      }

      seg.size = newSize;
      setPatternText(linesToPatternText(next));
      return next;
    });
  };

  const addSegment = (lineIdx: number) => {
    setDraftLines((prev) => {
      const next = cloneLines(prev);
      next[lineIdx]?.segments.push({
        size: 1,
        cells: [""],
        beats: 1,
        notes: [],
      });
      next[lineIdx].totalBeats = sumLineBeats(next[lineIdx]);
      setPatternText(linesToPatternText(next));
      return next;
    });
  };

  const removeSegment = (lineIdx: number, segIdx: number) => {
    setDraftLines((prev) => {
      const next = cloneLines(prev);
      if (!next[lineIdx] || next[lineIdx].segments.length <= 1) return prev;
      next[lineIdx].segments.splice(segIdx, 1);
      next[lineIdx].totalBeats = sumLineBeats(next[lineIdx]);
      setPatternText(linesToPatternText(next));
      return next;
    });
  };

  const addLine = () => {
    setDraftLines((prev) => {
      const next = [
        ...cloneLines(prev),
        {
          segments: [{ size: 1, cells: [""], beats: 1, notes: [] }],
          startTime: "",
          endTime: "",
          totalBeats: 1,
        },
      ];
      setPatternText(linesToPatternText(next));
      autoGenerateLineTimes(next);
      return next;
    });
  };

  const removeLine = (lineIdx: number) => {
    setDraftLines((prev) => {
      const next = cloneLines(prev);
      next.splice(lineIdx, 1);
      setPatternText(linesToPatternText(next));
      autoGenerateLineTimes(next);
      return next;
    });
  };

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="hero">
          <div>
            <h1>填词格子编辑器</h1>
            <p>现在以“输入简谱 → 自动生成旋律与时间 → 填词”为主。没有谱子时，再用备用的格式输入模式。</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-outline" onClick={loadExample1}>谱子示例</button>
            <button className="btn btn-outline" onClick={loadExample2}>无谱示例</button>
            <button className="btn btn-ghost" onClick={resetAll}>清空</button>
          </div>
        </div>

        <section className="card">
          <div className="card-header">
            <h2>谱子输入与自动生成</h2>
          </div>
          <div className="card-body stack">
            <div className="two-col-main">
              <div className="soft-box stack">
                <div className="section-title">主模式：输入简谱自动生成结构</div>
                <p className="muted-text">
                  推荐使用版本二语法：默认每个音 1 拍；需要更细节时再写成 <strong>音高:时值</strong>，例如 <strong>3:2</strong>。
                </p>
                <p className="muted-text">
                  规则：<strong>|</strong> 表示一段；<strong>1 2 3 5</strong> 默认都是 1 拍；<strong>5:0.5</strong> 表示半拍；
                  <strong> 0 </strong> 表示休止；<strong>1.</strong> 是高八度，<strong>.1</strong> 是低八度。
                </p>
                <textarea
                  className="textarea mono"
                  value={jianpuText}
                  onChange={(e) => setJianpuText(e.target.value)}
                />
                <div className="hero-actions">
                  <button className="btn btn-primary" onClick={buildFromJianpu}>从简谱生成格子</button>
                  <button
                    className="btn btn-outline"
                    onClick={() => draftLines[0] && playLineMelody(draftLines[0], 0)}
                  >
                    试听第一行
                  </button>
                  <button className="btn btn-ghost" onClick={stopPlayback}>停止</button>
                </div>
                {playingLabel ? <span className="pill pill-success">{playingLabel}</span> : null}
              </div>

              <div className="soft-box stack">
                <div className="section-title">参数</div>

                <div>
                  <div className="field-label">调号</div>
                  <select
                    className="select"
                    value={keyRoot}
                    onChange={(e) => setKeyRoot(e.target.value)}
                  >
                    {Object.keys(KEY_ROOTS).map((key) => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="field-label">速度 BPM</div>
                  <input
                    className="input"
                    value={tempoBpm}
                    onChange={(e) => setTempoBpm(e.target.value)}
                    placeholder="例如 90"
                  />
                </div>

                <div>
                  <div className="field-label">第一行开始时间</div>
                  <input
                    className="input"
                    value={firstLineStart}
                    onChange={(e) => setFirstLineStart(e.target.value)}
                    placeholder="例如 0:00.0"
                  />
                </div>

                <button className="btn btn-primary full-width" onClick={() => autoGenerateLineTimes()}>
                  重新计算整行时间
                </button>

                <div className="soft-note">
                  主模式下，不再需要上传伴奏文件。网页会直接按简谱播放旋律，并自动给下面歌词格子分配时间。
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="tabs">
          <button
            className={`tab ${activeTab === "build" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("build")}
          >
            建立结构
          </button>
          <button
            className={`tab ${activeTab === "write" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("write")}
          >
            格子填词
          </button>
        </div>

        {activeTab === "build" ? (
          <section className="card">
            <div className="card-header">
              <h2>备用模式：没有谱子时再用</h2>
            </div>
            <div className="card-body stack">
              <div className="hero-actions">
                <button
                  className={`btn ${activeMode === "jianpu" ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setActiveMode("jianpu")}
                >
                  当前主模式
                </button>
                <button
                  className={`btn ${activeMode === "fallback" ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setActiveMode("fallback")}
                >
                  切到备用模式
                </button>
              </div>

              <div className="two-col">
                <section className="soft-box stack">
                  <div className="section-title">输入格式节奏</div>
                  <p className="muted-text">适合没有谱子、但知道停顿结构时使用，例如 4 4 5。</p>
                  <textarea
                    className="textarea tall"
                    value={patternText}
                    onChange={(e) => setPatternText(e.target.value)}
                    placeholder={"例如：\n4 4 5\n4 4 5\n7 7"}
                  />
                  <button className="btn btn-primary" onClick={loadFromPattern}>按格式生成白框</button>
                </section>

                <section className="soft-box stack">
                  <div className="section-title">输入现成歌词自动识别</div>
                  <p className="muted-text">适合没有谱子，但已经写了几句歌词，想先搭词格时使用。</p>
                  <textarea
                    className="textarea tall"
                    value={sourceLyricsText}
                    onChange={(e) => setSourceLyricsText(e.target.value)}
                    placeholder={"例如：\n春风 轻轻 吹过\nI love you / more than stars"}
                  />
                  <button className="btn btn-primary" onClick={detectFromLyrics}>从歌词识别格式</button>
                </section>
              </div>

              <div className="code-box">{patternText || "还没有结构"}</div>
            </div>
          </section>
        ) : (
          <section className="card">
            <div className="card-header row-between">
              <h2>逐格填词</h2>
              <div className="pill-row">
                <span className="pill pill-success">已完成 {overallStats.doneLines}/{overallStats.totalLines} 行</span>
                <span className="pill">已填写 {overallStats.filledCells}/{overallStats.totalCells} 格</span>
              </div>
            </div>

            <div className="card-body stack">
              <div className="soft-box">
                <p>每个白框代表一个字，或一个英文单词。</p>
                <p>右上角的 + / - 可以微调白框数量，适合处理“一音多字”或“两音一字”。</p>
                <p>主模式下，整行时间来自简谱时值；备用模式下，整行时间来自你手动搭出的结构。</p>
              </div>

              {draftLines.length === 0 ? (
                <div className="empty-state">先输入简谱，或者在备用模式里建立结构。</div>
              ) : (
                draftLines.map((line, lineIdx) => (
                  <div key={lineIdx} className="line-card">
                    <div className="row-between line-head">
                      <div className="line-title-wrap">
                        <div className="line-title">第 {lineIdx + 1} 行</div>
                        <span className={`pill ${lineCellsFilled(line) ? "pill-success" : ""}`}>
                          {lineCellsFilled(line) ? "已填完" : "填写中"}
                        </span>
                        <span className="pill">总拍数 {line.totalBeats}</span>
                      </div>
                      <div className="line-actions">
                        <button className="btn btn-outline" onClick={() => addSegment(lineIdx)}>加一段</button>
                        <button
                          className="btn btn-outline"
                          onClick={() => playLineMelody(line, lineIdx)}
                          disabled={!lineHasNotes(line)}
                        >
                          播放本行
                        </button>
                        <button className="btn btn-ghost" onClick={() => removeLine(lineIdx)}>删除本行</button>
                      </div>
                    </div>

                    <div className="line-time-grid">
                      <div>
                        <div className="field-label">本行开始时间</div>
                        <input className="input" value={line.startTime || ""} readOnly placeholder="自动生成" />
                      </div>
                      <div>
                        <div className="field-label">本行结束时间</div>
                        <input className="input" value={line.endTime || ""} readOnly placeholder="自动生成" />
                      </div>
                      <div className="line-time-note">
                        {line.startTime || line.endTime
                          ? `区间：${line.startTime || "?"} - ${line.endTime || "?"}`
                          : "等待生成整行时间"}
                      </div>
                    </div>

                    <div className="segment-stack">
                      {line.segments.map((seg, segIdx) => (
                        <div key={segIdx} className="segment-card">
                          <div className="row-between segment-head">
                            <div className="segment-title">
                              第 {segIdx + 1} 段 · {seg.size} 格 · {seg.beats} 拍
                            </div>
                            <div className="segment-actions">
                              <button className="mini-btn" onClick={() => adjustSegmentSize(lineIdx, segIdx, -1)}>-</button>
                              <button className="mini-btn" onClick={() => adjustSegmentSize(lineIdx, segIdx, 1)}>+</button>
                              <button className="btn btn-ghost" onClick={() => removeSegment(lineIdx, segIdx)}>删除段</button>
                            </div>
                          </div>

                          {seg.notes.length > 0 ? (
                            <div className="note-box">
                              简谱：{seg.notes.map((note) => note.raw).join(" ")}
                            </div>
                          ) : null}

                          <div className="cells-wrap">
                            {seg.cells.map((cell, cellIdx) => (
                              <input
                                key={cellIdx}
                                className="cell-input"
                                value={cell}
                                onChange={(e) => updateCell(lineIdx, segIdx, cellIdx, e.target.value)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="preview-text">
                      <span>当前预览：</span> {buildPreviewText(line)}
                    </div>
                  </div>
                ))
              )}

              <div className="line-actions">
                <button className="btn btn-outline" onClick={addLine}>新增一行</button>
                <button className="btn btn-ghost" onClick={stopPlayback}>停止播放</button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
