import React, { useEffect, useMemo, useRef, useState } from "react";

type Segment = {
  size: number;
  cells: string[];
  beats?: number;
};

type LineData = {
  segments: Segment[];
  startTime?: string;
  endTime?: string;
  totalBeats?: number;
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

function parseBeatsLine(line: string) {
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

function lineFromPattern(patternLine: string): LineData {
  const nums = parsePatternLine(patternLine);
  return {
    segments: nums.map((n) => ({
      size: n,
      cells: Array.from({ length: n }, () => ""),
      beats: n,
    })),
    startTime: "",
    endTime: "",
    totalBeats: nums.reduce((a, b) => a + b, 0),
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
    };
  });
  return {
    segments,
    startTime: "",
    endTime: "",
    totalBeats: segments.reduce((a, b) => a + (b.beats || 0), 0),
  };
}

function buildLinesFromPatternText(text: string): LineData[] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => lineFromPattern(line));
}

function buildLinesFromLyricsText(text: string): LineData[] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => lineFromLyric(line));
}

function cloneLines(lines: LineData[]) {
  return lines.map((line) => ({
    ...line,
    segments: line.segments.map((seg) => ({
      ...seg,
      cells: [...seg.cells],
    })),
  }));
}

function linesToPatternText(lines: LineData[]) {
  return lines.map((line) => line.segments.map((seg) => seg.size).join(" ")).join("\n");
}

function linesToBeatsText(lines: LineData[]) {
  return lines.map((line) => line.segments.map((seg) => seg.beats || seg.size).join(" ")).join("\n");
}

function lineCellsFilled(line: LineData) {
  return line.segments.every((seg) => seg.cells.every((cell) => cell.trim().length > 0));
}

function buildPreviewText(line: LineData) {
  return line.segments.map((seg) => seg.cells.map((cell) => cell || "□").join("")).join(" / ");
}

