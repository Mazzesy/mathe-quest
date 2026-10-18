(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const STORAGE_KEY = 'matheQuestProgress_v1';
  const OPERATION_INFO = { plus:{label:'Plus',symbol:'➕'}, minus:{label:'Minus',symbol:'➖'}, mal:{label:'Mal',symbol:'✖️'}, geteilt:{label:'Geteilt',symbol:'➗'} };
  const MODE_LABELS = { gemischt:'Gemischte Runde', plus:'Plus-Runde', minus:'Minus-Runde', mal:'Mal-Runde', geteilt:'Geteilt-Runde' };
  const LEVELS = {
    leicht: { max: 30, factorA: 10, factorB: 10, note: 'Kleine Zahlen zum Warmwerden, Einmaleins bis 10 und Division ohne Rest.' },
    mittel: { max: 1000, factorA: 15, factorB: 15, note: 'Bis 1.000 rechnen, größere Einmaleins-Aufgaben und Division ohne Rest.' },
    schwer: { max: 10000, factorA: 30, factorB: 25, note: 'Große Zahlen, anspruchsvolle Multiplikation und Division ohne Rest.' }
  };
  let mode = 'gemischt';
  let level = 'mittel';
  let question = null;
  let index = 0;
  let roundCorrect = 0;
  let roundAnswered = 0;
  let streak = 0;
  let totalCorrectThisSession = 0;
  let roundTimeTotalMs = 0;
  let roundTimeCount = 0;
  let roundOperationStats = emptyOperationStats();
  let answered = false;
  let hintUsed = false;
  // Active time for the current task; time spent in another app/tab is paused.
  let questionElapsedMs = 0;
  let questionTimerStartedAt = 0;
  let questionTimerPaused = false;
  let history = loadHistory();
  // Beim Öffnen sind immer alle vier Rechenarten vorausgewählt.
  // Die Auswahl wird während der Sitzung angepasst, bei einem neuen Laden beginnt sie wieder vollständig.
  let selectedMixedOperations = Object.keys(OPERATION_INFO);

  function syncModeFromSelection() {
    mode = selectedMixedOperations.length === 1 ? selectedMixedOperations[0] : 'gemischt';
  }
  function emptyOperationStats() {
    const blank = () => ({correct:0, answered:0, timeTotalMs:0, timeCount:0});
    return { plus:blank(), minus:blank(), mal:blank(), geteilt:blank() };
  }
  function emptyLevelStats() {
    return Object.fromEntries(Object.keys(LEVELS).map(key => [key, { correct:0, answered:0, ops:emptyOperationStats() }]));
  }
  function createEmptyHistory() {
    return { stars:0, rounds:0, correct:0, answered:0, ops:emptyOperationStats(), byLevel:emptyLevelStats(), trend:[] };
  }
  function safeCount(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  function loadHistory() {
    const fallback = createEmptyHistory();
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const ops = emptyOperationStats();
      for (const kind of Object.keys(ops)) {
        const previous = parsed.ops && parsed.ops[kind] ? parsed.ops[kind] : {};
        ops[kind] = {
          correct:safeCount(previous.correct),
          answered:safeCount(previous.answered),
          timeTotalMs:safeCount(previous.timeTotalMs),
          timeCount:safeCount(previous.timeCount)
        };
      }
      const byLevel = emptyLevelStats();
      for (const levelKey of Object.keys(LEVELS)) {
        const previousLevel = parsed.byLevel && parsed.byLevel[levelKey] ? parsed.byLevel[levelKey] : {};
        byLevel[levelKey].correct = safeCount(previousLevel.correct);
        byLevel[levelKey].answered = safeCount(previousLevel.answered);
        for (const kind of Object.keys(byLevel[levelKey].ops)) {
          const previousOp = previousLevel.ops && previousLevel.ops[kind] ? previousLevel.ops[kind] : {};
          byLevel[levelKey].ops[kind] = {
            correct:safeCount(previousOp.correct),
            answered:safeCount(previousOp.answered),
            timeTotalMs:safeCount(previousOp.timeTotalMs),
            timeCount:safeCount(previousOp.timeCount)
          };
        }
      }
      const trend = Array.isArray(parsed.trend) ? parsed.trend.filter(item => item && typeof item.date === 'string' && Number.isFinite(Date.parse(item.date))).slice(-50).map(item => {
        const sampleOps = emptyOperationStats();
        for (const kind of Object.keys(sampleOps)) {
          const oldOp = item.ops && item.ops[kind] ? item.ops[kind] : {};
          sampleOps[kind] = { correct:safeCount(oldOp.correct), answered:safeCount(oldOp.answered), timeTotalMs:safeCount(oldOp.timeTotalMs), timeCount:safeCount(oldOp.timeCount) };
        }
        return {
          date:item.date,
          mode:Object.prototype.hasOwnProperty.call(MODE_LABELS, item.mode) ? item.mode : 'gemischt',
          level:Object.prototype.hasOwnProperty.call(LEVELS, item.level) ? item.level : 'mittel',
          correct:safeCount(item.correct), answered:safeCount(item.answered),
          timeTotalMs:safeCount(item.timeTotalMs), timeCount:safeCount(item.timeCount), ops:sampleOps
        };
      }) : [];
      return { stars:safeCount(parsed.stars), rounds:safeCount(parsed.rounds), correct:safeCount(parsed.correct), answered:safeCount(parsed.answered), ops, byLevel, trend };
    } catch (_) { return fallback; }
  }
  function saveHistory() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch (_) { /* local storage may be disabled */ }
    renderStats();
  }
  function getPercent(data) { return data && data.answered ? Math.round(data.correct / data.answered * 100) : null; }
  function formatAverageTime(data) {
    if (!data || !data.timeCount) return 'Ø Zeit: noch keine Zeitdaten';
    const seconds = Math.max(0, Math.round(data.timeTotalMs / data.timeCount / 1000));
    if (seconds < 60) return `Ø Zeit: ${seconds} s pro Aufgabe`;
    return `Ø Zeit: ${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s pro Aufgabe`;
  }
  function startQuestionTimer() {
    questionElapsedMs = 0;
    questionTimerStartedAt = Date.now();
    questionTimerPaused = false;
  }
  function getQuestionDurationMs() {
    const activeTail = (!questionTimerPaused && questionTimerStartedAt) ? Date.now() - questionTimerStartedAt : 0;
    // Ignore exceptionally long pauses so one unattended question does not skew the average.
    return Math.min(5 * 60 * 1000, Math.max(0, questionElapsedMs + activeTail));
  }
  function recordQuestionTime(stats, durationMs) {
    stats.timeTotalMs = safeCount(stats.timeTotalMs) + Math.round(durationMs);
    stats.timeCount = safeCount(stats.timeCount) + 1;
  }
  document.addEventListener('visibilitychange', () => {
    if (answered) return;
    if (document.hidden && !questionTimerPaused && questionTimerStartedAt) {
      questionElapsedMs += Date.now() - questionTimerStartedAt;
      questionTimerStartedAt = 0;
      questionTimerPaused = true;
    } else if (!document.hidden && questionTimerPaused) {
      questionTimerStartedAt = Date.now();
      questionTimerPaused = false;
    }
  });
  function renderStats() {
    $('#totalStars').textContent = history.stars;
    $('#progressStars').textContent = history.stars;
    $('#roundsDone').textContent = history.rounds;
    $('#totalAnswered').textContent = history.answered;
    $('#accuracy').textContent = history.answered ? Math.round(history.correct / history.answered * 100) + '%' : '–';
    $('#operationStats').innerHTML = Object.entries(OPERATION_INFO).map(([kind, info]) => {
      const data = history.ops[kind] || {correct:0,answered:0};
      const percent = getPercent(data) ?? 0;
      const result = data.answered ? `${data.correct} von ${data.answered} richtig · ${percent}%` : 'Noch keine Aufgaben geübt';
      return `<div class="operation-stat"><div class="operation-name"><span aria-hidden="true">${info.symbol}</span><span>${info.label}</span></div><div class="operation-detail">${result}</div><div class="operation-detail">${formatAverageTime(data)}</div><div class="operation-track" role="progressbar" aria-label="Trefferquote bei ${info.label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><div class="operation-fill" style="width:${percent}%"></div></div></div>`;
    }).join('');
    renderDifficultyStats();
    renderLearningSuggestions();
    renderAdaptiveNote();
    renderTrendStats();
  }
  function formatTimeValue(durationMs) {
    if (!Number.isFinite(durationMs)) return '–';
    const seconds = Math.max(0, Math.round(durationMs / 1000));
    if (seconds < 60) return `${seconds} s`;
    return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
  }
  function formatTrendDate(dateString, withTime = false) {
    const date = new Date(dateString);
    if (!Number.isFinite(date.getTime())) return '–';
    return new Intl.DateTimeFormat('de-DE', withTime ? {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'} : {day:'2-digit',month:'2-digit',year:'2-digit'}).format(date);
  }
  function getTrendRows() {
    const chosenLevel = $('#trendLevelFilter').value;
    const chosenOperation = $('#trendOperationFilter').value;
    return (history.trend || []).filter(sample => chosenLevel === 'all' || sample.level === chosenLevel).map(sample => {
      let correct = sample.correct, answeredCount = sample.answered, timeTotalMs = sample.timeTotalMs, timeCount = sample.timeCount;
      if (chosenOperation !== 'all') {
        const op = sample.ops && sample.ops[chosenOperation];
        if (!op || !op.answered) return null;
        correct = op.correct; answeredCount = op.answered; timeTotalMs = op.timeTotalMs; timeCount = op.timeCount;
      }
      if (!answeredCount) return null;
      return {...sample, metricCorrect:correct, metricAnswered:answeredCount, accuracy:correct / answeredCount * 100, avgTimeMs:timeCount ? timeTotalMs / timeCount : null};
    }).filter(Boolean).sort((a,b) => Date.parse(a.date) - Date.parse(b.date));
  }
  function makeTrendSvg(rows, metric) {
    const visible = rows.slice(-10);
    if (!visible.length) return '<div class="trend-empty">Nach deiner ersten passenden, abgeschlossenen Runde erscheinen hier die Messwerte.</div>';
    const isAccuracy = metric === 'accuracy';
    const rawValues = visible.map(row => isAccuracy ? row.accuracy : row.avgTimeMs == null ? 0 : row.avgTimeMs / 1000);
    const maxValue = isAccuracy ? 100 : Math.max(10, Math.ceil(Math.max(...rawValues, 1) / 5) * 5);
    const W = 520, H = 190, L = 42, R = 15, T = 14, B = 34;
    const chartW = W - L - R, chartH = H - T - B;
    const x = i => visible.length === 1 ? L + chartW/2 : L + i * chartW/(visible.length-1);
    const y = val => T + chartH - Math.min(maxValue, Math.max(0,val))/maxValue*chartH;
    const ticks = [0, .25, .5, .75, 1];
    const grid = ticks.map(t => {
      const val = maxValue * t, yy = y(val);
      const label = isAccuracy ? `${Math.round(val)}%` : `${Math.round(val)}s`;
      return `<line class="grid-line" x1="${L}" y1="${yy.toFixed(1)}" x2="${W-R}" y2="${yy.toFixed(1)}"></line><text class="axis-label" x="${L-7}" y="${(yy+4).toFixed(1)}" text-anchor="end">${label}</text>`;
    }).join('');
    const points = visible.map((row,i) => `${x(i).toFixed(1)},${y(rawValues[i]).toFixed(1)}`).join(' ');
    const dots = visible.map((row,i) => `<circle class="trend-dot" cx="${x(i).toFixed(1)}" cy="${y(rawValues[i]).toFixed(1)}" r="4"><title>${formatTrendDate(row.date,true)} · ${isAccuracy ? `${Math.round(row.accuracy)}% Trefferquote` : `${formatTimeValue(row.avgTimeMs)} pro Aufgabe`}</title></circle>`).join('');
    const xlabels = visible.map((row,i) => `<text class="axis-label" x="${x(i).toFixed(1)}" y="${H-10}" text-anchor="middle">${i+1}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${isAccuracy ? 'Trefferquote' : 'Durchschnittliche Zeit pro Aufgabe'} über die letzten ${visible.length} passenden Runden"><title>${isAccuracy ? 'Trefferquote über Zeit' : 'Aufgabenzeit über Zeit'}</title>${grid}<polyline class="trend-line" points="${points}"></polyline>${dots}${xlabels}<text class="axis-label" x="${W-R}" y="${H-1}" text-anchor="end">neueste →</text></svg>`;
  }
  function renderTrendStats() {
    const rows = getTrendRows();
    const accEl = $('#accuracyTrendChart'), speedEl = $('#speedTrendChart');
    const summary = $('#trendSummary');
    const table = $('#trendHistory');
    if (!rows.length) {
      accEl.innerHTML = '<div class="trend-empty">Noch keine passenden Daten.</div>';
      speedEl.innerHTML = '<div class="trend-empty">Noch keine passenden Zeitdaten.</div>';
      const hasTrend = (history.trend || []).length > 0;
      summary.textContent = hasTrend ? 'Für diese Filter gibt es noch keine passenden Runden. Wähle eine andere Rechenart oder Schwierigkeitsstufe.' : 'Schließe deine erste Runde ab, um die Entwicklung über mehrere Runden zu verfolgen. Frühere Statistiken bleiben erhalten; der Verlauf beginnt ab dieser Version.';
      table.innerHTML = '';
      return;
    }
    accEl.innerHTML = makeTrendSvg(rows, 'accuracy');
    speedEl.innerHTML = makeTrendSvg(rows, 'speed');
    const visible = rows.slice(-10);
    const first = visible[0], last = visible[visible.length-1];
    if (visible.length < 2) {
      summary.textContent = `Bisher gibt es ${visible.length} passende Runde. Nach der nächsten Runde kannst du sehen, wie sich Trefferquote und Tempo verändert haben.`;
    } else {
      const accDelta = last.accuracy - first.accuracy;
      const secDelta = (last.avgTimeMs - first.avgTimeMs) / 1000;
      const accText = `${accDelta > 0 ? '+' : ''}${Math.round(accDelta)} Prozentpunkte Trefferquote`;
      const speedText = Math.abs(secDelta) < 0.5 ? 'Aufgabenzeit etwa gleich' : `${Math.abs(secDelta).toFixed(1).replace('.', ',')} s ${secDelta < 0 ? 'schneller' : 'langsamer'} pro Aufgabe`;
      summary.textContent = `Vergleich der ältesten und neuesten der ${visible.length} angezeigten Runden: ${accText}; ${speedText}. Das ist ein Hinweis auf die Entwicklung – unterschiedliche Schwierigkeitsgrade können den Zeitvergleich beeinflussen.`;
    }
    const rowsDesc = [...visible].reverse();
    const modeNames = {gemischt:'Gemischt',plus:'Plus',minus:'Minus',mal:'Mal',geteilt:'Geteilt'};
    const levelNames = {leicht:'Locker',mittel:'Knobeln',schwer:'Profi'};
    const opName = $('#trendOperationFilter').value === 'all' ? 'Alle Rechenarten' : OPERATION_INFO[$('#trendOperationFilter').value].label;
    table.innerHTML = `<div class="trend-table-wrap"><table class="trend-table"><thead><tr><th colspan="4">Letzte ${rowsDesc.length} passende Runden · ${opName}</th></tr><tr><th>Datum</th><th>Übung</th><th>Trefferquote</th><th>Ø Zeit/Aufgabe</th></tr></thead><tbody>${rowsDesc.map(row => `<tr><td>${formatTrendDate(row.date,true)}</td><td>${modeNames[row.mode] || 'Gemischt'} · ${levelNames[row.level] || 'Knobeln'}</td><td class="numeric">${row.metricCorrect}/${row.metricAnswered} (${Math.round(row.accuracy)}%)</td><td class="numeric">${formatTimeValue(row.avgTimeMs)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderDifficultyStats() {
    const labels = {leicht:'Locker', mittel:'Knobeln', schwer:'Profi'};
    const descriptions = {leicht:'Kleine Zahlen und Grundlagen', mittel:'Größere Zahlen und sichere Rechenwege', schwer:'Große Zahlen und anspruchsvollere Aufgaben'};
    $('#difficultyStats').innerHTML = Object.keys(LEVELS).map(levelKey => {
      const data = history.byLevel[levelKey] || {correct:0,answered:0,ops:emptyOperationStats()};
      const percent = getPercent(data);
      const cards = Object.entries(OPERATION_INFO).map(([kind, info]) => {
        const op = data.ops[kind] || {correct:0,answered:0};
        const opPercent = getPercent(op);
        const score = opPercent === null ? 'Noch keine Daten' : `${op.correct} / ${op.answered} richtig`;
        const accuracy = opPercent === null ? 'Noch nicht geübt' : `Trefferquote ${opPercent}%`;
        return `<div class="difficulty-op"><div class="difficulty-op-title"><span aria-hidden="true">${info.symbol}</span><span>${info.label}</span></div><div class="difficulty-op-score">${score}</div><div class="difficulty-op-note">${accuracy}</div><div class="difficulty-op-note">${formatAverageTime(op)}</div><div class="operation-track" role="progressbar" aria-label="Trefferquote ${info.label}, ${labels[levelKey]}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${opPercent ?? 0}"><div class="operation-fill" style="width:${opPercent ?? 0}%"></div></div></div>`;
      }).join('');
      const summary = data.answered ? `${data.answered} Aufgaben · ${percent}% richtig` : 'Noch keine Aufgaben auf dieser Stufe';
      return `<section class="difficulty-group"><div class="difficulty-group-head"><div><h4 class="difficulty-title">${labels[levelKey]}</h4><p class="difficulty-subtitle">${descriptions[levelKey]}</p></div><span class="difficulty-total">${summary}</span></div><div class="difficulty-op-grid">${cards}</div></section>`;
    }).join('');
  }
  function getRecommendationCandidates() {
    const candidates = [];
    for (const levelKey of Object.keys(LEVELS)) {
      const levelData = history.byLevel[levelKey];
      for (const kind of Object.keys(OPERATION_INFO)) {
        const data = levelData.ops[kind];
        if (data.answered >= 3) candidates.push({levelKey, kind, data, percent:Math.round(data.correct / data.answered * 100)});
      }
    }
    return candidates.sort((a,b) => a.percent - b.percent || b.data.answered - a.data.answered);
  }
  function renderLearningSuggestions() {
    const candidates = getRecommendationCandidates();
    const weak = candidates.filter(item => item.percent < 80).slice(0, 2);
    const parent = $('#learningSuggestions');
    if (weak.length) {
      parent.innerHTML = `<div class="suggestion-list">${weak.map(item => {
        const levelLabel = ({leicht:'Locker',mittel:'Knobeln',schwer:'Profi'})[item.levelKey];
        const op = OPERATION_INFO[item.kind];
        return `<article class="suggestion-card"><h4>${op.symbol} ${op.label} · ${levelLabel}</h4><p>Hier sind ${item.percent}% der Aufgaben auf dieser Kombination richtig (${item.data.correct} von ${item.data.answered}). Ein paar gezielte Aufgaben können mehr Sicherheit geben.</p><button type="button" class="suggestion-action" data-practice-op="${item.kind}" data-practice-level="${item.levelKey}">Diese Übung starten →</button></article>`;
      }).join('')}</div>`;
      return;
    }
    if (!candidates.length) {
      const hasLegacyData = history.answered > 0 && Object.values(history.byLevel).every(item => item.answered === 0);
      parent.innerHTML = hasLegacyData
        ? '<p class="suggestions-intro" style="margin-top:11px">Dein bisheriger Gesamtfortschritt bleibt erhalten. Die genaue Aufteilung nach Schwierigkeitsgrad wird ab dieser Version erfasst; nach ein paar neuen Aufgaben erscheinen hier persönliche Übungsvorschläge.</p>'
        : '<p class="suggestions-intro" style="margin-top:11px">Sammle erst ein paar Aufgaben auf den verschiedenen Stufen. Danach schlägt Mathe-Quest gezielt vor, was sich zum Üben lohnt. Im Mischmodus werden alle Rechenarten zunächst ausgewogen berücksichtigt.</p>';
      return;
    }
    const leastPracticed = [...candidates].sort((a,b) => a.data.answered - b.data.answered || a.percent - b.percent)[0];
    const levelLabel = ({leicht:'Locker',mittel:'Knobeln',schwer:'Profi'})[leastPracticed.levelKey];
    const op = OPERATION_INFO[leastPracticed.kind];
    parent.innerHTML = `<article class="suggestion-card" style="margin-top:12px"><h4>🌟 Weiter festigen: ${op.label} · ${levelLabel}</h4><p>Die bisher geübten Kombinationen sehen gut aus. Für regelmäßiges Training lohnt es sich, auch ${op.label} auf der Stufe „${levelLabel}“ weiter zu üben (${leastPracticed.data.answered} Aufgaben bisher).</p><button type="button" class="suggestion-action" data-practice-op="${leastPracticed.kind}" data-practice-level="${leastPracticed.levelKey}">Diese Übung starten →</button></article>`;
  }
  function renderAdaptiveNote() {
    const levelData = history.byLevel[level];
    const kinds = selectedMixedOperations;
    const levelLabel = ({leicht:'Locker',mittel:'Knobeln',schwer:'Profi'})[level];
    if (kinds.length === 1) {
      $('#adaptiveNote').textContent = `🎯 Diese Runde übt nur ${OPERATION_INFO[kinds[0]].label} auf „${levelLabel}“. Wähle weitere Kacheln aus, um Rechenarten zu mischen. Bei mehreren Rechenarten kommen solche mit niedrigerer Trefferquote häufiger dran.`;
      return;
    }
    const candidates = kinds.map(kind => {
      const data = levelData.ops[kind];
      return {kind, answered:data.answered, percent:getPercent(data)};
    }).filter(item => item.answered >= 3).sort((a,b) => (a.percent ?? 100) - (b.percent ?? 100));
    if (!candidates.length) {
      const names = kinds.map(kind => OPERATION_INFO[kind].label).join(', ');
      $('#adaptiveNote').textContent = `🎯 Auf „${levelLabel}“ sind ${names} ausgewählt. Zu Beginn werden sie gleichmäßig berücksichtigt. Sobald mindestens 3 Antworten je Rechenart vorliegen, werden Rechenarten mit niedrigerer Trefferquote häufiger ausgewählt.`;
    } else {
      const needingPractice = candidates.filter(item => item.percent < 85);
      if (needingPractice.length) {
        const names = needingPractice.slice(0,2).map(item => OPERATION_INFO[item.kind].label).join(' und ');
        $('#adaptiveNote').textContent = `🎯 Auf „${levelLabel}“ kommen ${names} häufiger vor, weil die Trefferquote dort niedriger ist. Die Gewichtung gilt nur für die ausgewählten Rechenarten.`;
      } else {
        $('#adaptiveNote').textContent = `🎯 Deine Trefferquote auf „${levelLabel}“ sieht gut aus. Die ausgewählten Rechenarten werden weiterhin passend zu deinen Ergebnissen gewichtet.`;
      }
    }
  }
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(items) { return items[rand(0, items.length - 1)]; }

  function pickMixedOperation() {
    // Nur ausgewählte Rechenarten berücksichtigen; gewichtet wird nach Trefferquote dieser Stufe.
    const kinds = selectedMixedOperations.length ? selectedMixedOperations : Object.keys(OPERATION_INFO);
    const weights = kinds.map(kind => {
      const data = history.byLevel[level].ops[kind];
      if (data.answered < 3) return 1.25;
      const accuracy = data.correct / data.answered;
      if (accuracy < 0.55) return 3.2;
      if (accuracy < 0.70) return 2.5;
      if (accuracy < 0.80) return 1.8;
      if (accuracy < 0.90) return 1.15;
      return 0.75;
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < kinds.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return kinds[i];
    }
    return kinds[kinds.length - 1];
  }

  function generateQuestion() {
    const cfg = LEVELS[level];
    const kind = mode === 'gemischt' ? pickMixedOperation() : mode;
    let a, b, answer, symbol, hint, prompt;
    if (kind === 'plus') {
      const cap = cfg.max;
      a = rand(0, cap); b = rand(0, cap);
      if (level === 'leicht') { a = rand(1,20); b = rand(1,20); }
      answer = a + b; symbol = '+';
      hint = `Zerlege eine Zahl in Zehner und Einer. Rechne ${a} und ${b} in kleinen Schritten zusammen.`;
      prompt = 'Addiere die beiden Zahlen.';
    } else if (kind === 'minus') {
      const cap = level === 'leicht' ? 20 : cfg.max;
      a = rand(1, cap); b = rand(0, cap);
      if (b > a) [a,b] = [b,a];
      answer = a - b; symbol = '−';
      hint = `Starte bei ${b} und zähle bis ${a} weiter – oder ziehe Zehner und Einer nacheinander ab.`;
      prompt = 'Wie viel bleibt übrig?';
    } else if (kind === 'mal') {
      a = rand(2, cfg.factorA); b = rand(2, cfg.factorB);
      if (level === 'leicht') { a = rand(1,10); b = rand(1,10); }
      answer = a * b; symbol = '×';
      hint = `${a} × ${b} bedeutet: ${a} ${a === 1 ? 'einmal' : 'mal'} ${b}. Du kannst auch in gleich großen Gruppen zählen.`;
      prompt = 'Finde das Produkt.';
    } else {
      b = rand(2, level === 'leicht' ? 10 : cfg.factorB);
      const quotient = rand(2, level === 'leicht' ? 10 : (level === 'mittel' ? 30 : 50));
      a = b * quotient; answer = quotient; symbol = '÷';
      hint = `Frage dich: ${b} mal welche Zahl ergibt ${a}? Die Umkehraufgabe hilft dir.`;
      prompt = 'Teile gerecht auf – ohne Rest.';
    }
    return { kind, a, b, answer, symbol, hint, prompt };
  }
  function renderQuestion() {
    question = generateQuestion(); answered = false; hintUsed = false;
    $('#questionKicker').textContent = `Aufgabe ${index + 1} von 10 · ${MODE_LABELS[mode]}`;
    $('#equation').innerHTML = `<span>${question.a}</span><span class="operator">${question.symbol}</span><span>${question.b}</span><span class="operator">=</span><span>?</span>`;
    $('#equation').setAttribute('aria-label', `${question.a} ${question.symbol} ${question.b} ist gleich wie viel?`);
    $('#answer').value = ''; $('#answer').disabled = false; $('#checkBtn').disabled = false;
    $('#checkBtn').textContent = 'Antwort prüfen ✓';
    $('#hintBtn').disabled = false;
    setFeedback('Du schaffst das! Denk in Ruhe nach. 🌟', '');
    updateProgress();
    $('#activeQuestion').hidden = false; $('#resultView').hidden = true;
    startQuestionTimer();
    $('#answer').focus({ preventScroll: true });
  }
  function setFeedback(message, type) {
    const el = $('#feedback'); el.textContent = message; el.className = 'feedback' + (type ? ' ' + type : '');
  }
  function updateProgress() {
    const done = roundAnswered;
    $('#progressFill').style.width = `${done / 10 * 100}%`;
    $('#progressBar').setAttribute('aria-valuenow', done);
    $('#streak').textContent = streak;
  }
  function celebrate() {
    const symbols = ['⭐','✨','🌟','💫'];
    for (let i=0; i<7; i++) {
      const el = document.createElement('span'); el.className = 'confetti'; el.textContent = pick(symbols);
      el.style.left = `${35 + Math.random()*30}%`; el.style.top = `${45 + Math.random()*20}%`;
      document.body.appendChild(el); window.setTimeout(() => el.remove(), 1200);
    }
  }
  function checkAnswer(event) {
    event.preventDefault();
    if (answered) { nextQuestion(); return; }
    const raw = $('#answer').value.trim();
    if (raw === '') { setFeedback('Trage erst eine Antwort ein – du packst das! 😊', 'try'); $('#answer').focus(); return; }
    const value = Number(raw);
    if (!Number.isFinite(value) || !Number.isInteger(value)) { setFeedback('Bitte gib eine ganze Zahl ein.', 'try'); return; }
    const durationMs = getQuestionDurationMs();
    answered = true; roundAnswered++; history.answered++;
    roundTimeTotalMs += durationMs; roundTimeCount++;
    const roundOpStats = roundOperationStats[question.kind];
    roundOpStats.answered++;
    recordQuestionTime(roundOpStats, durationMs);
    if (!history.ops[question.kind]) history.ops[question.kind] = {correct:0,answered:0,timeTotalMs:0,timeCount:0};
    history.ops[question.kind].answered++;
    recordQuestionTime(history.ops[question.kind], durationMs);
    const levelStats = history.byLevel[level];
    levelStats.answered++;
    levelStats.ops[question.kind].answered++;
    recordQuestionTime(levelStats.ops[question.kind], durationMs);
    questionTimerStartedAt = 0;
    questionTimerPaused = true;
    $('#answer').disabled = true; $('#hintBtn').disabled = true;
    if (value === question.answer) {
      roundCorrect++; totalCorrectThisSession++; streak++; history.correct++; history.ops[question.kind].correct++;
      roundOpStats.correct++;
      levelStats.correct++; levelStats.ops[question.kind].correct++;
      const reward = hintUsed ? 1 : (streak > 0 && streak % 3 === 0 ? 3 : 2);
      history.stars += reward;
      setFeedback(pick(['Richtig! Du bist auf Sternenkurs! ⭐','Yes! Super gerechnet! 🚀','Volltreffer! Dein Mathe-Level steigt! 🎉','Klasse! Dein Fuchs jubelt mit dir! 🦊']) + ` +${reward} ${reward === 1 ? 'Stern' : 'Sterne'}!`, 'good');
      $('#equation').lastElementChild.textContent = String(question.answer);
      celebrate();
    } else {
      streak = 0;
      setFeedback(`Knapp daneben! Die richtige Antwort ist ${question.answer}. Schau dir den Rechenweg an und probiere die nächste Aufgabe. 💜`, 'try');
      $('#equation').lastElementChild.textContent = String(question.answer);
    }
    saveHistory(); updateProgress();
    $('#checkBtn').textContent = roundAnswered >= 10 ? 'Ergebnis ansehen →' : 'Nächste Aufgabe →';
    $('#checkBtn').focus({ preventScroll: true });
    if (roundAnswered >= 10) $('#hintBtn').disabled = true;
  }
  function nextQuestion() {
    if (!answered) return;
    if (roundAnswered >= 10) { showResults(); return; }
    index++; renderQuestion();
  }
  function showResults() {
    const sample = {
      date:new Date().toISOString(), mode, level,
      correct:roundCorrect, answered:roundAnswered,
      timeTotalMs:Math.round(roundTimeTotalMs), timeCount:roundTimeCount,
      ops:Object.fromEntries(Object.entries(roundOperationStats).map(([kind,data]) => [kind, {...data}]))
    };
    history.trend = [...(history.trend || []), sample].slice(-50);
    history.rounds++; saveHistory();
    $('#startView').hidden = true; $('#activeQuestion').hidden = true; $('#resultView').hidden = false;
    const percent = Math.round(roundCorrect / 10 * 100);
    const face = percent === 100 ? '🏆' : percent >= 70 ? '🥳' : percent >= 40 ? '🌟' : '🦊';
    const title = percent === 100 ? 'Sensationell!' : percent >= 70 ? 'Richtig stark!' : percent >= 40 ? 'Gut gemacht!' : 'Weiter üben lohnt sich!';
    const message = percent === 100 ? 'Alle Aufgaben richtig – du bist ein echter Mathe-Champion!' : percent >= 70 ? 'Du hast schon richtig viel drauf. Mit jeder Runde wirst du sicherer.' : 'Jede Aufgabe hilft deinem Gehirn beim Trainieren. Eine weitere Runde macht dich noch stärker.';
    $('#resultView').innerHTML = `<div class="result-big" aria-hidden="true">${face}</div><h3>${title}</h3><p>${message}</p><div class="result-summary"><div class="result-pill">✅ ${roundCorrect} von 10 richtig</div><div class="result-pill">⭐ ${history.stars} Sterne gesammelt</div></div><div class="actions"><button class="primary" id="againBtn" type="button">Noch eine Runde ↻</button><button class="secondary" id="reviewBtn" type="button">Diese Runde nochmal</button></div>`;
    $('#againBtn').addEventListener('click', startRound);
    $('#reviewBtn').addEventListener('click', startRound);
  }
  function updateModeButtons() {
    const operationSubtitles = {plus:'Zusammenzählen', minus:'Unterschied finden', mal:'Malnehmen', geteilt:'Fair aufteilen – ohne Rest'};
    $$('#modeGrid .mode').forEach(btn => {
      const kind = btn.dataset.mode;
      const isIncluded = selectedMixedOperations.includes(kind);
      btn.setAttribute('aria-pressed', String(isIncluded));
      btn.classList.toggle('operation-included', isIncluded);
      btn.querySelector('.sub').textContent = isIncluded ? operationSubtitles[kind] : 'Nicht ausgewählt';
    });
    const selectionNames = selectedMixedOperations.map(kind => OPERATION_INFO[kind].label).join(' + ');
    $('#modeSelectionNote').textContent = selectedMixedOperations.length === 4
      ? 'Alle vier Rechenarten sind ausgewählt. Tippe eine Kachel an, um sie abzuwählen; tippe erneut, um sie wieder auszuwählen.'
      : selectedMixedOperations.length === 1
        ? `Nur ${selectionNames} ist ausgewählt. Tippe weitere Kacheln an, um Rechenarten zu mischen.`
        : `Ausgewählt: ${selectionNames}. Tippe Kacheln an, um die Mischung anzupassen. Mindestens eine Rechenart bleibt aktiv.`;
    const modeName = selectedMixedOperations.length === 1
      ? `🎯 ${selectionNames}`
      : `🎲 Gemischt · ${selectionNames}`;
    const levelName = ({leicht:'Locker',mittel:'Knobeln',schwer:'Profi'})[level];
    $('#roundPreview').textContent = `${modeName} · ${levelName} · 10 Aufgaben`;
  }

  // Prepare a round without showing a task or starting the timer.
  function startRound() {
    index = 0; roundCorrect = 0; roundAnswered = 0; streak = 0; totalCorrectThisSession = 0;
    roundTimeTotalMs = 0; roundTimeCount = 0; roundOperationStats = emptyOperationStats();
    answered = false; question = null; questionElapsedMs = 0; questionTimerStartedAt = 0; questionTimerPaused = false;
    updateModeButtons();
    $('#startView').hidden = false; $('#activeQuestion').hidden = true; $('#resultView').hidden = true;
    $('#progressFill').style.width = '0%'; $('#progressBar').setAttribute('aria-valuenow', '0');
    $('#streak').textContent = '0';
    renderAdaptiveNote();
  }
  function beginRound() {
    $('#startView').hidden = true;
    index = 0; roundCorrect = 0; roundAnswered = 0; streak = 0; totalCorrectThisSession = 0;
    roundTimeTotalMs = 0; roundTimeCount = 0; roundOperationStats = emptyOperationStats();
    renderQuestion();
  }
  function showHint() {
    if (answered || hintUsed) return;
    hintUsed = true;
    setFeedback('💡 ' + question.hint, 'hint');
  }
  $$('#modeGrid .mode').forEach(btn => btn.addEventListener('click', () => {
    const chosenKind = btn.dataset.mode;
    if (selectedMixedOperations.includes(chosenKind)) {
      if (selectedMixedOperations.length === 1) {
        $('#modeSelectionNote').textContent = 'Mindestens eine Rechenart muss ausgewählt bleiben. Tippe zuerst eine andere Rechenart an.';
        return;
      }
      selectedMixedOperations = selectedMixedOperations.filter(kind => kind !== chosenKind);
    } else {
      selectedMixedOperations = [...selectedMixedOperations, chosenKind];
    }
    syncModeFromSelection();
    startRound();
  }));
  $$('#difficulty .level').forEach(btn => btn.addEventListener('click', () => {
    level = btn.dataset.level; $$('#difficulty .level').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    $('#levelNote').textContent = LEVELS[level].note; startRound();
  }));
  function setActiveTab(tabName) {
    const isProgress = tabName === 'progress';
    $('#practiceView').hidden = isProgress;
    $('#progressView').hidden = !isProgress;
    $('#practiceTab').setAttribute('aria-selected', String(!isProgress));
    $('#progressTab').setAttribute('aria-selected', String(isProgress));
    if (isProgress) renderStats();
  }
  $$('.app-tab').forEach(button => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));
  $('#trendLevelFilter').addEventListener('change', renderTrendStats);
  $('#trendOperationFilter').addEventListener('change', renderTrendStats);
  $('#resetProgressBtn').addEventListener('click', () => {
    const confirmed = window.confirm('Möchtest du wirklich den gesamten Lernfortschritt, alle Sterne und Empfehlungen zurücksetzen? Das kann nicht rückgängig gemacht werden.');
    if (!confirmed) return;
    history = createEmptyHistory();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch (_) { /* local storage may be disabled */ }
    renderStats();
    startRound();
  });
  $('#learningSuggestions').addEventListener('click', event => {
    const button = event.target.closest('button[data-practice-op][data-practice-level]');
    if (!button) return;
    selectedMixedOperations = [button.dataset.practiceOp];
    syncModeFromSelection();
    level = button.dataset.practiceLevel;
    $$('#difficulty .level').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === level)));
    $('#levelNote').textContent = LEVELS[level].note;
    setActiveTab('practice');
    startRound();
    window.scrollTo({top:0,behavior:'smooth'});
  });
  $('#startRoundBtn').addEventListener('click', beginRound);
  $('#answerForm').addEventListener('submit', checkAnswer);
  $('#hintBtn').addEventListener('click', showHint);
  renderStats(); startRound();

  // Offline use is available after the site has been opened once over HTTPS.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(() => { $('#offlineStatus').textContent = 'Offline bereit: Öffne Mathe-Quest nach dem ersten Laden auch ohne Internet. Der Lernstand bleibt lokal auf diesem Gerät.'; })
        .catch(() => { $('#offlineStatus').textContent = 'Dein Lernstand bleibt in diesem Browser auf diesem Gerät. Für Offline-Nutzung bitte die App über eine HTTPS-Webadresse öffnen.'; });
    });
  } else {
    $('#offlineStatus').textContent = 'Dein Lernstand bleibt in diesem Browser auf diesem Gerät. Für Offline-Nutzung und Home-Bildschirm-Installation muss die App über eine HTTPS-Webadresse geöffnet werden.';
  }
})();
