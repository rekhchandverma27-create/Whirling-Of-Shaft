const motorRpm = document.getElementById("motorRpm");
const motorRpmText = document.getElementById("motorRpmText");
const displayRpm = document.getElementById("displayRpm");
const displayCritical = document.getElementById("displayCritical");
const criticalLabel = document.getElementById("criticalLabel");
const criticalDisplay = document.getElementById("criticalDisplay");
const shaftCanvas = document.getElementById("shaftCanvas");
const shaftCtx = shaftCanvas.getContext("2d");
const responseGraph = document.getElementById("responseGraph");
const graphCtx = responseGraph.getContext("2d");
const lengthSlider = document.getElementById("shaftLength");
const diameterSlider = document.getElementById("shaftDiameter");
const eccentricitySlider = document.getElementById("shaftEccentricity");
const dampingSlider = document.getElementById("shaftDamping");
const lengthValue = document.getElementById("lengthValue");
const diameterValue = document.getElementById("diameterValue");
const eccentricityValue = document.getElementById("eccentricityValue");
const dampingValue = document.getElementById("dampingValue");
const matE = document.getElementById("matE");
const matRho = document.getElementById("matRho");
const materialButtons = document.querySelectorAll(".material-button");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const resetButton = document.getElementById("resetButton");
const statusBadge = document.getElementById("statusBadge");
const speedRatioReadout = document.getElementById("speedRatioReadout");
const omegaReadout = document.getElementById("omegaReadout");
const naturalFrequencyReadout = document.getElementById("naturalFrequencyReadout");
const criticalSpeedReadout = document.getElementById("criticalSpeedReadout");

const materials = {
  steel: { E: 210, rho: 7850, label: "Mild Steel" },
  aluminium: { E: 70, rho: 2700, label: "Aluminium" },
  brass: { E: 100, rho: 8500, label: "Brass" },
  copper: { E: 120, rho: 8960, label: "Copper" }
};

let currentMaterial = "steel";
let animationFrame = null;
let running = false;
let lastTimestamp = null;
let shaftPhase = 0;

function updateMaterialDisplay() {
  const material = materials[currentMaterial];
  matE.textContent = material.E;
  matRho.textContent = material.rho;
}

function calculateSectionProperties() {
  const L = parseFloat(lengthSlider.value) / 1000;
  const d = parseFloat(diameterSlider.value) / 1000;
  const mat = materials[currentMaterial];
  const I = Math.PI * Math.pow(d, 4) / 64;
  const A = Math.PI * Math.pow(d, 2) / 4;

  return { L, d, mat, I, A };
}

function calculateCritical() {
  const { L, mat, I, A } = calculateSectionProperties();
  const wc = (Math.PI ** 2 / (L ** 2)) * Math.sqrt((mat.E * 1e9 * I) / (mat.rho * A));
  return (wc * 60) / (2 * Math.PI);
}