function sumLineBeats(line: LineData) {
  return line.segments.reduce((sum, seg) => sum + (seg.beats || 0), 0);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"build" | "write">("build");
  const [patternText, setPatternText] = useState(`4 4 5\n4 4 5\n7 7`);
  const [sourceLyricsText, setSourceLyricsText] = useState(`春风 轻轻 吹过\n心事 慢慢 说破\n若你还在 远方等我`);
  const [draftLines, setDraftLines] = useState<LineData[]>(() => buildLinesFromPatternText(`4 4 5\n4 4 5\n7 7`));
  const [audioUrl, setAudioUrl] = useState("");
  const [audioName, setAudioName] = useState("");
  const [playingLabel, setPlayingLabel] = useState("");
  const [tempoBpm, setTempoBpm] = useState("90");
  const [firstLineStart, setFirstLineStart] = useState("0:00.0");
  const [beatsText, setBeatsText] = useState(`4 4 5\n4 4 5\n7 7`);
  const [jianpuText, setJianpuText] = useState(`1 2 3 5 | 5 3 2 1 | 2 3 5 6 5\n1 2 3 5 | 5 3 2 1 | 2 3 5 6 5\n5 6 1 2 3 2 1 | 6 5 3 2 1 2 3`);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const patternBuilt = buildLinesFromPatternText(patternText);
    if (patternBuilt.length > 0) {
      setDraftLines((prev) => {
        const next = cloneLines(patternBuilt);
        prev.forEach((line, i) => {
          if (next[i]) {
            next[i].startTime = line.startTime || "";
            next[i].endTime = line.endTime || "";
            next[i].totalBeats = line.totalBeats || sumLineBeats(next[i]);
          }
          line.segments.forEach((seg, j) => {
            if (next[i]?.segments[j]) {
              next[i].segments[j].beats = seg.beats || next[i].segments[j].size;
            }
            seg.cells.forEach((cell, k) => {
              if (next[i]?.segments[j]?.cells[k] !== undefined) {
                next[i].segments[j].cells[k] = cell;
              }
            });
          });
        });
        return next;
      });
    }
  }, [patternText]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      if (audioRef.current) audioRef.current.pause();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const overallStats = useMemo(() => {
    const totalLines = draftLines.length;
    const doneLines = draftLines.filter(lineCellsFilled).length;
    const totalCells = draftLines.reduce((sum, line) => sum + line.segments.reduce((a, seg) => a + seg.size, 0), 0);
    const filledCells = draftLines.reduce(
      (sum, line) => sum + line.segments.reduce((a, seg) => a + seg.cells.filter((c) => c.trim().length > 0).length, 0),
      0
    );
    return { totalLines, doneLines, totalCells, filledCells };
  }, [draftLines]);

  const loadFromPattern = () => {
    const next = buildLinesFromPatternText(patternText);
    if (next.length > 0) {
      setDraftLines(next);
      setBeatsText(linesToBeatsText(next));
      setActiveTab("write");
    }
  };

  const detectFromLyrics = () => {
    const next = buildLinesFromLyricsText(sourceLyricsText);
    if (next.length > 0) {
      setDraftLines(next);
      setPatternText(linesToPatternText(next));
      setBeatsText(linesToBeatsText(next));
      setActiveTab("write");
    }
  };

  const loadExample1 = () => {
    const pattern = `4 4 5\n4 4 5\n7 7`;
    const lyrics = `春风 轻轻 吹过\n心事 慢慢 说破\n若你还在 远方等我`;
    setPatternText(pattern);
    setSourceLyricsText(lyrics);
    const next = buildLinesFromPatternText(pattern);
    setDraftLines(next);
    setBeatsText(linesToBeatsText(next));
  };

  const loadExample2 = () => {
    const lyrics = `I love you / more than stars\n夜风 轻轻 吹\n等你 回来`;
    const next = buildLinesFromLyricsText(lyrics);
    setSourceLyricsText(lyrics);
    setDraftLines(next);
    setPatternText(linesToPatternText(next));
    setBeatsText(linesToBeatsText(next));
  };

  const resetAll = () => {
    stopAudio();
    setPatternText("");
    setSourceLyricsText("");
    setDraftLines([]);
    setBeatsText("");
    setJianpuText("");
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
    setAudioName("");
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
      if (!seg.beats || seg.beats < 1) seg.beats = newSize;
      next[lineIdx].totalBeats = sumLineBeats(next[lineIdx]);
      setPatternText(linesToPatternText(next));
      setBeatsText(linesToBeatsText(next));
      return next;
    });
  };

  const updateSegmentBeats = (lineIdx: number, segIdx: number, value: string) => {
    const num = Number(value);
    setDraftLines((prev) => {
      const next = cloneLines(prev);
      const seg = next[lineIdx]?.segments[segIdx];
      if (!seg) return prev;
      seg.beats = !Number.isNaN(num) && num > 0 ? num : 1;
      next[lineIdx].totalBeats = sumLineBeats(next[lineIdx]);
      setBeatsText(linesToBeatsText(next));
      return next;
    });
  };

  const addSegment = (lineIdx: number) => {
    setDraftLines((prev) => {
      const next = cloneLines(prev);
      next[lineIdx]?.segments.push({ size: 1, cells: [""], beats: 1 });
      next[lineIdx].totalBeats = sumLineBeats(next[lineIdx]);
      setPatternText(linesToPatternText(next));
      setBeatsText(linesToBeatsText(next));
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
      setBeatsText(linesToBeatsText(next));
      return next;
    });
  };

  const addLine = () => {
    setDraftLines((prev) => {
      const next = [...cloneLines(prev), { segments: [{ size: 1, cells: [""], beats: 1 }], startTime: "", endTime: "", totalBeats: 1 }];
      setPatternText(linesToPatternText(next));
      setBeatsText(linesToBeatsText(next));
      return next;
    });
  };

  const removeLine = (lineIdx: number) => {
    setDraftLines((prev) => {
      const next = cloneLines(prev);
      next.splice(lineIdx, 1);
      setPatternText(linesToPatternText(next));
      setBeatsText(linesToBeatsText(next));
      return next;
    });
  };

  const handleAudioUpload = (file?: File) => {
    if (!file) return;
    stopAudio();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const nextUrl = URL.createObjectURL(file);
    setAudioUrl(nextUrl);
    setAudioName(file.name);
  };

  const stopAudio = () => {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (audioRef.current) audioRef.current.pause();
    setPlayingLabel("");
  };

  const playRange = async (startRaw?: string, endRaw?: string, label?: string) => {
    if (!audioRef.current || !audioUrl) return;
    const start = parseTimeToSeconds(startRaw);
    const end = parseTimeToSeconds(endRaw);
    if (start === null || end === null || end <= start) return;

    stopAudio();
    const audio = audioRef.current;
    audio.currentTime = start;
    try {
      await audio.play();
      setPlayingLabel(label || "播放中");
      stopTimerRef.current = window.setTimeout(() => {
        audio.pause();
        setPlayingLabel("");
      }, Math.max(0, (end - start) * 1000));
    } catch {
      setPlayingLabel("");
    }
  };

  const autoGenerateLineTimes = () => {
    const bpm = Number(tempoBpm);
    const start = parseTimeToSeconds(firstLineStart);
    if (Number.isNaN(bpm) || bpm <= 0 || start === null) return;

    const secondsPerBeat = 60 / bpm;
    setDraftLines((prev) => {
      const next = cloneLines(prev);
      let cursor = start;
      next.forEach((line) => {
        const totalBeats = sumLineBeats(line) || 1;
        line.totalBeats = totalBeats;
        line.startTime = formatSeconds(cursor);
        cursor += totalBeats * secondsPerBeat;
        line.endTime = formatSeconds(cursor);
      });
      return next;
    });
  };

  const autoGenerateBeatsFromText = () => {
    const beatLines = splitLines(beatsText).map((line) => parseBeatsLine(line));
    setDraftLines((prev) => {
      const next = cloneLines(prev);
      next.forEach((line, i) => {
        const current = beatLines[i] || [];
        line.segments.forEach((seg, j) => {
          seg.beats = current[j] || seg.size;
        });
        line.totalBeats = sumLineBeats(line);
      });
      return next;
    });
  };

  const autoGenerateBeatsFromJianpu = () => {
    const parsed = splitLines(jianpuText)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) =>
        line
          .split("|")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const notes = part.split(/\s+/).filter(Boolean);
            return notes.length || 1;
          })
      );

    setDraftLines((prev) => {
      const next = cloneLines(prev);
      next.forEach((line, i) => {
        const beatRow = parsed[i] || [];
        line.segments.forEach((seg, j) => {
          seg.beats = beatRow[j] || seg.size;
        });
        line.totalBeats = sumLineBeats(line);
      });
      setBeatsText(linesToBeatsText(next));
      return next;
    });
  };

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="hero">
          <div>
            <h1>填词格子编辑器</h1>
            <p>支持格式识别、格子填词、节拍调整，以及根据 BPM 自动生成整行播放时间。</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-outline" onClick={loadExample1}>示例 1</button>
            <button className="btn btn-outline" onClick={loadExample2}>示例 2</button>
            <button className="btn btn-ghost" onClick={resetAll}>清空</button>
          </div>
        </div>

        <section className="card">
          <div className="card-header">
            <h2>伴奏与自动时间生成</h2>
          </div>
          <div className="card-body stack">
            <div className="upload-row">
              <label className="upload-btn">
                上传纯音乐/伴奏
                <input type="file" accept="audio/*" onChange={(e) => handleAudioUpload(e.target.files?.[0])} hidden />
              </label>
              <div className="muted-text">{audioName ? `当前音频：${audioName}` : "还没有上传音频文件"}</div>
              {playingLabel ? <span className="pill pill-success">{playingLabel}</span> : null}
            </div>

            {audioUrl ? (
              <div className="soft-box">
                <audio ref={audioRef} src={audioUrl} controls className="audio-player" />
              </div>
            ) : null}

            <div className="two-col">
              <div className="soft-box stack">
                <div className="section-title">方式 A：直接输入每段节拍</div>
                <p className="muted-text">每行对应一行歌词，每个数字对应一个段落占多少拍。例如 4 4 5。</p>
                <textarea className="textarea" value={beatsText} onChange={(e) => setBeatsText(e.target.value)} />
                <button className="btn btn-primary" onClick={autoGenerateBeatsFromText}>应用节拍到当前结构</button>
              </div>

              <div className="soft-box stack">
                <div className="section-title">方式 B：输入简谱自动估算段落节拍</div>
                <p className="muted-text">约定用 | 分段。系统按每段有多少个音符，自动把它当作该段节拍数。</p>
                <textarea className="textarea" value={jianpuText} onChange={(e) => setJianpuText(e.target.value)} />
                <button className="btn btn-primary" onClick={autoGenerateBeatsFromJianpu}>从简谱估算节拍</button>
              </div>
            </div>

            <div className="soft-box stack">
              <div className="section-title">根据速度自动生成每一行播放时间</div>
              <div className="three-col">
                <div>
                  <div className="field-label">速度 BPM</div>
                  <input className="input" value={tempoBpm} onChange={(e) => setTempoBpm(e.target.value)} placeholder="例如 90" />
                </div>
                <div>
                  <div className="field-label">第一行开始时间</div>
                  <input className="input" value={firstLineStart} onChange={(e) => setFirstLineStart(e.target.value)} placeholder="例如 0:12.0" />
                </div>
                <div className="align-bottom">
                  <button className="btn btn-primary full-width" onClick={autoGenerateLineTimes}>自动生成整行时间</button>
                </div>
              </div>
              <p className="muted-text">先给每段设定节拍数，再按 BPM 把每一行总拍数换算成开始/结束时间。这里只保留整行播放。</p>
            </div>
          </div>
        </section>

        <div className="tabs">
          <button className={`tab ${activeTab === "build" ? "tab-active" : ""}`} onClick={() => setActiveTab("build")}>
            建立格式
          </button>
          <button className={`tab ${activeTab === "write" ? "tab-active" : ""}`} onClick={() => setActiveTab("write")}>
            格子填词
          </button>
        </div>

        {activeTab === "build" ? (
          <div className="stack">
            <div className="two-col">
              <section className="card">
                <div className="card-header">
                  <h2>方式 A：直接输入格式节奏</h2>
                </div>
                <div className="card-body stack">
                  <p className="muted-text">每行一条旋律结构，例如 4 4 5。</p>
                  <textarea className="textarea tall" value={patternText} onChange={(e) => setPatternText(e.target.value)} />
                  <button className="btn btn-primary" onClick={loadFromPattern}>按格式生成白框</button>
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <h2>方式 B：输入现成歌词自动识别</h2>
                </div>
                <div className="card-body stack">
                  <p className="muted-text">用空格、逗号、斜杠标出停顿。系统会识别每段多少字或词，并生成对应白框。</p>
                  <textarea className="textarea tall" value={sourceLyricsText} onChange={(e) => setSourceLyricsText(e.target.value)} />
                  <button className="btn btn-primary" onClick={detectFromLyrics}>从歌词识别格式</button>
                </div>
              </section>
            </div>

            <section className="card">
              <div className="card-header">
                <h2>当前识别/编辑后的格式</h2>
              </div>
              <div className="card-body">
                <div className="code-box">{patternText || "还没有格式"}</div>
              </div>
            </section>
          </div>
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
                <p>每一段还有“节拍”输入，用来描述这一段在旋律里占多少拍。整行播放时间会根据节拍自动换算。</p>
              </div>

              {draftLines.length === 0 ? (
                <div className="empty-state">先在“建立格式”里输入格式，或粘贴现成歌词识别格式。</div>
              ) : (
                draftLines.map((line, lineIdx) => (
                  <div key={lineIdx} className="line-card">
                    <div className="row-between line-head">
                      <div className="line-title-wrap">
                        <div className="line-title">第 {lineIdx + 1} 行</div>
                        <span className={`pill ${lineCellsFilled(line) ? "pill-success" : ""}`}>
                          {lineCellsFilled(line) ? "已填完" : "填写中"}
                        </span>
                        <span className="pill">总拍数 {line.totalBeats || sumLineBeats(line)}</span>
                      </div>
                      <div className="line-actions">
                        <button className="btn btn-outline" onClick={() => addSegment(lineIdx)}>加一段</button>
                        <button className="btn btn-outline" onClick={() => playRange(line.startTime, line.endTime, `播放第 ${lineIdx + 1} 行`)} disabled={!audioUrl}>
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
                        {line.startTime || line.endTime ? `区间：${line.startTime || "?"} - ${line.endTime || "?"}` : "等待自动生成整行时间"}
                      </div>
                    </div>

                    <div className="segment-stack">
                      {line.segments.map((seg, segIdx) => (
                        <div key={segIdx} className="segment-card">
                          <div className="row-between segment-head">
                            <div className="segment-title">第 {segIdx + 1} 段 · {seg.size} 格</div>
                            <div className="segment-actions">
                              <button className="mini-btn" onClick={() => adjustSegmentSize(lineIdx, segIdx, -1)}>-</button>
                              <button className="mini-btn" onClick={() => adjustSegmentSize(lineIdx, segIdx, 1)}>+</button>
                              <button className="btn btn-ghost" onClick={() => removeSegment(lineIdx, segIdx)}>删除段</button>
                            </div>
                          </div>

                          <div className="segment-beat-row">
                            <div>
                              <div className="field-label">本段节拍</div>
                              <input
                                className="input"
                                value={String(seg.beats || seg.size)}
                                onChange={(e) => updateSegmentBeats(lineIdx, segIdx, e.target.value)}
                                placeholder="如 4"
                              />
                            </div>
                            <div className="muted-text align-bottom">这一段占多少拍，由它决定整行时间长度。</div>
                          </div>

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
                <button className="btn btn-ghost" onClick={stopAudio}>停止播放</button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}