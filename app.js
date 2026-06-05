(function () {
  const questions = Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : [];
  const storageKey = "safetyQuizProgress.v1";
  const todayKey = new Date().toISOString().slice(0, 10);

  const state = {
    filters: {
      search: "",
      outline: "全部",
      type: "全部",
      mode: "all",
      shuffle: false,
    },
    order: [],
    cursor: 0,
    selected: new Set(),
    revealed: false,
    progress: loadProgress(),
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    bankMeta: $("bankMeta"),
    searchInput: $("searchInput"),
    outlineFilter: $("outlineFilter"),
    typeFilter: $("typeFilter"),
    modeSelect: $("modeSelect"),
    shuffleToggle: $("shuffleToggle"),
    todayCount: $("todayCount"),
    accuracy: $("accuracy"),
    wrongCount: $("wrongCount"),
    masteredCount: $("masteredCount"),
    resetProgress: $("resetProgress"),
    questionIndex: $("questionIndex"),
    questionTitle: $("questionTitle"),
    favoriteButton: $("favoriteButton"),
    tagRow: $("tagRow"),
    questionStem: $("questionStem"),
    optionsBox: $("optionsBox"),
    shortAnswerInput: $("shortAnswerInput"),
    resultBox: $("resultBox"),
    selfCheck: $("selfCheck"),
    selfWrong: $("selfWrong"),
    selfRight: $("selfRight"),
    prevButton: $("prevButton"),
    showAnswerButton: $("showAnswerButton"),
    submitButton: $("submitButton"),
    nextButton: $("nextButton"),
  };

  init();

  function init() {
    els.bankMeta.textContent = `${questions.length} 道题，本地进度自动保存`;
    fillSelect(els.outlineFilter, ["全部", ...unique(questions.map((q) => q.outline1 || "未分类"))]);
    fillSelect(els.typeFilter, ["全部", ...unique(questions.map((q) => q.type || "未知题型"))]);
    bindEvents();
    rebuildOrder();
    render();
  }

  function bindEvents() {
    els.searchInput.addEventListener("input", () => {
      state.filters.search = els.searchInput.value.trim();
      rebuildOrder();
    });
    els.outlineFilter.addEventListener("change", () => {
      state.filters.outline = els.outlineFilter.value;
      rebuildOrder();
    });
    els.typeFilter.addEventListener("change", () => {
      state.filters.type = els.typeFilter.value;
      rebuildOrder();
    });
    els.modeSelect.addEventListener("change", () => {
      state.filters.mode = els.modeSelect.value;
      rebuildOrder();
    });
    els.shuffleToggle.addEventListener("click", () => {
      state.filters.shuffle = !state.filters.shuffle;
      els.shuffleToggle.setAttribute("aria-pressed", String(state.filters.shuffle));
      rebuildOrder();
    });
    els.favoriteButton.addEventListener("click", toggleFavorite);
    els.prevButton.addEventListener("click", () => move(-1));
    els.nextButton.addEventListener("click", () => move(1));
    els.submitButton.addEventListener("click", submitAnswer);
    els.showAnswerButton.addEventListener("click", revealAnswer);
    els.selfWrong.addEventListener("click", () => recordSelfCheck(false));
    els.selfRight.addEventListener("click", () => recordSelfCheck(true));
    els.resetProgress.addEventListener("click", resetProgress);
  }

  function fillSelect(select, values) {
    select.innerHTML = values
      .filter(Boolean)
      .map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`)
      .join("");
  }

  function rebuildOrder() {
    let list = questions.filter(matchesFilters);
    if (state.filters.shuffle) {
      list = shuffle([...list]);
    }
    state.order = list.map((q) => q.id);
    state.cursor = 0;
    state.selected.clear();
    state.revealed = false;
    render();
  }

  function matchesFilters(question) {
    const record = getRecord(question.id);
    if (state.filters.outline !== "全部" && question.outline1 !== state.filters.outline) return false;
    if (state.filters.type !== "全部" && question.type !== state.filters.type) return false;
    if (state.filters.mode === "wrong" && !record.wrong) return false;
    if (state.filters.mode === "favorite" && !record.favorite) return false;
    if (state.filters.mode === "due" && (!record.nextReview || record.nextReview > todayKey)) return false;

    const term = state.filters.search;
    if (!term) return true;
    const haystack = [question.stem, question.answer, question.outline1, question.outline2, question.category, question.basis]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term.toLowerCase());
  }

  function render() {
    renderStats();
    const question = currentQuestion();
    if (!question) {
      renderEmpty();
      return;
    }

    const record = getRecord(question.id);
    els.questionIndex.textContent = `第 ${state.cursor + 1} / ${state.order.length} 题`;
    els.questionTitle.textContent = question.type || "题目";
    els.favoriteButton.textContent = record.favorite ? "★" : "☆";
    els.questionStem.textContent = question.stem;
    els.tagRow.innerHTML = [question.category, question.outline1, question.outline2, question.score && `${question.score} 分`]
      .filter((tag) => tag && tag !== "\\")
      .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
      .join("");
    els.shortAnswerInput.classList.toggle("visible", isShortAnswer(question));
    els.submitButton.classList.toggle("hidden", isShortAnswer(question));
    els.selfCheck.classList.toggle("hidden", !isShortAnswer(question) || !state.revealed);
    renderOptions(question);
    renderResult(question);
  }

  function renderEmpty() {
    els.questionIndex.textContent = "第 0 / 0 题";
    els.questionTitle.textContent = "没有匹配的题目";
    els.favoriteButton.textContent = "☆";
    els.tagRow.innerHTML = "";
    els.questionStem.textContent = "换一个筛选条件，或者清空搜索关键词。";
    els.optionsBox.innerHTML = "";
    els.shortAnswerInput.classList.remove("visible");
    els.resultBox.classList.add("hidden");
    els.selfCheck.classList.add("hidden");
  }

  function renderOptions(question) {
    if (isShortAnswer(question)) {
      els.optionsBox.innerHTML = "";
      return;
    }

    const options = normalizedOptions(question);
    els.optionsBox.innerHTML = options
      .map((option) => {
        const selected = state.selected.has(option.key);
        const answerKeys = answerSet(question);
        const showState = state.revealed;
        const classes = ["option"];
        if (selected) classes.push("selected");
        if (showState && answerKeys.has(option.key)) classes.push("correct");
        if (showState && selected && !answerKeys.has(option.key)) classes.push("wrong");
        return `<button class="${classes.join(" ")}" type="button" data-key="${escapeAttr(option.key)}">
          <span class="option-key">${escapeHtml(option.key)}</span>
          <span class="option-text">${escapeHtml(option.text)}</span>
        </button>`;
      })
      .join("");

    els.optionsBox.querySelectorAll(".option").forEach((button) => {
      button.addEventListener("click", () => selectOption(question, button.dataset.key));
    });
  }

  function renderResult(question) {
    if (!state.revealed) {
      els.resultBox.className = "result hidden";
      els.resultBox.innerHTML = "";
      return;
    }

    const correct = isSelectionCorrect(question);
    const basis = question.basis && question.basis !== "\\" ? `<p><strong>依据：</strong>${escapeHtml(question.basis)}</p>` : "";
    const note = question.note ? `<p><strong>备注：</strong>${escapeHtml(question.note)}</p>` : "";
    const answerText = answerDisplay(question);
    const prefix = isShortAnswer(question) ? "参考答案" : correct ? "回答正确" : "回答错误";

    els.resultBox.className = `result ${isShortAnswer(question) ? "" : correct ? "good" : "bad"}`;
    els.resultBox.innerHTML = `<p><strong>${prefix}：</strong>${escapeHtml(answerText)}</p>${basis}${note}`;
  }

  function renderStats() {
    const records = Object.values(state.progress.records);
    const totalAnswered = records.reduce((sum, item) => sum + item.right + item.wrong, 0);
    const totalRight = records.reduce((sum, item) => sum + item.right, 0);
    const wrong = records.filter((item) => item.wrong > 0).length;
    const mastered = records.filter((item) => item.streak >= 3).length;
    els.todayCount.textContent = state.progress.daily[todayKey] || 0;
    els.accuracy.textContent = totalAnswered ? `${Math.round((totalRight / totalAnswered) * 100)}%` : "0%";
    els.wrongCount.textContent = wrong;
    els.masteredCount.textContent = mastered;
  }

  function selectOption(question, key) {
    if (state.revealed) return;
    if (isMulti(question)) {
      state.selected.has(key) ? state.selected.delete(key) : state.selected.add(key);
    } else {
      state.selected = new Set([key]);
    }
    renderOptions(question);
  }

  function submitAnswer() {
    const question = currentQuestion();
    if (!question || isShortAnswer(question) || state.selected.size === 0) return;
    const correct = isSelectionCorrect(question);
    state.revealed = true;
    updateRecord(question.id, correct);
    saveProgress();
    render();
  }

  function revealAnswer() {
    const question = currentQuestion();
    if (!question) return;
    state.revealed = true;
    render();
  }

  function recordSelfCheck(correct) {
    const question = currentQuestion();
    if (!question) return;
    updateRecord(question.id, correct);
    saveProgress();
    render();
  }

  function updateRecord(id, correct) {
    const record = getRecord(id);
    const interval = correct ? Math.min(14, Math.max(1, record.streak + 1) ** 2) : 1;
    record.right += correct ? 1 : 0;
    record.wrong += correct ? 0 : 1;
    record.streak = correct ? record.streak + 1 : 0;
    record.wrong = correct && record.streak >= 2 ? 0 : record.wrong;
    record.lastReviewed = todayKey;
    record.nextReview = addDays(todayKey, interval);
    state.progress.daily[todayKey] = (state.progress.daily[todayKey] || 0) + 1;
  }

  function toggleFavorite() {
    const question = currentQuestion();
    if (!question) return;
    const record = getRecord(question.id);
    record.favorite = !record.favorite;
    saveProgress();
    render();
  }

  function move(delta) {
    if (!state.order.length) return;
    state.cursor = (state.cursor + delta + state.order.length) % state.order.length;
    state.selected.clear();
    state.revealed = false;
    els.shortAnswerInput.value = "";
    render();
  }

  function resetProgress() {
    if (!confirm("确定清空所有学习记录、错题和收藏吗？")) return;
    state.progress = { records: {}, daily: {} };
    saveProgress();
    rebuildOrder();
  }

  function currentQuestion() {
    const id = state.order[state.cursor];
    return questions.find((question) => question.id === id);
  }

  function normalizedOptions(question) {
    if (question.options.length) return question.options;
    if (question.type === "判断题") {
      return [
        { key: "A", text: "正确" },
        { key: "B", text: "错误" },
      ];
    }
    return [];
  }

  function answerSet(question) {
    const answer = question.answer.replace(/[\s,，、|]+/g, "");
    if (question.type === "判断题") {
      if (["正确", "对", "TRUE", "T", "是", "A"].includes(answer)) return new Set(["A"]);
      if (["错误", "错", "FALSE", "F", "否", "B"].includes(answer)) return new Set(["B"]);
    }
    return new Set(answer.split("").filter(Boolean));
  }

  function answerDisplay(question) {
    if (isShortAnswer(question)) return question.answer;
    const keys = answerSet(question);
    const optionMap = new Map(normalizedOptions(question).map((option) => [option.key, option.text]));
    return [...keys].map((key) => `${key}. ${optionMap.get(key) || ""}`.trim()).join("；");
  }

  function isSelectionCorrect(question) {
    const answer = [...answerSet(question)].sort().join("");
    const selected = [...state.selected].sort().join("");
    return answer === selected;
  }

  function isMulti(question) {
    return question.type.includes("多选");
  }

  function isShortAnswer(question) {
    return question.type.includes("简答");
  }

  function getRecord(id) {
    if (!state.progress.records[id]) {
      state.progress.records[id] = {
        right: 0,
        wrong: 0,
        streak: 0,
        favorite: false,
        lastReviewed: "",
        nextReview: "",
      };
    }
    return state.progress.records[id];
  }

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || { records: {}, daily: {} };
    } catch {
      return { records: {}, daily: {} };
    }
  }

  function saveProgress() {
    localStorage.setItem(storageKey, JSON.stringify(state.progress));
  }

  function unique(values) {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function addDays(dateString, days) {
    const date = new Date(`${dateString}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