function resizeCanvas() {
  const rect = shaftCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  shaftCanvas.width = rect.width * ratio;
  shaftCanvas.height = rect.height * ratio;
  shaftCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function resizeGraph() {
  const rect = responseGraph.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  responseGraph.width = rect.width * ratio;
  responseGraph.height = rect.height * ratio;
  graphCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function getAngularSpeed(rpm) {
  return (rpm * 2 * Math.PI) / 60;
}

function getDampedAmplitude(omega, omegaN, eccentricityMm, dampingRatio) {
  if (omegaN <= 0) return 0;

  const ratio = omega / omegaN;
  const denominator = Math.sqrt(
    Math.pow(1 - ratio * ratio, 2) + Math.pow(2 * dampingRatio * ratio, 2)
  );

  if (denominator === 0) return 0;

  return (eccentricityMm * ratio * ratio) / denominator;
}

function getNiceAxisLimit(value) {
  if (value <= 0) return 1;

  const exponent = Math.floor(Math.log10(value));
  const fraction = value / (10 ** exponent);
  let niceFraction = 1;

  if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }

  return niceFraction * (10 ** exponent);
}

function refreshUi() {
  motorRpmText.textContent = motorRpm.value;
  displayRpm.textContent = motorRpm.value;
  lengthValue.textContent = lengthSlider.value;
  diameterValue.textContent = diameterSlider.value;
  eccentricityValue.textContent = parseFloat(eccentricitySlider.value).toFixed(1);
  dampingValue.textContent = parseFloat(dampingSlider.value).toFixed(2);

  const critical = calculateCritical();
  const rounded = critical.toFixed(1);
  displayCritical.textContent = rounded;
  criticalLabel.textContent = rounded;
  criticalDisplay.textContent = rounded;

  drawShaft();
  drawResponseGraph();
}

function getWhirlResponse(rpm, critical) {
  if (rpm <= 0 || critical <= 0) {
    return {
      amplitude: 0,
      zone: "safe",
      label: "STOPPED"
    };
  }

  const speedRatio = rpm / critical;
  const omega = getAngularSpeed(rpm);
  const omegaN = getAngularSpeed(critical);
  const eccentricityMm = parseFloat(eccentricitySlider.value);
  const dampingRatio = parseFloat(dampingSlider.value);
  const responseAmplitude = getDampedAmplitude(omega, omegaN, eccentricityMm, dampingRatio);
  const amplitude = Math.min(40, 4 + responseAmplitude * 16);

  if (Math.abs(speedRatio - 1) <= 0.08) {
    return {
      amplitude,
      zone: "danger",
      label: "AT CRITICAL SPEED"
    };
  }

  if (speedRatio > 0.82 && speedRatio < 1.18) {
    return {
      amplitude,
      zone: "warning",
      label: "APPROACHING RESONANCE"
    };
  }

  return {
    amplitude,
    zone: "safe",
    label: speedRatio > 1 ? "ABOVE CRITICAL" : "SAFE OPERATION"
  };
}

function updateStatusBadge(zone, label) {
  statusBadge.textContent = label;
  statusBadge.classList.remove("warning", "danger");

  if (zone === "warning") {
    statusBadge.classList.add("warning");
  } else if (zone === "danger") {
    statusBadge.classList.add("danger");
  }
}

function drawShaft() {
  resizeCanvas();
  const width = shaftCanvas.width / (window.devicePixelRatio || 1);
  const height = shaftCanvas.height / (window.devicePixelRatio || 1);
  const margin = 8;
  const leftX = margin;
  const rightX = width - margin;
  const centerY = height / 2;

  shaftCtx.clearRect(0, 0, width, height);

  const rpm = parseFloat(motorRpm.value);
  const critical = calculateCritical();
  const whirlResponse = getWhirlResponse(rpm, critical);
  const amplitude = whirlResponse.amplitude;

  shaftPhase = (shaftPhase + (rpm / 60) * 0.035) % (Math.PI * 2);
  const phase = shaftPhase;

  updateStatusBadge(whirlResponse.zone, whirlResponse.label);

  shaftCtx.beginPath();
  shaftCtx.lineWidth = 10;
  shaftCtx.strokeStyle = whirlResponse.zone === "danger"
    ? "#dc2626"
    : whirlResponse.zone === "warning"
      ? "#f59e0b"
      : "#2563eb";
  shaftCtx.lineCap = "round";

  const segments = 80;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = leftX + (rightX - leftX) * t;
    const y = centerY + Math.sin(Math.PI * t) * Math.cos(phase) * amplitude;
    if (i === 0) {
      shaftCtx.moveTo(x, y);
    } else {
      shaftCtx.lineTo(x, y);
    }
  }
  shaftCtx.stroke();

  shaftCtx.strokeStyle = "rgba(100,116,139,0.4)";
  shaftCtx.lineWidth = 2;
  shaftCtx.setLineDash([6, 8]);
  shaftCtx.beginPath();
  shaftCtx.moveTo(leftX, centerY);
  shaftCtx.lineTo(rightX, centerY);
  shaftCtx.stroke();
  shaftCtx.setLineDash([]);

  shaftCtx.fillStyle = "#1e293b";
  shaftCtx.beginPath();
  shaftCtx.arc(leftX, centerY, 8, 0, Math.PI * 2);
  shaftCtx.fill();
  shaftCtx.beginPath();
  shaftCtx.arc(rightX, centerY, 8, 0, Math.PI * 2);
  shaftCtx.fill();

  const midX = (leftX + rightX) / 2;
  const midY = centerY + Math.cos(phase) * amplitude;
  shaftCtx.fillStyle = "#f8fafc";
  shaftCtx.beginPath();
  shaftCtx.arc(midX, midY, 6, 0, Math.PI * 2);
  shaftCtx.fill();
  shaftCtx.strokeStyle = "#0f172a";
  shaftCtx.lineWidth = 2;
  shaftCtx.stroke();

  const deflection = Math.abs(Math.cos(phase) * amplitude).toFixed(1);
  shaftCtx.fillStyle = "#1f2937";
  shaftCtx.font = "14px Inter, sans-serif";
  shaftCtx.fillText(`\u03b4 = ${deflection}`, width / 2 - 22, centerY - amplitude - 16);
}

