import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeScore } from './analysis/analyzer';
import { deleteScore, listScores, saveScore } from './db';
import { advancePlayback, interpolatedScrollTarget } from './playback';
import { applyTempo, formatTime, measureAtTime, moveMeasure, rebuildTimeline, updateMeasure } from './timeline';
import type { Measure, Score } from './types';

type View = 'perform' | 'correct';

function ConnectionBadges({ online }: { online: boolean }) {
  return <div className="badges" aria-label="기능 사용 상태">
    <span className="badge online">● 완전 오프라인 지원</span>
    <span className="badge engine">분석 이 기기에서 실행</span>
    <span className="badge saved">서버·계정 불필요</span>
    <span className={`badge ${online ? 'online' : 'offline'}`}>{online ? '온라인' : '오프라인'} 상태</span>
  </div>;
}

function Library({ scores, onOpen, onDelete }: {
  scores: Score[];
  onOpen: (score: Score) => void;
  onDelete: (id: string) => void;
}) {
  return <aside className="library">
    <div className="section-label">내 악보</div>
    <h2>오프라인 보관함</h2>
    <p className="muted">분석한 악보는 이 브라우저에 저장됩니다.</p>
    <div className="score-list">
      {scores.length === 0 && <div className="empty-small">아직 저장된 악보가 없습니다.</div>}
      {scores.map((score) => <article className="score-card" key={score.id}>
        <button className="score-open" onClick={() => onOpen(score)}>
          <span className="score-thumb">♫</span>
          <span><strong>{score.title}</strong><small>{score.pages.length}쪽 · {score.measures.length}마디 · {formatTime(score.totalDuration)}</small></span>
        </button>
        <button className="icon-button danger" aria-label={`${score.title} 삭제`} onClick={() => onDelete(score.id)}>×</button>
      </article>)}
    </div>
  </aside>;
}

const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '3/8', '6/8', '9/8', '12/8', '2/2'];

