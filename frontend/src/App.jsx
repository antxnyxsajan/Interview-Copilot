import { useState, useRef } from 'react';
import './App.css';

// Tiny helper to get a timestamped label
const getTimestamp = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
};

export default function App() {
  const [transcript, setTranscript] = useState([]);
  const [aiFlags, setAiFlags] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [file, setFile] = useState(null);
  const [inputMode, setInputMode] = useState('live');
  const [manualText, setManualText] = useState('');

  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  /* ── Upload Resume ── */
  const handleUpload = async () => {
    if (!file) return alert("Select a PDF first.");
    const formData = new FormData();
    formData.append('resume', file);
    try {
      const res = await fetch('http://localhost:3000/upload-resume', { method: 'POST', body: formData });
      const data = await res.json();
      alert(data.message);
    } catch {
      alert("Make sure your Node backend is running!");
    }
  };

  /* ── Start Live Interview ── */
  const startInterview = async () => {
    setIsRecording(true);
    wsRef.current = new WebSocket('ws://localhost:3000');

    wsRef.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'transcript') {
        setTranscript((prev) => [{ text: msg.text, ts: getTimestamp() }, ...prev]);
      } else if (msg.type === 'ai-flag') {
        setAiFlags((prev) => [msg.data, ...prev]);
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data);
        }
      });
      mediaRecorderRef.current.start(1000);
    } catch {
      alert("Please allow microphone permissions in your browser!");
      setIsRecording(false);
    }
  };

  const stopInterview = () => {
    mediaRecorderRef.current?.stop();
    wsRef.current?.close();
    setIsRecording(false);
  };

  /* ── Manual Analyze ── */
  const handleManualAnalyze = async () => {
    if (!manualText.trim()) return;
    setTranscript((prev) => [{ text: manualText, ts: getTimestamp() }, ...prev]);
    try {
      const res = await fetch('http://localhost:3000/analyze-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: manualText }),
      });
      const data = await res.json();
      if (data?.flag) setAiFlags((prev) => [data, ...prev]);
      setManualText('');
    } catch {
      alert("Backend error! Is the Node server running?");
    }
  };

  const isLive = inputMode === 'live';

  return (
    <div className="container">

      {/* ── HEADER ── */}
      <header className="header">
        <div className="header-left">
          <span className="header-eyebrow">// Interview Intelligence System</span>
          <h1>
            <span className="logo-accent">⬡</span> Interview Copilot
          </h1>
        </div>

        <div className="upload-section">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            accept=".pdf"
            className="file-input"
          />
          <button onClick={handleUpload} className="btn primary">
            ↑ Upload Resume
          </button>
        </div>
      </header>

      {/* ── RECORD CONTROLS (live mode only) ── */}
      {isLive && (
        <section className="controls">
          <button
            onClick={startInterview}
            disabled={isRecording}
            className={`btn success ${isRecording ? 'recording' : ''}`}
          >
            {isRecording ? 'Recording Live' : '▶ Start Session'}
          </button>
          <button onClick={stopInterview} disabled={!isRecording} className="btn danger">
            ■ End Session
          </button>
        </section>
      )}

      {/* ── DASHBOARD ── */}
      <div className="dashboard">

        {/* LEFT PANEL — Transcript */}
        <div className="panel" data-tag="STREAM-01">
          <div className="panel-header">
            <h2>
              <span className="panel-icon blue">
                {isLive ? '🎙' : '📋'}
              </span>
              {isLive ? 'Live Transcript' : 'Paste Transcript'}
              {transcript.length > 0 && (
                <span className="count-pill">{transcript.length}</span>
              )}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isLive && (
                <span className={`status-badge ${isRecording ? 'live' : 'idle'}`}>
                  {isRecording ? '● Live' : '○ Idle'}
                </span>
              )}
              <button
                className="mode-toggle"
                onClick={() => setInputMode(isLive ? 'manual' : 'live')}
              >
                ⇄ {isLive ? 'Manual' : 'Live Audio'}
              </button>
            </div>
          </div>

          <div className="scroll-box">
            {isLive ? (
              <>
                {transcript.length === 0 && (
                  <div className="empty-state">
                    <span className="empty-icon">🎙</span>
                    <span>Awaiting audio stream</span>
                  </div>
                )}
                {transcript.map((item, i) => (
                  <div key={i} className="transcript-bubble">
                    <span className="bubble-ts">{item.ts}</span>
                    {item.text}
                  </div>
                ))}
              </>
            ) : (
              <div className="manual-container">
                <textarea
                  className="manual-textarea"
                  placeholder="Paste the candidate's spoken answer here and click Analyze..."
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                />
                <button
                  className="btn primary"
                  onClick={handleManualAnalyze}
                  disabled={!manualText.trim()}
                >
                  ⬡ Analyze Text
                </button>

                {transcript.length > 0 && (
                  <>
                    <div className="history-divider"><span>History</span></div>
                    {transcript.map((item, i) => (
                      <div key={i} className="transcript-bubble" style={{ marginBottom: 4 }}>
                        <span className="bubble-ts">{item.ts}</span>
                        {item.text}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL — AI Flags */}
        <div className="panel" data-tag="ANALYSIS-02">
          <div className="panel-header">
            <h2>
              <span className="panel-icon amber">🧠</span>
              AI Insights &amp; Flags
              {aiFlags.length > 0 && (
                <span className="count-pill amber">{aiFlags.length}</span>
              )}
            </h2>
            <span className={`status-badge ${aiFlags.length > 0 ? 'ready' : 'idle'}`}>
              {aiFlags.length > 0 ? `${aiFlags.length} Flag${aiFlags.length > 1 ? 's' : ''}` : 'Scanning'}
            </span>
          </div>

          <div className="scroll-box">
            {aiFlags.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon">🧠</span>
                <span>Scanning for discrepancies</span>
              </div>
            )}
            {aiFlags.map((flag, i) => (
              <div key={i} className="flag-card">
                <div className="flag-header">
                  <span className="flag-label">Resume Discrepancy</span>
                  <span className="flag-badge">Flag #{aiFlags.length - i}</span>
                </div>
                <p>{flag.reason}</p>
                <div className="follow-up">
                  <span className="follow-up-label">Suggested Question</span>
                  <em>{flag.follow_up}</em>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}