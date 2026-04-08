/* =====================================================
   EMOTIONAL TRANSLATOR — app.js
   Handles: microphone, OpenAI Realtime WebRTC, UI updates
   ===================================================== */

(function () {
  "use strict";

  // ── State ──────────────────────────────────────────
  let peerConnection = null;
  let dataChannel = null;
  let localStream = null;
  let isRecording = false;
  let sessionToken = null;
  let currentTranscript = "";
  let emotionHistory = [];
  let reconnectTimer = null;

  const DEFAULT_STATE = {
    valence: 0,
    arousal: 0.1,
    intensity: 0.1,
    dominant_emotion: "—",
    secondary_emotions: [],
    vocal_features: { pace: "—", hesitation: "—", pitch_variation: "—", tension: "—" },
    visual_keywords: [],
  };

  // ── DOM Refs ────────────────────────────────────────
  const micBtn       = document.getElementById("micBtn");
  const micLabel     = document.getElementById("micLabel");
  const statusDot    = document.getElementById("statusDot");
  const statusText   = document.getElementById("statusText");
  const domEmotion   = document.getElementById("dominantEmotion");
  const domSecondary = document.getElementById("secondaryEmotions");
  const valenceFill  = document.getElementById("valenceFill");
  const arousalFill  = document.getElementById("arousalFill");
  const intensityFill = document.getElementById("intensityFill");
  const valenceVal   = document.getElementById("valenceVal");
  const arousalVal   = document.getElementById("arousalVal");
  const intensityVal = document.getElementById("intensityVal");
  const vPace        = document.getElementById("vPace");
  const vHesitation  = document.getElementById("vHesitation");
  const vPitch       = document.getElementById("vPitch");
  const vTension     = document.getElementById("vTension");
  const kwContainer  = document.getElementById("visualKeywords");
  const historyStrip = document.getElementById("historyStrip");
  const transcriptEl = document.getElementById("transcriptInner");

  // ── Init ────────────────────────────────────────────
  micBtn.addEventListener("click", handleMicClick);
  setStatus("idle", "Click to begin");

  // ── Mic Button Handler ──────────────────────────────
  async function handleMicClick() {
    if (isRecording) {
      stopSession();
    } else {
      await startSession();
    }
  }

  // ── Start Session ───────────────────────────────────
  async function startSession() {
    setStatus("analyzing", "Connecting…");
    micLabel.textContent = "Connecting…";
    micBtn.disabled = true;

    try {
      // 1. Fetch ephemeral token from our backend
      const res = await fetch("/api/session", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to get session token");
      }
      const sessionData = await res.json();
      sessionToken = sessionData.client_secret?.value;

      if (!sessionToken) {
        throw new Error("No client_secret in session response. Check your OpenAI API key and model access.");
      }

      // 2. Get microphone
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });

      // 3. Set up WebRTC
      peerConnection = new RTCPeerConnection();

      // Add mic track
      localStream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      // Remote audio (model voice — not used for speech but needed for API)
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
      peerConnection.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // 4. Data channel for events
      dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannel.onopen = () => {
        isRecording = true;
        micBtn.disabled = false;
        micBtn.classList.add("active");
        setStatus("listening", "Listening");
        micLabel.textContent = "Tap to stop";
      };
      dataChannel.onmessage = handleDataMessage;
      dataChannel.onerror = (e) => console.warn("DataChannel error:", e);

      // 5. SDP exchange
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sdpRes = await fetch(
        "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );

      if (!sdpRes.ok) {
        const errText = await sdpRes.text();
        throw new Error(`OpenAI WebRTC error ${sdpRes.status}: ${errText}`);
      }

      const answerSdp = await sdpRes.text();
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

    } catch (err) {
      console.error("Session start error:", err);
      showToast("Error: " + err.message);
      stopSession();
    }
  }

  // ── Stop Session ────────────────────────────────────
  function stopSession() {
    isRecording = false;

    if (dataChannel) { dataChannel.close(); dataChannel = null; }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }

    micBtn.disabled = false;
    micBtn.classList.remove("active", "analyzing");
    setStatus("idle", "Idle");
    micLabel.textContent = "Click to begin";
    currentTranscript = "";
    sessionToken = null;
  }

  // ── Handle Realtime Data Channel Messages ───────────
  function handleDataMessage(event) {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    switch (msg.type) {
      case "response.audio_transcript.delta":
        handleTranscriptDelta(msg.delta || "");
        break;

      case "response.audio_transcript.done":
        currentTranscript = msg.transcript || "";
        updateTranscript(currentTranscript);
        break;

      case "response.text.delta":
        // Accumulate JSON from text deltas
        handleTextDelta(msg.delta || "");
        break;

      case "response.text.done":
        tryParseEmotion(msg.text || "");
        accumulatedText = "";
        break;

      case "response.done":
        micBtn.classList.remove("analyzing");
        if (isRecording) {
          micBtn.classList.add("active");
          setStatus("listening", "Listening");
        }
        break;

      case "response.created":
        micBtn.classList.add("analyzing");
        micBtn.classList.remove("active");
        setStatus("analyzing", "Analyzing");
        break;

      case "error":
        console.error("Realtime API error:", msg);
        showToast("API error: " + (msg.error?.message || "unknown"));
        break;
    }
  }

  // ── Text accumulation for JSON parsing ──────────────
  let accumulatedText = "";
  let accumulatedTranscript = "";

  function handleTranscriptDelta(delta) {
    accumulatedTranscript += delta;
    updateTranscript(accumulatedTranscript);
  }

  function handleTextDelta(delta) {
    accumulatedText += delta;
  }

  function tryParseEmotion(text) {
    // Try to extract JSON from the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    try {
      const data = JSON.parse(jsonMatch[0]);
      if (typeof data.valence === "number") {
        applyEmotionData(data);
      }
    } catch (e) {
      console.warn("Could not parse emotion JSON:", e, text);
    }
  }

  // ── Apply Emotion Data ───────────────────────────────
  function applyEmotionData(data) {
    const state = Object.assign({}, DEFAULT_STATE, data);

    // Push to history
    emotionHistory.push({ ...state, timestamp: Date.now() });
    if (emotionHistory.length > 20) emotionHistory.shift();

    // Update global sketch state
    if (window.updateEmotionState) {
      window.updateEmotionState(state, emotionHistory);
    }

    updateMetricsUI(state);
    updateHistoryStrip();
  }

  // ── Update Metrics UI ────────────────────────────────
  function updateMetricsUI(state) {
    // Dominant emotion
    domEmotion.textContent = state.dominant_emotion || "—";
    domEmotion.style.color = valenceToColor(state.valence);

    // Secondary emotions
    domSecondary.innerHTML = "";
    (state.secondary_emotions || []).slice(0, 4).forEach((em) => {
      const tag = document.createElement("span");
      tag.className = "emotion-tag";
      tag.textContent = em;
      domSecondary.appendChild(tag);
    });

    // Valence bar (centered, -1 to 1)
    const vNorm = (state.valence + 1) / 2; // 0 to 1
    const vCenter = 50; // center %
    const vWidth = Math.abs(state.valence) * 50;
    if (state.valence >= 0) {
      valenceFill.style.left = `${vCenter}%`;
      valenceFill.style.width = `${vWidth}%`;
      valenceFill.style.background = "var(--val-pos)";
    } else {
      valenceFill.style.left = `${vCenter - vWidth}%`;
      valenceFill.style.width = `${vWidth}%`;
      valenceFill.style.background = "var(--val-neg)";
    }
    valenceVal.textContent = state.valence.toFixed(2);

    // Arousal bar
    arousalFill.style.width = `${state.arousal * 100}%`;
    arousalVal.textContent = state.arousal.toFixed(2);

    // Intensity bar
    intensityFill.style.width = `${state.intensity * 100}%`;
    intensityVal.textContent = state.intensity.toFixed(2);

    // Vocal features
    const vf = state.vocal_features || {};
    vPace.textContent      = vf.pace        || "—";
    vHesitation.textContent = vf.hesitation  || "—";
    vPitch.textContent     = vf.pitch_variation || "—";
    vTension.textContent   = vf.tension     || "—";

    // Color vocal values by level
    colorLevel(vPace,       vf.pace,        ["slow","measured","moderate","hurried","rapid","pressured"]);
    colorLevel(vHesitation, vf.hesitation,  ["none","minimal","occasional","frequent","excessive"]);
    colorLevel(vTension,    vf.tension,     ["relaxed","mild","moderate","taut","strained"]);

    // Visual keywords
    kwContainer.innerHTML = "";
    (state.visual_keywords || []).forEach((kw) => {
      const tag = document.createElement("span");
      tag.className = "keyword-tag";
      tag.textContent = kw;
      kwContainer.appendChild(tag);
    });
  }

  function colorLevel(el, val, scale) {
    const idx = scale.indexOf(val);
    if (idx < 0) return;
    const t = idx / (scale.length - 1);
    if (t < 0.33) el.style.color = "var(--val-pos)";
    else if (t < 0.66) el.style.color = "var(--arousal)";
    else el.style.color = "var(--val-neg)";
  }

  // ── History Strip ────────────────────────────────────
  function updateHistoryStrip() {
    historyStrip.innerHTML = "";
    const recent = emotionHistory.slice(-8).reverse();
    recent.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "history-item";

      const swatch = document.createElement("div");
      swatch.className = "history-swatch";
      swatch.style.background = valenceToColor(entry.valence);
      swatch.style.boxShadow = `0 0 6px ${valenceToColor(entry.valence)}80`;

      const label = document.createElement("span");
      label.className = "history-emotion";
      label.textContent = entry.dominant_emotion;

      const time = document.createElement("span");
      time.className = "history-time";
      time.textContent = formatTime(entry.timestamp);

      item.appendChild(swatch);
      item.appendChild(label);
      item.appendChild(time);
      historyStrip.appendChild(item);
    });
  }

  // ── Transcript ───────────────────────────────────────
  function updateTranscript(text) {
    if (!text) return;
    transcriptEl.innerHTML = "";
    const span = document.createElement("span");
    span.textContent = text;
    transcriptEl.appendChild(span);
  }

  // ── Helpers ──────────────────────────────────────────
  function setStatus(state, text) {
    statusDot.className = "status-dot " + state;
    statusText.textContent = text;
  }

  function valenceToColor(v) {
    if (v > 0.2) return "var(--val-pos)";
    if (v < -0.2) return "var(--val-neg)";
    return "var(--accent-warm)";
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function showToast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ── Expose initial state to sketch ──────────────────
  window.getEmotionState = () => DEFAULT_STATE;
  window.getEmotionHistory = () => emotionHistory;

})();
