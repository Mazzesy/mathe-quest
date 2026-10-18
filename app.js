(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const STORAGE_KEY = 'matheQuestProgress_v1';
  const SETTINGS_KEY = 'matheQuestSettings_v1';
  // Keep a long but bounded per-round history to protect browser storage.
  const TREND_HISTORY_LIMIT = 1500;
  const TREND_PAGE_SIZE = 10;
  let trendRowsShown = TREND_PAGE_SIZE;
  const OPERATION_INFO = { plus:{label:'Plus',symbol:'➕'}, minus:{label:'Minus',symbol:'➖'}, mal:{label:'Mal',symbol:'✖️'}, geteilt:{label:'Geteilt',symbol:'➗'} };
  const MODE_LABELS = { gemischt:'Gemischte Runde', plus:'Plus-Runde', minus:'Minus-Runde', mal:'Mal-Runde', geteilt:'Geteilt-Runde' };
  const LEVELS = {
    leicht: { max: 30, factorA: 10, factorB: 10, note: 'Kleine Zahlen zum Warmwerden und Einmaleins bis 10.' },
    mittel: { max: 1000, factorA: 15, factorB: 15, note: 'Bis 1.000 rechnen und größere Einmaleins-Aufgaben.' },
    schwer: { max: 10000, factorA: 30, factorB: 25, note: 'Große Zahlen und anspruchsvolle Multiplikationen.' }
  };
  let settings = loadSettings();
  let mode = 'gemischt';
  let level = 'mittel';
  let roundLength = settings.roundLength;
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
  let currentIsReview = false;
  let reviewQueue = [];
  let roundReviewAttempts = 0;
  let roundReviewCorrect = 0;
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
    return { stars:0, rounds:0, correct:0, answered:0, reviewAttempts:0, reviewCorrect:0, ops:emptyOperationStats(), byLevel:emptyLevelStats(), trend:[], dailyLog:[] };
  }
  function loadSettings() {
    const defaults = { roundLength:10, dailyGoal:10, transitionMode:'mixed', allowRemainder:false, allowNegatives:false, allowDecimals:false, allowParentheses:false, darkMode:false };
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        ...defaults,
        roundLength:[5,10,20].includes(Number(saved.roundLength)) ? Number(saved.roundLength) : defaults.roundLength,
        dailyGoal:[5,10,15,20,30].includes(Number(saved.dailyGoal)) ? Number(saved.dailyGoal) : defaults.dailyGoal,
        transitionMode:['mixed','with','without'].includes(saved.transitionMode) ? saved.transitionMode : defaults.transitionMode,
        allowRemainder:saved.allowRemainder === true,
        allowNegatives:saved.allowNegatives === true,
        allowDecimals:saved.allowDecimals === true,
        allowParentheses:saved.allowParentheses === true,
        darkMode:saved.darkMode === true
      };
    } catch (_) { return defaults; }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) { /* lokaler Speicher kann deaktiviert sein */ }
    applyAppearance();
    updateModeButtons();
    renderDailyGoal();
  }
  function applyAppearance() {
    document.body.classList.toggle('dark-mode', settings.darkMode);
    const button = $('#darkModeBtn');
    if (button) {
      button.textContent = settings.darkMode ? '☀️' : '🌙';
      button.setAttribute('aria-pressed', String(settings.darkMode));
      button.setAttribute('aria-label', settings.darkMode ? 'Helles Farbschema aktivieren' : 'Dunkles Farbschema aktivieren');
      button.title = settings.darkMode ? 'Helles Farbschema' : 'Dunkles Farbschema';
    }
  }
  function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function recordDailyProgress(isCorrect, durationMs) {
    const today = localDateKey();
    if (!Array.isArray(history.dailyLog)) history.dailyLog = [];
    let entry = history.dailyLog.find(day => day.date === today);
    if (!entry) { entry = {date:today, answered:0, correct:0, timeTotalMs:0, timeCount:0}; history.dailyLog.push(entry); }
    entry.answered++;
    if (isCorrect) entry.correct++;
    entry.timeTotalMs += Math.round(durationMs);
    entry.timeCount++;
    history.dailyLog = history.dailyLog.filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date)).sort((a,b) => a.date.localeCompare(b.date)).slice(-365);
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
      const trend = Array.isArray(parsed.trend) ? parsed.trend.filter(item => item && typeof item.date === 'string' && Number.isFinite(Date.parse(item.date))).slice(-TREND_HISTORY_LIMIT).map(item => {
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
          timeTotalMs:safeCount(item.timeTotalMs), timeCount:safeCount(item.timeCount), reviewAttempts:safeCount(item.reviewAttempts), reviewCorrect:safeCount(item.reviewCorrect), ops:sampleOps
        };
      }) : [];
      const dailyLog = Array.isArray(parsed.dailyLog) ? parsed.dailyLog.filter(day => day && /^\d{4}-\d{2}-\d{2}$/.test(day.date)).slice(-365).map(day => ({date:day.date, answered:safeCount(day.answered), correct:safeCount(day.correct), timeTotalMs:safeCount(day.timeTotalMs), timeCount:safeCount(day.timeCount)})) : [];
      return { stars:safeCount(parsed.stars), rounds:safeCount(parsed.rounds), correct:safeCount(parsed.correct), answered:safeCount(parsed.answered), reviewAttempts:safeCount(parsed.reviewAttempts), reviewCorrect:safeCount(parsed.reviewCorrect), ops, byLevel, trend, dailyLog };
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
    renderDailyGoal();
    const reviewPercent = history.reviewAttempts ? Math.round(history.reviewCorrect / history.reviewAttempts * 100) : null;
    $('#reviewSummary').textContent = history.reviewAttempts ? `🔁 Bei Wiederholungen ${history.reviewCorrect} von ${history.reviewAttempts} Aufgaben richtig gelöst (${reviewPercent}%). Diese Übungserfolge werden getrennt von der Trefferquote beim ersten Versuch gezählt.` : '🔁 Falsch beantwortete Aufgaben kommen später noch einmal. Erfolge bei Wiederholungen erscheinen hier getrennt von der Trefferquote beim ersten Versuch.';
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
      return {...sample, metricCorrect:correct, metricAnswered:answeredCount, metricTimeTotalMs:timeTotalMs, metricTimeCount:timeCount, accuracy:correct / answeredCount * 100, avgTimeMs:timeCount ? timeTotalMs / timeCount : null};
    }).filter(Boolean).sort((a,b) => Date.parse(a.date) - Date.parse(b.date));
  }
  function makeTrendSvg(rows, metric) {
    const visible = rows.slice(-TREND_PAGE_SIZE);
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
  function renderWeeklySummary() {
    const target = $('#weeklySummary');
    if (!target) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const currentStart = new Date(today); currentStart.setDate(today.getDate()-6);
    const previousStart = new Date(today); previousStart.setDate(today.getDate()-13);
    const previousEnd = new Date(today); previousEnd.setDate(today.getDate()-7);
    const key = date => localDateKey(date);
    const samples = (history.trend || []).map(sample => ({...sample, dayKey:key(new Date(sample.date))}));
    const current = samples.filter(sample => sample.dayKey >= key(currentStart) && sample.dayKey <= key(today));
    const previous = samples.filter(sample => sample.dayKey >= key(previousStart) && sample.dayKey <= key(previousEnd));
    const sum = rows => rows.reduce((acc,row) => {
      acc.correct += row.correct || 0; acc.answered += row.answered || 0;
      acc.timeTotalMs += row.timeTotalMs || 0; acc.timeCount += row.timeCount || 0; return acc;
    }, {correct:0,answered:0,timeTotalMs:0,timeCount:0});
    const cur = sum(current), prev = sum(previous);
    if (!current.length && !previous.length) {
      target.textContent = '📅 Der Wochenvergleich erscheint, sobald Runden abgeschlossen wurden.';
      return;
    }
    const curAcc = cur.answered ? Math.round(cur.correct / cur.answered * 100) : null;
    const prevAcc = prev.answered ? Math.round(prev.correct / prev.answered * 100) : null;
    const curTime = cur.timeCount ? cur.timeTotalMs / cur.timeCount / 1000 : null;
    const prevTime = prev.timeCount ? prev.timeTotalMs / prev.timeCount / 1000 : null;
    let comparison = 'Für einen Vergleich brauchst du Einträge aus beiden Wochen.';
    if (cur.answered && prev.answered) {
      const accDelta = curAcc - prevAcc;
      const timeDelta = curTime !== null && prevTime !== null ? curTime - prevTime : null;
      const accPhrase = accDelta === 0 ? 'Trefferquote unverändert' : `${Math.abs(accDelta)} Prozentpunkte ${accDelta > 0 ? 'mehr richtige Antworten' : 'weniger richtige Antworten'}`;
      const timePhrase = timeDelta === null ? 'Zeitvergleich noch nicht verfügbar' : Math.abs(timeDelta) < .5 ? 'Tempo etwa gleich' : `${Math.abs(timeDelta).toFixed(1).replace('.',',')} s ${timeDelta < 0 ? 'schneller' : 'langsamer'} pro Aufgabe`;
      comparison = `${accPhrase}; ${timePhrase}. Verglichen werden abgeschlossene Runden, keine bloßen Tagesziele.`;
    }
    target.innerHTML = `<strong>📅 Diese 7 Tage im Vergleich zu den 7 Tagen davor</strong><p>Aktuell: ${cur.answered} Aufgaben${curAcc === null ? '' : ` · ${curAcc}% richtig`}${curTime === null ? '' : ` · Ø ${formatTimeValue(curTime*1000)}`}. Davor: ${prev.answered} Aufgaben${prevAcc === null ? '' : ` · ${prevAcc}% richtig`}${prevTime === null ? '' : ` · Ø ${formatTimeValue(prevTime*1000)}`}.</p><p>${comparison}</p><small>Bei unterschiedlich schwierigen Aufgaben sind Zeitvergleiche nur ein Hinweis, kein Leistungsurteil.</small>`;
  }
  function renderTrendStats() {
    renderWeeklySummary();
    const rows = getTrendRows();
    const accEl = $('#accuracyTrendChart'), speedEl = $('#speedTrendChart');
    const summary = $('#trendSummary');
    const table = $('#trendHistory');
    if (!rows.length) {
      accEl.innerHTML = '<div class="trend-empty">Noch keine passenden Daten.</div>';
      speedEl.innerHTML = '<div class="trend-empty">Noch keine passenden Zeitdaten.</div>';
      const hasTrend = (history.trend || []).length > 0;
      summary.textContent = hasTrend ? 'Für diese Filter gibt es noch keine passenden Runden. Wähle eine andere Rechenart oder Schwierigkeitsstufe.' : 'Schließe deine erste Runde ab, um die Entwicklung über mehrere Runden zu verfolgen. Frühere Gesamtstatistiken bleiben erhalten; der Verlauf beginnt ab dieser Version.';
      table.innerHTML = '';
      return;
    }
    accEl.innerHTML = makeTrendSvg(rows, 'accuracy');
    speedEl.innerHTML = makeTrendSvg(rows, 'speed');
    const chartRows = rows.slice(-TREND_PAGE_SIZE);
    const first = chartRows[0], last = chartRows[chartRows.length-1];
    if (chartRows.length < 2) {
      summary.textContent = `Bisher gibt es ${chartRows.length} passende Runde. Nach der nächsten Runde kannst du sehen, wie sich Trefferquote und Tempo verändert haben.`;
    } else {
      const accDelta = last.accuracy - first.accuracy;
      const secDelta = (last.avgTimeMs - first.avgTimeMs) / 1000;
      const accText = `${accDelta > 0 ? '+' : ''}${Math.round(accDelta)} Prozentpunkte Trefferquote`;
      const speedText = !Number.isFinite(secDelta) ? 'Zeitvergleich noch nicht verfügbar' : Math.abs(secDelta) < 0.5 ? 'Aufgabenzeit etwa gleich' : `${Math.abs(secDelta).toFixed(1).replace('.', ',')} s ${secDelta < 0 ? 'schneller' : 'langsamer'} pro Aufgabe`;
      summary.textContent = `Vergleich der ältesten und neuesten der ${chartRows.length} jüngsten passenden Runden: ${accText}; ${speedText}. Das ist ein Hinweis auf die Entwicklung – unterschiedliche Schwierigkeitsgrade können den Zeitvergleich beeinflussen.`;
    }

    const rowsShown = Math.min(trendRowsShown, rows.length);
    const rowsDesc = [...rows.slice(-rowsShown)].reverse();
    const modeNames = {gemischt:'Gemischt',plus:'Plus',minus:'Minus',mal:'Mal',geteilt:'Geteilt'};
    const levelNames = {leicht:'Locker',mittel:'Knobeln',schwer:'Profi'};
    const opName = $('#trendOperationFilter').value === 'all' ? 'Alle Rechenarten' : OPERATION_INFO[$('#trendOperationFilter').value].label;

    // Sum over ALL filtered history, not just the rows currently shown in the paginated list.
    const totals = rows.reduce((sum, row) => {
      sum.correct += row.metricCorrect;
      sum.answered += row.metricAnswered;
      sum.timeTotalMs += row.metricTimeTotalMs || 0;
      sum.timeCount += row.metricTimeCount || 0;
      return sum;
    }, {correct:0, answered:0, timeTotalMs:0, timeCount:0});
    const totalAccuracy = totals.answered ? Math.round(totals.correct / totals.answered * 100) : 0;
    const totalAverageTime = totals.timeCount ? formatTimeValue(totals.timeTotalMs / totals.timeCount) : '–';
    const moreCount = Math.min(TREND_PAGE_SIZE, rows.length - rowsShown);

    table.innerHTML = `<div class="trend-table-wrap"><table class="trend-table"><thead><tr><th colspan="4">Verlauf: ${rowsShown} von ${rows.length} passenden Runden · ${opName}</th></tr><tr><th>Datum</th><th>Übung</th><th>Trefferquote</th><th>Ø Zeit/Aufgabe</th></tr></thead><tbody>${rowsDesc.map(row => `<tr><td>${formatTrendDate(row.date,true)}</td><td>${modeNames[row.mode] || 'Gemischt'} · ${levelNames[row.level] || 'Knobeln'}</td><td class="numeric">${row.metricCorrect}/${row.metricAnswered} (${Math.round(row.accuracy)}%)</td><td class="numeric">${row.avgTimeMs == null ? '–' : formatTimeValue(row.avgTimeMs)}</td></tr>`).join('')}</tbody></table></div>
      <div class="trend-list-controls"><span class="trend-list-count">${rowsShown} von ${rows.length} passenden Runden angezeigt</span>${moreCount ? `<button type="button" id="loadMoreTrendRows" class="trend-load-more">Mehr laden (${moreCount})</button>` : '<span class="trend-list-end">Alle passenden Runden angezeigt</span>'}</div>
      <section class="trend-aggregate" aria-label="Summe aller passenden Runden"><h4>Summe aller ${rows.length} gespeicherten passenden Runden</h4><div class="trend-aggregate-grid"><div><span>Runden</span><strong>${rows.length}</strong></div><div><span>Aufgaben</span><strong>${totals.answered}</strong></div><div><span>Trefferquote</span><strong>${totalAccuracy}%</strong><small>${totals.correct} richtig · ${totals.answered - totals.correct} falsch</small></div><div><span>Ø Zeit pro Aufgabe</span><strong>${totalAverageTime}</strong></div></div><p>Gemessene Gesamtzeit: ${totals.timeCount ? formatTimeValue(totals.timeTotalMs) : 'noch keine Zeitdaten'}. Die Summe berücksichtigt alle passenden gespeicherten Runden, auch wenn sie in der Liste noch nicht eingeblendet sind.</p></section>`;
    $('#loadMoreTrendRows')?.addEventListener('click', () => {
      trendRowsShown = Math.min(rows.length, trendRowsShown + TREND_PAGE_SIZE);
      renderTrendStats();
    });
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
        if (data.answered >= 3) {
          const peerTimes = Object.keys(OPERATION_INFO).filter(other => other !== kind).map(other => levelData.ops[other]).filter(item => item.timeCount >= 3).map(item => item.timeTotalMs / item.timeCount);
          const averageTime = data.timeCount ? data.timeTotalMs / data.timeCount : null;
          const peerAverage = peerTimes.length ? peerTimes.reduce((a,b)=>a+b,0) / peerTimes.length : null;
          const slow = averageTime !== null && peerAverage !== null && peerAverage > 0 && averageTime > peerAverage * 1.4;
          candidates.push({levelKey, kind, data, percent:Math.round(data.correct / data.answered * 100), averageTime, slow});
        }
      }
    }
    return candidates.sort((a,b) => a.percent - b.percent || b.data.answered - a.data.answered);
  }
  function renderLearningSuggestions() {
    const candidates = getRecommendationCandidates();
    const weak = candidates.filter(item => item.percent < 80 || (item.slow && item.percent < 95)).sort((a,b) => a.percent - b.percent || Number(b.slow)-Number(a.slow)).slice(0, 2);
    const parent = $('#learningSuggestions');
    if (weak.length) {
      parent.innerHTML = `<div class="suggestion-list">${weak.map(item => {
        const levelLabel = ({leicht:'Locker',mittel:'Knobeln',schwer:'Profi'})[item.levelKey];
        const op = OPERATION_INFO[item.kind];
        return `<article class="suggestion-card"><h4>${op.symbol} ${op.label} · ${levelLabel}</h4><p>Hier sind ${item.percent}% der Aufgaben auf dieser Kombination richtig (${item.data.correct} von ${item.data.answered}). ${item.percent < 80 ? 'Ein paar gezielte Aufgaben können mehr Sicherheit geben.' : `Die Antworten sind meist richtig, dauern mit Ø ${formatTimeValue(item.averageTime)} aber noch länger als bei anderen Rechenarten.`}</p><button type="button" class="suggestion-action" data-practice-op="${item.kind}" data-practice-level="${item.levelKey}">Diese Übung starten →</button></article>`;
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
      $('#adaptiveNote').textContent = `🎯 Auf „${levelLabel}“ sind ${names} ausgewählt. Zu Beginn ist die Mischung weitgehend ausgewogen. Danach zählen die geglättete Trefferquote, jüngere Ergebnisse und eine längere Pause seit der letzten Übung; bei bereits sicherem Rechnen kann auch langsameres Tempo etwas mehr Übung auslösen.`;
    } else {
      const needingPractice = candidates.filter(item => item.percent < 85);
      if (needingPractice.length) {
        const names = needingPractice.slice(0,2).map(item => OPERATION_INFO[item.kind].label).join(' und ');
        $('#adaptiveNote').textContent = `🎯 Auf „${levelLabel}“ kommen ${names} häufiger vor, weil die Trefferquote dort niedriger ist. Jüngere Ergebnisse zählen etwas stärker; längere Übungspausen werden ebenfalls berücksichtigt.`;
      } else {
        const slowItems = candidates.filter(item => getOperationLearningSignal(item.kind).slowBoost > 0.05).map(item => OPERATION_INFO[item.kind].label);
        $('#adaptiveNote').textContent = slowItems.length ? `🎯 Deine Trefferquote auf „${levelLabel}“ sieht gut aus. ${slowItems.join(' und ')} dauern noch länger und kommen deshalb leicht häufiger vor. Längere Übungspausen fließen ebenfalls ein.` : `🎯 Deine Trefferquote auf „${levelLabel}“ sieht gut aus. Die Mischung berücksichtigt auch jüngere Ergebnisse und längere Übungspausen.`;
      }
    }
  }
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(items) { return items[rand(0, items.length - 1)]; }

  function getOperationLearningSignal(kind, levelKey = level) {
    const lifetime = history.byLevel[levelKey].ops[kind];
    // Leicht geglättete Trefferquote: wenige Antworten führen nicht sofort zu starken Ausschlägen.
    const smoothedAccuracy = (lifetime.correct + 3) / (lifetime.answered + 4); // sanfter Startwert 75 %
    const recentSamples = (history.trend || []).filter(sample => sample.level === levelKey && sample.ops?.[kind]?.answered > 0).slice(-8).reverse();
    let recentAcc = null;
    if (recentSamples.length) {
      let weightedCorrect = 0, weightedAnswered = 0;
      recentSamples.forEach((sample, i) => {
        const weight = Math.pow(0.78, i);
        weightedCorrect += sample.ops[kind].correct * weight;
        weightedAnswered += sample.ops[kind].answered * weight;
      });
      recentAcc = weightedAnswered ? weightedCorrect / weightedAnswered : null;
    }
    const effectiveAccuracy = recentAcc === null ? smoothedAccuracy : smoothedAccuracy * 0.62 + recentAcc * 0.38;
    const latestPractice = [...(history.trend || [])].reverse().find(sample => sample.level === levelKey && sample.ops?.[kind]?.answered > 0);
    const daysSincePractice = latestPractice ? Math.max(0, (Date.now() - Date.parse(latestPractice.date)) / 86400000) : 30;
    const recencyBoost = Math.min(0.7, daysSincePractice * 0.035);
    const peerTimes = Object.keys(OPERATION_INFO).filter(other => other !== kind).map(other => history.byLevel[levelKey].ops[other]).filter(item => item.timeCount >= 3).map(item => item.timeTotalMs / item.timeCount);
    const averageTime = lifetime.timeCount ? lifetime.timeTotalMs / lifetime.timeCount : null;
    const peerAverage = peerTimes.length ? peerTimes.reduce((a,b)=>a+b,0) / peerTimes.length : null;
    const slowBoost = averageTime !== null && peerAverage !== null && peerAverage > 0 && averageTime / peerAverage > 1.4 && effectiveAccuracy >= 0.75
      ? Math.min(0.45, (averageTime / peerAverage - 1.2) * 0.3) : 0;
    const weight = Math.max(0.65, Math.min(4.5, 0.8 + (1 - effectiveAccuracy) * 2.4 + recencyBoost + slowBoost));
    return {weight, accuracy:effectiveAccuracy, answered:lifetime.answered, daysSincePractice, slowBoost};
  }
  function pickMixedOperation() {
    // Auswahl nur aus aktivierten Rechenarten; Trefferquote, jüngere Ergebnisse,
    // längere Übungspausen und (bei ausreichender Genauigkeit) langsames Tempo fließen ein.
    const kinds = selectedMixedOperations.length ? selectedMixedOperations : Object.keys(OPERATION_INFO);
    const weights = kinds.map(kind => getOperationLearningSignal(kind).weight);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < kinds.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return kinds[i];
    }
    return kinds[kinds.length - 1];
  }

  function roundOne(value) { return Math.round((value + Number.EPSILON) * 10) / 10; }
  function formatNumber(value) {
    if (typeof value === 'string') return value;
    if (!Number.isFinite(value)) return '–';
    return Number.isInteger(value) ? String(value) : value.toLocaleString('de-DE', {minimumFractionDigits:1, maximumFractionDigits:1});
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function applyTransition(a, b, kind) {
    if (settings.transitionMode === 'mixed' || !['plus','minus'].includes(kind)) return true;
    const hasTransition = kind === 'plus' ? (Math.floor(a) % 10 + Math.floor(b) % 10 >= 10) : (a >= b && Math.floor(a) % 10 < Math.floor(b) % 10);
    return settings.transitionMode === 'with' ? hasTransition : !hasTransition;
  }
  function generateQuestion() {
    const cfg = LEVELS[level];
    const kind = mode === 'gemischt' ? pickMixedOperation() : mode;
    const max = level === 'leicht' ? 20 : (level === 'mittel' ? 100 : 1000);
    let a, b, c, answer, symbol, hint, prompt, display = '', remainder = null, explanation = '';
    const useDecimals = settings.allowDecimals && Math.random() < 0.3;
    const useParentheses = settings.allowParentheses && Math.random() < 0.28 && !useDecimals;
    if (kind === 'plus') {
      for (let attempt=0; attempt<60; attempt++) {
        a = rand(1, Math.max(10, max)); b = rand(1, Math.max(10, max));
        if (applyTransition(a,b,'plus')) break;
      }
      if (useDecimals) a = roundOne(a + rand(1,9)/10);
      if (useParentheses) { c = rand(1, Math.min(20, max)); display = `(${formatNumber(a)} + ${formatNumber(b)}) + ${formatNumber(c)}`; answer = a + b + c; prompt='Rechne zuerst die Klammer aus.'; }
      else { display = `${formatNumber(a)} + ${formatNumber(b)}`; answer = a + b; prompt='Addiere die beiden Zahlen.'; }
      symbol = '+'; answer = useDecimals ? roundOne(answer) : answer;
      hint = `Rechne in kleinen Schritten. ${useParentheses ? `Beginne mit ${formatNumber(a)} + ${formatNumber(b)} und addiere danach ${formatNumber(c)}.` : `Zerlege die Zahlen in Zehner und Einer.`}`;
      explanation = 'Bei Plus kannst du erst Zehner und dann Einer zusammenzählen.';
    } else if (kind === 'minus') {
      for (let attempt=0; attempt<60; attempt++) {
        a = rand(1, Math.max(10, max)); b = rand(0, Math.max(10, max));
        if (b > a) [a,b] = [b,a];
        if (applyTransition(a,b,'minus')) break;
      }
      // Negative-result practice is independent of the selected borrow/transition setting.
      if (settings.allowNegatives && !useParentheses && Math.random() < 0.28) {
        if (a === b) { a = 0; b = 1; } else [a,b] = [Math.min(a,b),Math.max(a,b)];
      }
      if (useDecimals) a = roundOne(a + rand(1,9)/10);
      if (useParentheses) {
        c = rand(1, Math.min(10, max));
        if (!settings.allowNegatives && a < b + c) a = b + c + rand(1, Math.min(20,max));
        display = `${formatNumber(a)} − (${formatNumber(b)} + ${formatNumber(c)})`;
        answer = a - (b+c); prompt='Rechne zuerst die Klammer aus.';
      } else {
        display = `${formatNumber(a)} − ${formatNumber(b)}`; answer = a - b; prompt='Wie viel bleibt übrig?';
      }
      if (!settings.allowNegatives && answer < 0) { [a,b] = [Math.max(a,b),Math.min(a,b)]; answer = a-b; display=`${formatNumber(a)} − ${formatNumber(b)}`; }
      symbol = '−'; answer = useDecimals ? roundOne(answer) : answer;
      hint = `Ziehe Zehner und Einer nacheinander ab. ${answer < 0 ? 'Bei einem negativen Ergebnis ist die größere Zahl die, die du abziehst.' : 'Du kannst auch von der kleineren Zahl bis zur größeren weiterzählen.'}`;
      explanation = 'Bei Minus hilft es, die Zahlen in Zehner und Einer zu zerlegen.';
    } else if (kind === 'mal') {
      if (useParentheses) {
        a = rand(2, Math.min(12, cfg.factorA)); b = rand(2, 12); c = rand(1, 9);
        display = `${formatNumber(a)} × (${formatNumber(b)} + ${formatNumber(c)})`;
        answer = a * (b+c); prompt='Rechne zuerst die Klammer aus und multipliziere dann.';
      } else {
        a = level === 'leicht' ? rand(1,10) : rand(2,cfg.factorA);
        b = level === 'leicht' ? rand(1,10) : rand(2,cfg.factorB);
        if (useDecimals) a = roundOne(a + rand(1,9)/10);
        display = `${formatNumber(a)} × ${formatNumber(b)}`; answer = a*b; prompt='Finde das Produkt.';
      }
      symbol = '×'; answer = useDecimals ? roundOne(answer) : answer;
      hint = `${formatNumber(a)} × ${formatNumber(b)} bedeutet gleich große Gruppen. ${useParentheses ? `Multipliziere ${formatNumber(a)} mit der Summe in der Klammer.` : 'Nutze bekannte Einmaleins-Aufgaben.'}`;
      explanation = 'Du kannst eine Zahl zerlegen und die Teilprodukte anschließend addieren.';
    } else {
      if (settings.allowRemainder && !useDecimals && !useParentheses && Math.random() < 0.6) {
        b = rand(2, level === 'leicht' ? 10 : 15);
        const quotient = rand(2, level === 'schwer' ? 100 : 30);
        remainder = rand(1,b-1); a = b*quotient + remainder; answer = quotient;
        display = `${a} ÷ ${b}`; prompt='Schreibe den ganzzahligen Quotienten und den Rest, z. B. „3 R 2“.';
        hint = `Finde das größte Vielfache von ${b}, das nicht größer als ${a} ist. Der übrige Teil ist der Rest.`;
        explanation = 'Der Rest ist kleiner als der Divisor. Prüfe mit der Umkehraufgabe und zähle, was danach übrig bleibt.';
      } else if (useParentheses) {
        c = rand(2,8); const quotient = rand(2, Math.min(20, level === 'schwer' ? 50 : 20)); b = rand(2,8); a = quotient*c;
        display = `(${formatNumber(a)} × ${formatNumber(b)}) ÷ ${formatNumber(c)}`; answer = quotient*b; prompt='Rechne die Klammer zuerst aus und teile das Ergebnis.';
        hint = `Multipliziere zuerst ${formatNumber(a)} mit ${formatNumber(b)}. Teile das Produkt danach durch ${formatNumber(c)}.`;
        explanation = 'Bei Klammeraufgaben rechnest du zuerst den Klammerinhalt aus.';
      } else if (useDecimals) {
        b = pick([2,4,5,10]); answer = roundOne(rand(11,99)/10); a = roundOne(answer*b); display = `${formatNumber(a)} ÷ ${formatNumber(b)}`;
        prompt='Teile. Gib das Ergebnis mit Komma ein, falls nötig.'; hint=`Prüfe dein Ergebnis mit der Umkehraufgabe: Ergebnis × ${b} = ${formatNumber(a)}.`;
        explanation = 'Prüfe eine Division mit der Multiplikation als Umkehraufgabe.';
      } else {
        b = rand(2, level === 'leicht' ? 10 : cfg.factorB);
        const quotient = rand(2, level === 'leicht' ? 10 : (level === 'mittel' ? 30 : 100));
        a = b * quotient; answer = quotient; display = `${a} ÷ ${b}`;
        prompt='Teile gerecht auf – ohne Rest.'; hint=`Frage dich: ${b} mal welche Zahl ergibt ${a}? Die Umkehraufgabe hilft dir.`;
        explanation = 'Prüfe die Division mit der Umkehraufgabe: Divisor × Quotient = Dividend.';
      }
      symbol = '÷';
    }
    if (!display) display = `${formatNumber(a)} ${symbol} ${formatNumber(b)}`;
    return {kind,a,b,c,answer,remainder,symbol,hint,prompt,explanation,display,reviewCount:0};
  }
  function renderQuestion(reviewTask = null) {
    currentIsReview = Boolean(reviewTask);
    question = reviewTask ? {...reviewTask} : generateQuestion(); answered = false; hintUsed = false;
    const countLabel = currentIsReview ? `🔁 Wiederholung · ${OPERATION_INFO[question.kind].label}` : `Aufgabe ${roundAnswered + 1} von ${roundLength} · ${MODE_LABELS[mode]}`;
    $('#questionKicker').textContent = countLabel;
    $('#questionInstruction').textContent = question.prompt || 'Rechne die Aufgabe aus.';
    const hasRemainderAnswer = question.remainder !== null && question.remainder !== undefined;
    $('#remainderFormatHint').hidden = !hasRemainderAnswer;
    if (hasRemainderAnswer) { $('#answer').setAttribute('aria-label','Antwort als Quotient R Rest, zum Beispiel 3 R 2'); $('#answer').inputMode = 'text'; $('#answer').placeholder = 'z. B. 3 R 2'; }
    else { $('#answer').setAttribute('aria-label','Antwort als Zahl'); $('#answer').inputMode = settings.allowNegatives ? 'text' : (settings.allowDecimals ? 'decimal' : 'numeric'); $('#answer').placeholder = '?'; }
    const equationEnd = question.remainder !== null && question.remainder !== undefined ? '= <strong>?</strong> R <strong>?</strong>' : '= <strong>?</strong>';
    $('#equation').innerHTML = `<span class="expression">${escapeHtml(question.display || `${formatNumber(question.a)} ${question.symbol} ${formatNumber(question.b)}`)} ${equationEnd}</span>`;
    $('#equation').setAttribute('aria-label', `${question.display || `${question.a} ${question.symbol} ${question.b}`} ist gleich wie viel?`);
    $('#answer').value = ''; $('#answer').disabled = false; $('#checkBtn').disabled = false;
    $('#checkBtn').textContent = 'Antwort prüfen ✓';
    $('#hintBtn').disabled = false;
    setFeedback(currentIsReview ? 'Diese Aufgabe kennst du schon – probiere es noch einmal! 🌱' : 'Du schaffst das! Denk in Ruhe nach. 🌟', '');
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
    $('#progressFill').style.width = `${done / roundLength * 100}%`;
    $('#progressBar').setAttribute('aria-valuemax', String(roundLength));
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
  function parseRemainderAnswer(raw) {
    const match = raw.trim().match(/^(\d+)\s*(?:r|rest)\s*(\d+)$/i);
    return match ? {quotient:Number(match[1]), remainder:Number(match[2])} : null;
  }
  function renderDailyGoal() {
    const today = localDateKey();
    const entry = (history.dailyLog || []).find(item => item.date === today) || {answered:0,correct:0};
    const goal = settings.dailyGoal;
    const percent = Math.min(100, Math.round(entry.answered / goal * 100));
    $('#dailyGoalText').textContent = `${entry.answered} von ${goal} Aufgaben heute · ${entry.correct} richtig`;
    $('#dailyGoalPercent').textContent = `${percent}%`;
    $('#dailyGoalFill').style.width = `${percent}%`;
    $('#dailyGoalBar').setAttribute('aria-valuemax', String(goal));
    $('#dailyGoalBar').setAttribute('aria-valuenow', String(Math.min(goal,entry.answered)));
    $('#dailyGoalEncouragement').textContent = entry.answered >= goal ? '🎉 Tagesziel geschafft! Du hast heute fleißig geübt.' : entry.answered === 0 ? 'Jede Aufgabe zählt – ganz ohne Zeitdruck.' : `Noch ${Math.max(0,goal-entry.answered)} ${goal-entry.answered===1?'Aufgabe':'Aufgaben'} bis zum Tagesziel. Pausen sind natürlich erlaubt!`;
  }
  function checkAnswer(event) {
    event.preventDefault();
    if (answered) { nextQuestion(); return; }
    const raw = $('#answer').value.trim();
    if (raw === '') { setFeedback('Trage erst eine Antwort ein – du packst das! 😊', 'try'); $('#answer').focus(); return; }
    let isCorrect = false;
    if (question.remainder !== null && question.remainder !== undefined) {
      const parsed = parseRemainderAnswer(raw);
      if (!parsed) { setFeedback('Gib Quotient und Rest ein, zum Beispiel: 3 R 2.', 'try'); $('#answer').focus(); return; }
      isCorrect = parsed.quotient === question.answer && parsed.remainder === question.remainder;
    } else {
      const value = Number(raw.replace(',', '.'));
      if (!Number.isFinite(value)) { setFeedback('Bitte gib eine gültige Zahl ein. Dezimalzahlen kannst du mit Komma schreiben.', 'try'); $('#answer').focus(); return; }
      isCorrect = Math.abs(value - question.answer) < 0.051;
    }
    const durationMs = getQuestionDurationMs();
    answered = true;
    questionTimerStartedAt = 0;
    questionTimerPaused = true;
    $('#answer').disabled = true;
    $('#hintBtn').disabled = true;

    if (currentIsReview) {
      roundReviewAttempts++; history.reviewAttempts++;
      if (isCorrect) {
        roundReviewCorrect++; history.reviewCorrect++;
        streak++;
        history.stars++;
        setFeedback('Diesmal richtig! 🌟 Genau so lernt dein Gehirn dazu. +1 Stern!', 'good');
        $('#equation').textContent = `${question.display} = ${question.remainder != null ? `${question.answer} R ${question.remainder}` : formatNumber(question.answer)}`;
        celebrate();
      } else if ((question.reviewCount || 1) < 2) {
        streak = 0;
        reviewQueue.push({question:{...question, reviewCount:(question.reviewCount || 1)+1}, dueAt:roundAnswered + 1});
        setFeedback(`Noch nicht ganz. ${question.hint} Ich frage dich später noch einmal. 💡`, 'try');
      } else {
        streak = 0;
        const correctAnswer = question.remainder != null ? `${question.answer} R ${question.remainder}` : formatNumber(question.answer);
        setFeedback(`Das war eine knifflige Aufgabe. Die Lösung lautet ${correctAnswer}. ${question.explanation}`, 'try');
        $('#equation').textContent = `${question.display} = ${correctAnswer}`;
      }
    } else {
      roundAnswered++;
      history.answered++;
      roundTimeTotalMs += durationMs; roundTimeCount++;
      const roundOpStats = roundOperationStats[question.kind];
      roundOpStats.answered++; recordQuestionTime(roundOpStats, durationMs);
      if (!history.ops[question.kind]) history.ops[question.kind] = {correct:0,answered:0,timeTotalMs:0,timeCount:0};
      history.ops[question.kind].answered++; recordQuestionTime(history.ops[question.kind], durationMs);
      const levelStats = history.byLevel[level];
      levelStats.answered++; levelStats.ops[question.kind].answered++;
      recordQuestionTime(levelStats.ops[question.kind], durationMs);
      recordDailyProgress(isCorrect, durationMs);
      if (isCorrect) {
        roundCorrect++; totalCorrectThisSession++; streak++; history.correct++; history.ops[question.kind].correct++;
        roundOpStats.correct++; levelStats.correct++; levelStats.ops[question.kind].correct++;
        const reward = hintUsed ? 1 : (streak > 0 && streak % 3 === 0 ? 3 : 2);
        history.stars += reward;
        setFeedback(pick(['Richtig! Du bist auf Sternenkurs! ⭐','Yes! Super gerechnet! 🚀','Volltreffer! Dein Mathe-Level steigt! 🎉','Klasse! Dein Fuchs jubelt mit dir! 🦊']) + ` +${reward} ${reward === 1 ? 'Stern' : 'Sterne'}!`, 'good');
        $('#equation').textContent = `${question.display} = ${question.remainder != null ? `${question.answer} R ${question.remainder}` : formatNumber(question.answer)}`;
        celebrate();
      } else {
        streak = 0;
        reviewQueue.push({question:{...question,reviewCount:1}, dueAt:roundAnswered + 2});
        setFeedback(`Noch nicht ganz. ${question.explanation} ${question.hint} Diese Aufgabe kommt später noch einmal – du musst dir die Lösung noch nicht merken. 🌱`, 'try');
      }
      updateProgress();
    }
    saveHistory(); updateProgress();
    const hasReviewLeft = reviewQueue.length > 0;
    $('#checkBtn').textContent = (roundAnswered >= roundLength && !hasReviewLeft) ? 'Ergebnis ansehen →' : 'Weiter →';
    $('#checkBtn').focus({ preventScroll: true });
  }
  function nextQuestion() {
    if (!answered) return;
    const dueIndex = reviewQueue.findIndex(item => item.dueAt <= roundAnswered);
    if (dueIndex >= 0 || roundAnswered >= roundLength && reviewQueue.length) {
      const nextIndex = dueIndex >= 0 ? dueIndex : 0;
      const [nextReview] = reviewQueue.splice(nextIndex,1);
      renderQuestion(nextReview.question);
      return;
    }
    if (roundAnswered < roundLength) { renderQuestion(); return; }
    showResults();
  }
  function showResults() {
    const sample = {
      date:new Date().toISOString(), mode, level,
      correct:roundCorrect, answered:roundAnswered,
      timeTotalMs:Math.round(roundTimeTotalMs), timeCount:roundTimeCount,
      reviewAttempts:roundReviewAttempts, reviewCorrect:roundReviewCorrect,
      ops:Object.fromEntries(Object.entries(roundOperationStats).map(([kind,data]) => [kind, {...data}]))
    };
    history.trend = [...(history.trend || []), sample].slice(-TREND_HISTORY_LIMIT);
    history.rounds++; saveHistory();
    $('#startView').hidden = true; $('#activeQuestion').hidden = true; $('#resultView').hidden = false;
    const percent = roundAnswered ? Math.round(roundCorrect / roundAnswered * 100) : 0;
    const face = percent === 100 ? '🏆' : percent >= 70 ? '🥳' : percent >= 40 ? '🌟' : '🦊';
    const title = percent === 100 ? 'Sensationell!' : percent >= 70 ? 'Richtig stark!' : percent >= 40 ? 'Gut gemacht!' : 'Weiter üben lohnt sich!';
    const message = percent === 100 ? 'Alle Aufgaben beim ersten Versuch richtig – du bist ein echter Mathe-Champion!' : percent >= 70 ? 'Du hast schon richtig viel drauf. Mit jeder Runde wirst du sicherer.' : 'Jede Aufgabe hilft deinem Gehirn beim Trainieren. Die schwierigen Aufgaben kamen zur Wiederholung zurück.';
    const reviewText = roundReviewAttempts ? `<div class="result-pill">🔁 Wiederholungen: ${roundReviewCorrect} von ${roundReviewAttempts} richtig</div>` : '';
    $('#resultView').innerHTML = `<div class="result-big" aria-hidden="true">${face}</div><h3>${title}</h3><p>${message}</p><div class="result-summary"><div class="result-pill">✅ ${roundCorrect} von ${roundAnswered} beim ersten Versuch richtig</div><div class="result-pill">⭐ ${history.stars} Sterne gesammelt</div>${reviewText}</div><div class="actions"><button class="primary" id="againBtn" type="button">Noch eine Runde ↻</button><button class="secondary" id="reviewBtn" type="button">Runde neu starten</button></div>`;
    $('#againBtn').addEventListener('click', startRound);
    $('#reviewBtn').addEventListener('click', startRound);
  }
  function renderLevelNote() {
    const parts = [LEVELS[level].note];
    if (selectedMixedOperations.includes('geteilt')) {
      parts.push(settings.allowRemainder ? 'Division mit und ohne Rest.' : 'Division ohne Rest.');
    }
    const extras = [
      settings.allowNegatives ? 'Negative Ergebnisse sind möglich.' : null,
      settings.allowDecimals ? 'Dezimalzahlen sind aktiviert.' : null,
      settings.allowParentheses ? 'Klammeraufgaben sind aktiviert.' : null
    ].filter(Boolean);
    if (extras.length) parts.push(extras.join(' '));
    $('#levelNote').textContent = parts.join(' ');
  }
  function updateModeButtons() {
    const operationSubtitles = {
      plus:'Zusammenzählen',
      minus:'Unterschied finden',
      mal:'Malnehmen',
      geteilt:settings.allowRemainder ? 'Fair aufteilen – auch mit Rest' : 'Fair aufteilen – ohne Rest'
    };
    $$('#modeGrid .mode').forEach(btn => {
      const kind = btn.dataset.mode;
      const isIncluded = selectedMixedOperations.includes(kind);
      btn.setAttribute('aria-pressed', String(isIncluded));
      btn.classList.toggle('operation-included', isIncluded);
      btn.querySelector('.sub').textContent = isIncluded ? operationSubtitles[kind] : 'Nicht ausgewählt';
    });
    renderLevelNote();
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
    const extra = [settings.allowRemainder?'Division mit Rest':null,settings.allowNegatives?'negative Zahlen':null,settings.allowDecimals?'Dezimalzahlen':null,settings.allowParentheses?'Klammern':null].filter(Boolean);
    $('#roundPreview').textContent = `${modeName} · ${levelName} · ${roundLength} Aufgaben${extra.length ? ' · '+extra.join(', ') : ''}`;
    $('#gameHeading').innerHTML = `Sternenrunde <span>· ${roundLength} Aufgaben</span>`;
  }

  // Prepare a round without showing a task or starting the timer.
  function resetRoundState() {
    roundLength = settings.roundLength;
    index = 0; roundCorrect = 0; roundAnswered = 0; streak = 0; totalCorrectThisSession = 0;
    roundTimeTotalMs = 0; roundTimeCount = 0; roundOperationStats = emptyOperationStats();
    roundReviewAttempts = 0; roundReviewCorrect = 0; reviewQueue = [];
    answered = false; currentIsReview = false; question = null; questionElapsedMs = 0; questionTimerStartedAt = 0; questionTimerPaused = false;
  }
  // Prepare a round without showing a task or starting the timer.
  function startRound() {
    resetRoundState();
    updateModeButtons();
    $('#startView').hidden = false; $('#activeQuestion').hidden = true; $('#resultView').hidden = true;
    $('#progressFill').style.width = '0%'; $('#progressBar').setAttribute('aria-valuemax', String(roundLength)); $('#progressBar').setAttribute('aria-valuenow', '0');
    $('#streak').textContent = '0';
    renderAdaptiveNote();
  }
  function beginRound() {
    resetRoundState();
    $('#startView').hidden = true;
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
    renderLevelNote(); startRound();
  }));
  function syncSettingsControls() {
    $('#roundLengthSelect').value = String(settings.roundLength);
    $('#dailyGoalSelect').value = String(settings.dailyGoal);
    $('#transitionSelect').value = settings.transitionMode;
    $('#allowRemainder').checked = settings.allowRemainder;
    $('#allowNegatives').checked = settings.allowNegatives;
    $('#allowDecimals').checked = settings.allowDecimals;
    $('#allowParentheses').checked = settings.allowParentheses;
    applyAppearance();
  }
  function exportProgress() {
    const payload = {app:'Mathe-Quest',version:2,exportedAt:new Date().toISOString(),history,settings};
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `mathe-quest-sicherung-${localDateKey()}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#offlineStatus').textContent = 'Sicherung erstellt. Bewahre die JSON-Datei an einem sicheren Ort auf.';
  }
  async function importProgressFile(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.app !== 'Mathe-Quest' || !parsed.history || typeof parsed.history !== 'object') throw new Error('not a Mathe-Quest backup');
      const accepted = window.confirm('Die Sicherung ersetzt den aktuellen Lernfortschritt auf diesem Gerät. Möchtest du fortfahren?');
      if (!accepted) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.history));
      if (parsed.settings && typeof parsed.settings === 'object') localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed.settings));
      history = loadHistory(); settings = loadSettings(); syncSettingsControls();
      selectedMixedOperations = Object.keys(OPERATION_INFO); syncModeFromSelection();
      trendRowsShown = TREND_PAGE_SIZE; renderStats(); startRound();
      $('#offlineStatus').textContent = 'Sicherung erfolgreich eingelesen. Alle Daten bleiben lokal auf diesem Gerät.';
    } catch (_) {
      window.alert('Die Datei konnte nicht als Mathe-Quest-Sicherung gelesen werden. Wähle eine zuvor exportierte JSON-Datei.');
    } finally { $('#importFileInput').value = ''; }
  }
  function bindSettingControls() {
    $('#roundLengthSelect').addEventListener('change', () => { settings.roundLength = Number($('#roundLengthSelect').value); saveSettings(); startRound(); });
    $('#dailyGoalSelect').addEventListener('change', () => { settings.dailyGoal = Number($('#dailyGoalSelect').value); saveSettings(); });
    $('#transitionSelect').addEventListener('change', () => { settings.transitionMode = $('#transitionSelect').value; saveSettings(); startRound(); });
    for (const [id,key] of [['allowRemainder','allowRemainder'],['allowNegatives','allowNegatives'],['allowDecimals','allowDecimals'],['allowParentheses','allowParentheses']]) {
      $('#'+id).addEventListener('change', () => { settings[key] = $('#'+id).checked; saveSettings(); startRound(); });
    }
    $('#darkModeBtn').addEventListener('click', () => { settings.darkMode = !settings.darkMode; saveSettings(); });
    $('#exportProgressBtn').addEventListener('click', exportProgress);
    $('#importProgressBtn').addEventListener('click', () => $('#importFileInput').click());
    $('#importFileInput').addEventListener('change', event => importProgressFile(event.target.files && event.target.files[0]));
  }
  function setActiveTab(tabName) {
    const isProgress = tabName === 'progress';
    $('#practiceView').hidden = isProgress;
    $('#progressView').hidden = !isProgress;
    $('#practiceTab').setAttribute('aria-selected', String(!isProgress));
    $('#progressTab').setAttribute('aria-selected', String(isProgress));
    if (isProgress) renderStats();
  }
  $$('.app-tab').forEach(button => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));
  $('#trendLevelFilter').addEventListener('change', () => { trendRowsShown = TREND_PAGE_SIZE; renderTrendStats(); });
  $('#trendOperationFilter').addEventListener('change', () => { trendRowsShown = TREND_PAGE_SIZE; renderTrendStats(); });
  $('#resetProgressBtn').addEventListener('click', () => {
    const confirmed = window.confirm('Möchtest du wirklich den gesamten Lernfortschritt, alle Sterne und Empfehlungen zurücksetzen? Das kann nicht rückgängig gemacht werden.');
    if (!confirmed) return;
    history = createEmptyHistory();
    trendRowsShown = TREND_PAGE_SIZE;
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
    renderLevelNote();
    setActiveTab('practice');
    startRound();
    window.scrollTo({top:0,behavior:'smooth'});
  });
  $('#startRoundBtn').addEventListener('click', beginRound);
  $('#answerForm').addEventListener('submit', checkAnswer);
  $('#hintBtn').addEventListener('click', showHint);
  syncSettingsControls(); bindSettingControls();
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