function drawResponseGraph() {
  resizeGraph();

  const width = responseGraph.width / (window.devicePixelRatio || 1);
  const height = responseGraph.height / (window.devicePixelRatio || 1);
  const padding = { top: 18, right: 22, bottom: 56, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const criticalRpm = calculateCritical();
  const omegaN = getAngularSpeed(criticalRpm);
  const currentOmega = getAngularSpeed(parseFloat(motorRpm.value));
  const eccentricityMm = parseFloat(eccentricitySlider.value);
  const dampingRatio = parseFloat(dampingSlider.value);
  const sampledMaxOmega = Math.max(currentOmega * 1.2, omegaN * 1.6, 10);
  const curveSamples = 220;
  let rawPeakAmplitude = 0;

  for (let i = 0; i <= curveSamples; i++) {
    const omega = (sampledMaxOmega * i) / curveSamples;
    const amplitude = getDampedAmplitude(omega, omegaN, eccentricityMm, dampingRatio);
    if (Number.isFinite(amplitude)) {
      rawPeakAmplitude = Math.max(rawPeakAmplitude, amplitude);
    }
  }

  const maxOmega = getNiceAxisLimit(sampledMaxOmega);
  const peakAmplitude = getNiceAxisLimit(Math.max(rawPeakAmplitude, eccentricityMm, 0.1));
  const xDivisions = 5;
  const yDivisions = 5;

  graphCtx.clearRect(0, 0, width, height);

  graphCtx.fillStyle = "#ffffff";
  graphCtx.fillRect(0, 0, width, height);

  graphCtx.strokeStyle = "rgba(148,163,184,0.35)";
  graphCtx.lineWidth = 1;
  for (let i = 0; i <= yDivisions; i++) {
    const y = padding.top + (plotHeight / yDivisions) * i;
    graphCtx.beginPath();
    graphCtx.moveTo(padding.left, y);
    graphCtx.lineTo(width - padding.right, y);
    graphCtx.stroke();
  }

  for (let i = 0; i <= xDivisions; i++) {
    const x = padding.left + (plotWidth / xDivisions) * i;
    graphCtx.beginPath();
    graphCtx.moveTo(x, padding.top);
    graphCtx.lineTo(x, height - padding.bottom);
    graphCtx.stroke();
  }

  graphCtx.strokeStyle = "#0f172a";
  graphCtx.lineWidth = 1.5;
  graphCtx.beginPath();
  graphCtx.moveTo(padding.left, padding.top);
  graphCtx.lineTo(padding.left, height - padding.bottom);
  graphCtx.lineTo(width - padding.right, height - padding.bottom);
  graphCtx.stroke();

  graphCtx.strokeStyle = "#f59e0b";
  graphCtx.setLineDash([6, 6]);
  const criticalX = padding.left + (omegaN / maxOmega) * plotWidth;
  graphCtx.beginPath();
  graphCtx.moveTo(criticalX, padding.top);
  graphCtx.lineTo(criticalX, height - padding.bottom);
  graphCtx.stroke();
  graphCtx.setLineDash([]);

  graphCtx.beginPath();
  graphCtx.lineWidth = 3;
  graphCtx.strokeStyle = "#2563eb";

  for (let i = 0; i <= curveSamples; i++) {
    const omega = (maxOmega * i) / curveSamples;
    const amplitude = Math.min(getDampedAmplitude(omega, omegaN, eccentricityMm, dampingRatio), peakAmplitude);
    const x = padding.left + (omega / maxOmega) * plotWidth;
    const y = height - padding.bottom - (amplitude / peakAmplitude) * plotHeight;

    if (i === 0) {
      graphCtx.moveTo(x, y);
    } else {
      graphCtx.lineTo(x, y);
    }
  }
  graphCtx.stroke();

  const currentAmplitude = Math.min(getDampedAmplitude(currentOmega, omegaN, eccentricityMm, dampingRatio), peakAmplitude);
  const markerX = padding.left + (currentOmega / maxOmega) * plotWidth;
  const markerY = height - padding.bottom - (currentAmplitude / peakAmplitude) * plotHeight;

  graphCtx.fillStyle = "#dc2626";
  graphCtx.beginPath();
  graphCtx.arc(markerX, markerY, 5, 0, Math.PI * 2);
  graphCtx.fill();

  graphCtx.fillStyle = "#7c3aed";
  graphCtx.font = "600 15px Inter, sans-serif";
  graphCtx.save();
  graphCtx.translate(30, padding.top + plotHeight / 2 + 38);
  graphCtx.rotate(-Math.PI / 2);
  graphCtx.fillText("Amplitude", 0, 0);
  graphCtx.restore();
  graphCtx.fillStyle = "#334155";
  graphCtx.font = "600 12px Inter, sans-serif";
  graphCtx.fillText("0", padding.left - 14, height - padding.bottom + 4);
  graphCtx.fillText(`${peakAmplitude.toFixed(2)} mm`, 6, padding.top + 16);
  graphCtx.font = "700 12px Inter, sans-serif";
  graphCtx.fillText("0 rad/s", padding.left - 10, height - padding.bottom + 18);
  graphCtx.fillText(`${(maxOmega / 2).toFixed(2)} rad/s`, padding.left + plotWidth / 2 - 28, height - padding.bottom + 18);
  graphCtx.fillText(`${maxOmega.toFixed(0)} rad/s`, width - padding.right - 52, height - padding.bottom + 18);
  graphCtx.fillStyle = "#7c3aed";
  graphCtx.font = "700 15px Inter, sans-serif";
  graphCtx.fillText("Angular Speed", padding.left + plotWidth / 2 - 38, height - 12);
  graphCtx.font = "12px Inter, sans-serif";
  graphCtx.fillStyle = "#b45309";
  graphCtx.font = "12px Inter, sans-serif";
  graphCtx.fillText("Whirling Speed", criticalX - 32, padding.top + 14);

  speedRatioReadout.textContent = `r = ${(currentOmega / omegaN).toFixed(2)}`;
  omegaReadout.textContent = `\u03c9 = ${currentOmega.toFixed(1)} rad/s`;
  naturalFrequencyReadout.textContent = omegaN.toFixed(2);
  criticalSpeedReadout.textContent = criticalRpm.toFixed(2);
}

function animateShaft(timestamp) {
  if (!running) return;

  if (lastTimestamp === null) {
    lastTimestamp = timestamp;
  }

  lastTimestamp = timestamp;
  drawShaft();
  animationFrame = requestAnimationFrame(animateShaft);
}

motorRpm.addEventListener("input", refreshUi);
lengthSlider.addEventListener("input", refreshUi);
diameterSlider.addEventListener("input", refreshUi);
eccentricitySlider.addEventListener("input", refreshUi);
dampingSlider.addEventListener("input", refreshUi);

materialButtons.forEach((button) => {
  button.addEventListener("click", () => {
    materialButtons.forEach((btn) => btn.classList.remove("selected"));
    button.classList.add("selected");
    currentMaterial = button.dataset.material;
    updateMaterialDisplay();
    refreshUi();
  });
});

startButton.addEventListener("click", () => {
  if (running) return;
  running = true;
  animationFrame = requestAnimationFrame(animateShaft);
});

stopButton.addEventListener("click", () => {
  running = false;
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
});

resetButton.addEventListener("click", () => {
  motorRpm.value = 310;
  lengthSlider.value = 600;
  diameterSlider.value = 8;
  eccentricitySlider.value = 0.6;
  dampingSlider.value = 0.08;
  currentMaterial = "steel";
  materialButtons.forEach((btn) => btn.classList.remove("selected"));
  document.querySelector(".material-button[data-material='steel']").classList.add("selected");
  updateMaterialDisplay();
  refreshUi();
  stopButton.click();
  lastTimestamp = null;
  shaftPhase = 0;
});

window.addEventListener("load", () => {
  updateMaterialDisplay();
  refreshUi();
});

window.addEventListener("resize", () => {
  resizeCanvas();
  resizeGraph();
  drawShaft();
  drawResponseGraph();
});