function UploadPanel({ busy, progress, onAnalyze, onExample }: {
  busy: boolean;
  progress: string;
  onAnalyze: (files: File[], bpm: number, timeSignature: string) => Promise<void>;
  onExample: () => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [bpm, setBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [error, setError] = useState('');
  const submit = async () => {
    if (!files.length) { setError('JPG, PNG 또는 PDF 악보를 선택해 주세요.'); return; }
    setError('');
    try { await onAnalyze(files, bpm, timeSignature); } catch (reason) { setError(reason instanceof Error ? reason.message : '분석하지 못했습니다.'); }
  };
  return <section className="upload-panel">
    <div className="eyebrow">OFFLINE PERFORMANCE READER</div>
    <h1>악보의 흐름을 읽고,<br/><em>연주에 맞춰 움직입니다.</em></h1>
    <p className="lead">마디와 박자를 이 기기에서 분석해 손을 건반에서 떼지 않는 연주 화면을 만드세요. 서버도, 인터넷도 필요 없습니다.</p>
    <label className="dropzone">
      <input type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" multiple disabled={busy}
        onChange={(event) => setFiles(Array.from(event.target.files ?? []))}/>
      <span className="upload-mark">↥</span>
      <strong>{files.length ? `${files.length}개 파일 선택됨` : '악보를 여기에 선택하세요'}</strong>
      <span>{files.length ? files.map((file) => file.name).join(' · ') : 'JPG, PNG, PDF · 여러 이미지 선택 가능'}</span>
    </label>
    <div className="upload-options">
      <label>기본 템포 <span><input type="number" min="20" max="300" value={bpm} onChange={(e) => setBpm(Number(e.target.value))}/> BPM</span></label>
      <label>박자표 <select value={timeSignature} onChange={(e) => setTimeSignature(e.target.value)}>{TIME_SIGNATURES.map((sig) => <option key={sig} value={sig}>{sig}</option>)}</select></label>
      <button className="primary" disabled={busy} onClick={submit}>{busy ? '분석 중…' : '악보 분석하기 →'}</button>
    </div>
    <button className="text-button" disabled={busy} onClick={onExample}>예제 악보로 바로 체험</button>
    {busy && progress && <p className="notice info">{progress}</p>}
    {error && <p className="notice error">{error}</p>}
    <div className="process-strip"><span><b>01</b> 업로드</span><i>→</i><span><b>02</b> 기기 내 분석</span><i>→</i><span><b>03</b> 보정</span><i>→</i><span><b>04</b> 연주</span></div>
  </section>;
}

function ScorePages({ score, currentIndex, onSeek }: { score: Score; currentIndex: number; onSeek: (time: number) => void }) {
  return <div className="score-stack">
    {score.pages.map((page, pageIndex) => <div className="score-page" data-page={pageIndex} key={page.id}>
      <img src={page.dataUrl} alt={`${score.title} ${pageIndex + 1}페이지`} draggable={false}/>
      <div className="measure-layer">
        {score.measures.map((measure, index) => measure.page === pageIndex && <button
          key={measure.id}
          className={`measure-box ${index === currentIndex ? 'active' : ''}`}
          style={{ left: `${measure.x * 100}%`, top: `${measure.y * 100}%`, width: `${measure.width * 100}%`, height: `${measure.height * 100}%` }}
          title={`${measure.number}마디에서 시작`}
          aria-label={`${measure.number}마디에서 시작`}
          onClick={() => onSeek(measure.startTime)}
        ><span>{measure.number}</span></button>)}
      </div>
      <span className="page-number">{pageIndex + 1}</span>
    </div>)}
  </div>;
}

function Player({ score, onEdit }: { score: Score; onEdit: () => void }) {
  const [time, setTimeState] = useState(0);
  const timeRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [offset, setOffset] = useState(0);
  const [countdownLength, setCountdownLength] = useState(3);
  const [countdown, setCountdown] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const currentIndex = useMemo(() => measureAtTime(score.measures, time), [score.measures, time]);
  const setTime = useCallback((value: number) => {
    const next = Math.min(score.totalDuration, Math.max(0, value));
    timeRef.current = next;
    setTimeState(next);
  }, [score.totalDuration]);

  useEffect(() => { setTime(0); setPlaying(false); }, [score.id, setTime]);
  useEffect(() => {
    if (!playing) return;
    const base = timeRef.current;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const next = advancePlayback(base, now - started, speed, score.totalDuration);
      if (next >= score.totalDuration) { setTime(score.totalDuration); setPlaying(false); return; }
      setTime(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, score.totalDuration, setTime, speed]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      const timer = window.setTimeout(() => { setCountdown(null); setPlaying(true); }, 400);
      return () => clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setCountdown((value) => value === null ? null : value - 1), 850);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const measure = score.measures[currentIndex];
    if (!scroller || !measure || currentIndex < 0) return;
    const next = score.measures[Math.min(currentIndex + 1, score.measures.length - 1)];
    const position = (item: Measure) => {
      const page = scroller.querySelector<HTMLElement>(`[data-page="${item.page}"]`);
      return page ? page.offsetTop + (item.y + item.height * 0.5) * page.clientHeight : 0;
    };
    const local = Math.min(1, Math.max(0, (time - measure.startTime) / measure.duration));
    const target = interpolatedScrollTarget(position(measure), position(next), local, scroller.clientHeight, offset);
    scroller.scrollTop = target;
  }, [currentIndex, offset, score.measures, time]);

  const toggle = useCallback(() => {
    if (countdown !== null) { setCountdown(null); return; }
    if (playing) { setPlaying(false); return; }
    if (timeRef.current >= score.totalDuration - 0.05) setTime(0);
    if (timeRef.current <= 0.05 && countdownLength > 0) setCountdown(countdownLength);
    else setPlaying(true);
  }, [countdown, countdownLength, playing, score.totalDuration, setTime]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.code === 'Space') { event.preventDefault(); toggle(); }
      if (event.key.toLowerCase() === 'r') { setPlaying(false); setTime(0); }
      if (event.key === 'ArrowLeft') setTime(timeRef.current - 5);
      if (event.key === 'ArrowRight') setTime(timeRef.current + 5);
      if (event.key.toLowerCase() === 'e') onEdit();
      if (event.key.toLowerCase() === 'f') playerRef.current?.requestFullscreen?.();
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [onEdit, setTime, toggle]);

  const current = score.measures[currentIndex];
  const remaining = Math.max(0, score.totalDuration - time);
  return <div className="player" ref={playerRef}>
    <div className="performance-head">
      <div><span className="section-label">PERFORMANCE</span><h2>{score.title}</h2></div>
      <div className="now-measure"><small>현재 구간</small><strong>{current ? `${current.number}마디` : '—'}</strong></div>
      <button className="outline" onClick={() => playerRef.current?.requestFullscreen?.()}>⛶ 전체 화면 <kbd>F</kbd></button>
    </div>
    <div className="score-viewport" ref={scrollerRef}>
      <ScorePages score={score} currentIndex={currentIndex} onSeek={setTime}/>
      {countdown !== null && <div className="countdown"><span>{countdown || '시작'}</span><small>{score.bpm} BPM</small></div>}
    </div>
    <div className="transport">
      <div className="progress-row"><span>{formatTime(time)}</span><input aria-label="재생 위치" type="range" min="0" max={score.totalDuration || 1} step="0.01" value={time} onChange={(e) => setTime(Number(e.target.value))}/><span>-{formatTime(remaining)}</span></div>
      <div className="transport-row">
        <div className="control-group">
          <button className="round" aria-label="처음으로" onClick={() => { setPlaying(false); setTime(0); }}>↺</button>
          <button className="round" aria-label="5초 뒤로" onClick={() => setTime(time - 5)}>−5</button>
          <button className="play" onClick={toggle}>{playing || countdown !== null ? 'Ⅱ' : '▶'}</button>
          <button className="round" aria-label="5초 앞으로" onClick={() => setTime(time + 5)}>+5</button>
        </div>
        <div className="settings-row">
          <label>배속 <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1.0×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2.0×</option></select></label>
          <label>위치 보정 <input aria-label="스크롤 위치 보정" type="range" min="-240" max="240" value={offset} onChange={(e) => setOffset(Number(e.target.value))}/><output>{offset > 0 ? '+' : ''}{offset}px</output></label>
          <label>카운트 <select value={countdownLength} onChange={(e) => setCountdownLength(Number(e.target.value))}><option value="0">없음</option><option value="2">2초</option><option value="3">3초</option><option value="4">4초</option></select></label>
        </div>
      </div>
      <div className="shortcut-hint"><kbd>Space</kbd> 재생/정지 · <kbd>← →</kbd> 5초 이동 · <kbd>R</kbd> 처음 · 악보 마디를 터치하면 해당 위치에서 시작</div>
    </div>
  </div>;
}

function NumberField({ value, min, max, step = 1, label, onChange }: { value: number; min?: number; max?: number; step?: number; label: string; onChange: (value: number) => void }) {
  return <input aria-label={label} type="number" value={Number(value.toFixed(step < 1 ? 2 : 0))} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))}/>;
}

function Correction({ score, onChange, onDone }: { score: Score; onChange: (score: Score) => void; onDone: () => void }) {
  const setMeasure = (id: string, patch: Partial<Measure>) => onChange(updateMeasure(score, id, patch));
  const addMeasure = () => {
    const previous = score.measures.at(-1);
    const measure: Measure = {
      id: crypto.randomUUID(), index: score.measures.length, number: String(score.measures.length + 1),
      page: previous?.page ?? 0, x: previous?.x ?? 0.05, y: Math.min(0.9, (previous?.y ?? 0) + 0.08),
      width: previous?.width ?? 0.9, height: previous?.height ?? 0.12, beats: 4, bpm: score.bpm,
      duration: 240 / score.bpm, startTime: score.totalDuration, confidence: 1, source: 'manual',
    };
    onChange(rebuildTimeline(score, [...score.measures, measure]));
  };
  const duplicateMeasure = (index: number) => {
    const original = score.measures[index];
    const duplicate = { ...original, id: crypto.randomUUID(), number: `${original.number}↻`, source: 'manual', confidence: 1 };
    const measures = [...score.measures];
    measures.splice(index + 1, 0, duplicate);
    onChange(rebuildTimeline(score, measures));
  };
  return <section className="correction">
    <div className="correction-head"><div><span className="section-label">TIMELINE CORRECTION</span><h2>인식 결과 보정</h2><p>연주 순서, 위치와 시간을 직접 수정하면 즉시 타임라인에 반영됩니다.</p></div><button className="primary" onClick={onDone}>저장하고 연주 →</button></div>
    <div className="global-tempo">
      <div><strong>전체 템포 다시 계산</strong><span>각 마디의 인식 박자 수를 유지하고 시간을 새 BPM으로 계산합니다.</span></div>
      <NumberField label="전체 BPM" value={score.bpm} min={20} max={300} onChange={(bpm) => onChange({ ...score, bpm })}/>
      <button className="outline" onClick={() => onChange(applyTempo(score, score.bpm))}>전체 적용</button>
    </div>
    {score.warnings.length > 0 && <div className="warnings"><strong>인식 메모</strong>{score.warnings.map((warning) => <span key={warning}>• {warning}</span>)}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>순서</th><th>마디</th><th>박(♩)</th><th>BPM</th><th>시간(초)</th><th>페이지</th><th>X %</th><th>Y %</th><th>신뢰도</th><th></th></tr></thead>
      <tbody>{score.measures.map((measure, index) => <tr key={measure.id} className={measure.source === 'manual' ? 'manual-row' : ''}>
        <td><div className="order-buttons"><button disabled={index === 0} onClick={() => onChange(moveMeasure(score, index, -1))}>↑</button><button disabled={index === score.measures.length - 1} onClick={() => onChange(moveMeasure(score, index, 1))}>↓</button></div></td>
        <td><input aria-label={`${index + 1}번 마디 이름`} value={measure.number} onChange={(e) => setMeasure(measure.id, { number: e.target.value })}/></td>
        <td><NumberField label={`${measure.number}마디 박 수`} value={measure.beats} min={0.25} max={64} step={0.25} onChange={(beats) => setMeasure(measure.id, { beats })}/></td>
        <td><NumberField label={`${measure.number}마디 BPM`} value={measure.bpm} min={20} max={300} onChange={(bpm) => setMeasure(measure.id, { bpm })}/></td>
        <td><NumberField label={`${measure.number}마디 시간`} value={measure.duration} min={0.1} max={600} step={0.1} onChange={(duration) => setMeasure(measure.id, { duration })}/></td>
        <td><NumberField label={`${measure.number}마디 페이지`} value={measure.page + 1} min={1} max={score.pages.length} onChange={(page) => setMeasure(measure.id, { page: Math.max(0, page - 1) })}/></td>
        <td><NumberField label={`${measure.number}마디 가로 위치`} value={measure.x * 100} min={0} max={100} step={0.1} onChange={(x) => setMeasure(measure.id, { x: x / 100 })}/></td>
        <td><NumberField label={`${measure.number}마디 세로 위치`} value={measure.y * 100} min={0} max={100} step={0.1} onChange={(y) => setMeasure(measure.id, { y: y / 100 })}/></td>
        <td><span className={`confidence ${measure.confidence < 0.5 ? 'low' : ''}`}>{Math.round(measure.confidence * 100)}%</span></td>
        <td><button className="icon-button" title="반복용 복제" aria-label={`${measure.number}마디 복제`} onClick={() => duplicateMeasure(index)}>⧉</button><button className="icon-button danger" aria-label={`${measure.number}마디 삭제`} onClick={() => onChange(rebuildTimeline(score, score.measures.filter((item) => item.id !== measure.id)))}>×</button></td>
      </tr>)}</tbody>
    </table></div>
    <button className="add-row" onClick={addMeasure}>＋ 수동 구간 추가</button>
    <p className="correction-note">기기 내 분석은 음표 길이나 인쇄된 템포를 읽지 않고 마디 위치와 박자표만으로 시간을 계산합니다. 반복, D.C./D.S., 코다, 페르마타, 점진적 템포 변화는 위·아래 버튼으로 실제 연주 순서를 만들고 구간 시간을 직접 지정해 보정하세요.</p>
  </section>;
}

export function App() {
  const [scores, setScores] = useState<Score[]>([]);
  const [score, setScore] = useState<Score | null>(null);
  const [view, setView] = useState<View>('perform');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [online, setOnline] = useState(navigator.onLine);

  const refresh = useCallback(() => listScores().then(setScores).catch(console.error), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    if (!score) return;
    const timer = window.setTimeout(() => saveScore(score).then(refresh).catch(console.error), 350);
    return () => clearTimeout(timer);
  }, [refresh, score]);

  const analyzeFiles = async (files: File[], bpm: number, timeSignature: string) => {
    setBusy(true);
    setProgress('분석 준비 중…');
    try {
      const analyzed = await analyzeScore(files, { bpm, timeSignature, onProgress: setProgress });
      await saveScore(analyzed);
      setScore(analyzed); setView('correct'); await refresh();
    } finally { setBusy(false); setProgress(''); }
  };
  const analyzeExample = async () => {
    const response = await fetch('sample-score.png');
    if (!response.ok) throw new Error('예제 악보를 불러오지 못했습니다.');
    const file = new File([await response.blob()], 'scoreflow-example.png', { type: 'image/png' });
    await analyzeFiles([file], 108, '4/4');
  };
  const remove = async (id: string) => {
    await deleteScore(id); if (score?.id === id) setScore(null); await refresh();
  };

  return <div className="app-shell">
    <header className="app-header">
      <button className="brand" onClick={() => setScore(null)}><span>♪</span><strong>ScoreFlow</strong><small>offline performance reader</small></button>
      <ConnectionBadges online={online}/>
      {score && <nav><button className={view === 'perform' ? 'active' : ''} onClick={() => setView('perform')}>연주</button><button className={view === 'correct' ? 'active' : ''} onClick={() => setView('correct')}>보정</button><button onClick={() => setScore(null)}>보관함</button></nav>}
    </header>
    {!score ? <main className="home-layout"><Library scores={scores} onOpen={(item) => { setScore(item); setView('perform'); }} onDelete={remove}/><UploadPanel busy={busy} progress={progress} onAnalyze={analyzeFiles} onExample={analyzeExample}/></main>
      : <main className="workspace">{view === 'perform' ? <Player score={score} onEdit={() => setView('correct')}/> : <Correction score={score} onChange={setScore} onDone={() => setView('perform')}/>}</main>}
    <footer><span>ScoreFlow · 분석·보정·재생·저장이 모두 이 기기에서 이루어집니다.</span><span>서버·계정 불필요 · 한 번 열면 인터넷 없이도 분석과 자동 스크롤 가능</span></footer>
  </div>;
}
