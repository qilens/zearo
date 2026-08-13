(function () {
  "use strict";

  const settingsView = document.querySelector("#settings-view");
  const workspaceView = document.querySelector("#workspace-view");
  const settingsButton = document.querySelector("#settings-button");
  const settingsForm = document.querySelector("#settings-form");
  const cancelSettingsButton = document.querySelector("#cancel-settings");
  const clearCacheButton = document.querySelector("#clear-cache");
  const cacheCount = document.querySelector("#cache-count");
  const settingsError = document.querySelector("#settings-error");
  const settingsStatus = document.querySelector("#settings-status");
  const workspaceError = document.querySelector("#workspace-error");
  const cacheStatus = document.querySelector("#cache-status");
  const baseUrlInput = document.querySelector("#base-url");
  const apiKeyInput = document.querySelector("#api-key");
  const modelInput = document.querySelector("#model");
  const title = document.querySelector("#workspace-title");
  const languageSelect = document.querySelector("#language");
  const emptyState = document.querySelector("#empty-state");
  const analysisStatus = document.querySelector("#analysis-status");
  const answerElement = document.querySelector("#answer");
  const pitfallsSection = document.querySelector("#pitfalls-section");
  const followUpResult = document.querySelector("#follow-up-result");
  const followUpAnswer = document.querySelector("#follow-up-answer");
  const followUpForm = document.querySelector("#follow-up-form");
  const followUpQuestion = document.querySelector("#follow-up-question");
  const cancelFollowUpButton = document.querySelector("#cancel-follow-up");
  const sendFollowUpButton = document.querySelector("#send-follow-up");
  const followUpButton = document.querySelector("#follow-up-button");
  const startButton = document.querySelector("#start-button");
  const copyCodeButton = document.querySelector("#copy-code");
  let settings = null;
  let renderedCode = "";
  let currentProblem = null;
  let currentLanguage = null;
  let currentCodeMode = null;
  let currentAnswer = null;
  let currentCacheKey = null;

  function showError(element, error) {
    element.textContent = error instanceof Error ? error.message : String(error);
    element.hidden = false;
  }

  function showStatus(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function clearNotice(element) {
    element.textContent = "";
    element.hidden = true;
  }

  async function showSettings() {
    baseUrlInput.value = settings ? settings.baseUrl : "";
    apiKeyInput.value = settings ? settings.apiKey : "";
    modelInput.value = settings ? settings.model : "";
    settingsForm.elements.codeMode.value = settings ? settings.codeMode : "oj";
    clearNotice(settingsError);
    clearNotice(settingsStatus);
    cancelSettingsButton.hidden = !settings;
    workspaceView.hidden = true;
    settingsView.hidden = false;

    const stored = await chrome.storage.local.get("answerCache");
    cacheCount.textContent = String((stored.answerCache || []).length);
  }

  function showWorkspace() {
    settingsView.hidden = true;
    workspaceView.hidden = false;
  }

  function setRequestBusy(busy) {
    startButton.disabled = busy;
    followUpButton.disabled = busy;
    sendFollowUpButton.disabled = busy;
    settingsButton.disabled = busy;
  }

  function populateList(element, items) {
    element.replaceChildren(
      ...items.map((item) => {
        const listItem = document.createElement("li");
        listItem.textContent = item;
        return listItem;
      })
    );
  }

  function renderAnswer(answer, problemTitle) {
    title.textContent = problemTitle;
    document.querySelector("#answer-idea").textContent = answer.idea;
    populateList(document.querySelector("#answer-steps"), answer.steps);
    document.querySelector("#answer-time").textContent = answer.timeComplexity;
    document.querySelector("#answer-space").textContent = answer.spaceComplexity;
    document.querySelector("#answer-code").textContent = answer.code;
    populateList(document.querySelector("#answer-pitfalls"), answer.pitfalls);
    renderedCode = answer.code;
    copyCodeButton.textContent = "复制代码";
  }

  function clearFollowUp() {
    followUpForm.hidden = true;
    followUpResult.hidden = true;
    followUpQuestion.value = "";
    followUpAnswer.textContent = "";
    pitfallsSection.classList.remove("rail-branch");
    pitfallsSection.classList.add("rail-end");
    document.body.classList.remove("follow-up-open");
  }

  function renderFollowUp(content) {
    followUpAnswer.textContent = content;
    pitfallsSection.classList.remove("rail-end");
    pitfallsSection.classList.add("rail-branch");
    followUpResult.hidden = false;
  }

  function commitAnswer(problem, language, codeMode, answer, cacheKey) {
    currentProblem = problem;
    currentLanguage = language;
    currentCodeMode = codeMode;
    currentAnswer = answer;
    currentCacheKey = cacheKey;
    renderAnswer(answer, problem.title);
    emptyState.hidden = true;
    answerElement.hidden = false;
    followUpButton.hidden = false;
    startButton.textContent = "重新生成";
  }

  async function readCurrentProblem() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== "number") {
      throw new Error("无法读取当前标签页。");
    }

    async function sendReadMessage() {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "READ_PROBLEM" });
      if (!response.ok) {
        throw new Error(response.error);
      }
      return response.problem;
    }

    try {
      return await sendReadMessage();
    } catch (error) {
      if (error.message.includes("Receiving end does not exist")) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["core.js", "content.js"]
          });
          return await sendReadMessage();
        } catch (injectionError) {
          throw new Error(
            `无法连接当前 LeetCode 页面：${injectionError.message}`
          );
        }
      }
      throw error;
    }
  }

  async function runAnalysis() {
    const refreshRequested = Boolean(currentAnswer);
    const displayedCacheKey = currentCacheKey;
    clearNotice(workspaceError);
    clearNotice(cacheStatus);
    clearFollowUp();
    emptyState.hidden = true;
    analysisStatus.hidden = false;
    setRequestBusy(true);
    startButton.textContent = "正在分析";

    try {
      const problem = await readCurrentProblem();
      const selectedLanguage =
        languageSelect.value === "auto" ? problem.editorLanguage : languageSelect.value;
      if (!selectedLanguage) {
        throw new Error("无法识别编辑器语言，请在 Zearo 中手动选择代码语言。");
      }

      const cacheKey = ZearoCore.cacheKeyFor(
        problem,
        selectedLanguage,
        settings.codeMode,
        settings
      );
      const forceRefresh = refreshRequested && cacheKey === displayedCacheKey;
      const stored = await chrome.storage.local.get("answerCache");
      const entries = stored.answerCache || [];

      if (!forceRefresh) {
        const cached = ZearoCore.readCachedAnswer(entries, cacheKey, Date.now());
        if (cached) {
          await chrome.storage.local.set({ answerCache: cached.entries });
          commitAnswer(problem, selectedLanguage, settings.codeMode, cached.answer, cacheKey);
          showStatus(cacheStatus, "已从缓存读取");
          return;
        }
      }

      const answer = await ZearoCore.requestAnswer(
        settings,
        ZearoCore.buildSolutionMessages(problem, selectedLanguage, settings.codeMode)
      );
      const updatedEntries = ZearoCore.upsertCachedAnswer(
        entries,
        cacheKey,
        answer,
        Date.now()
      );
      await chrome.storage.local.set({ answerCache: updatedEntries });
      commitAnswer(problem, selectedLanguage, settings.codeMode, answer, cacheKey);
      showStatus(cacheStatus, forceRefresh ? "已更新缓存" : "解答已保存到缓存");
    } finally {
      analysisStatus.hidden = true;
      setRequestBusy(false);
      startButton.textContent = currentAnswer ? "重新生成" : "开始解题";
    }
  }

  async function runFollowUp(question) {
    clearNotice(workspaceError);
    setRequestBusy(true);
    sendFollowUpButton.textContent = "正在追问";

    try {
      const content = await ZearoCore.requestCompletion(
        settings,
        ZearoCore.buildFollowUpMessages(
          currentProblem,
          currentLanguage,
          currentCodeMode,
          currentAnswer,
          question
        )
      );
      renderFollowUp(content);
      followUpForm.hidden = true;
      document.body.classList.remove("follow-up-open");
    } finally {
      setRequestBusy(false);
      sendFollowUpButton.textContent = "发送追问";
    }
  }

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearNotice(settingsError);
    clearNotice(settingsStatus);

    try {
      const baseUrl = ZearoCore.validateBaseUrl(baseUrlInput.value);
      const apiKey = apiKeyInput.value.trim();
      const model = modelInput.value.trim();
      const codeMode = settingsForm.elements.codeMode.value;
      if (!apiKey || !model) {
        throw new Error("请填写 API Key 和模型名。");
      }

      const nextPattern = ZearoCore.permissionPatternFor(baseUrl);
      const granted = await chrome.permissions.request({ origins: [nextPattern] });
      if (!granted) {
        throw new Error("未获得 API 域名访问权限，设置尚未保存。");
      }

      if (settings && settings.baseUrl !== baseUrl) {
        const oldPattern = ZearoCore.permissionPatternFor(settings.baseUrl);
        const removed = await chrome.permissions.remove({ origins: [oldPattern] });
        if (!removed) {
          throw new Error("新的 API 域名已授权，但旧域名权限移除失败，设置尚未保存。");
        }
      }

      settings = { baseUrl, apiKey, model, codeMode };
      await chrome.storage.local.set({ settings });
      showWorkspace();
    } catch (error) {
      showError(settingsError, error);
    }
  });

  clearCacheButton.addEventListener("click", async () => {
    clearNotice(settingsError);
    clearNotice(settingsStatus);
    try {
      await chrome.storage.local.remove("answerCache");
      cacheCount.textContent = "0";
      showStatus(settingsStatus, "解答缓存已清除");
    } catch (error) {
      showError(settingsError, error);
    }
  });

  settingsButton.addEventListener("click", () => {
    showSettings().catch((error) => showError(settingsError, error));
  });
  cancelSettingsButton.addEventListener("click", showWorkspace);
  startButton.addEventListener("click", () => {
    runAnalysis().catch((error) => showError(workspaceError, error));
  });
  followUpButton.addEventListener("click", () => {
    clearNotice(workspaceError);
    followUpForm.hidden = false;
    document.body.classList.add("follow-up-open");
    followUpQuestion.focus();
  });
  cancelFollowUpButton.addEventListener("click", () => {
    followUpForm.hidden = true;
    followUpQuestion.value = "";
    document.body.classList.remove("follow-up-open");
  });
  followUpForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = followUpQuestion.value.trim();
    if (!question) {
      showError(workspaceError, new Error("请输入追问内容。"));
      return;
    }
    runFollowUp(question).catch((error) => showError(workspaceError, error));
  });
  copyCodeButton.addEventListener("click", () => {
    navigator.clipboard
      .writeText(renderedCode)
      .then(() => {
        copyCodeButton.textContent = "已复制";
      })
      .catch((error) => showError(workspaceError, error));
  });

  chrome.storage.local
    .get("settings")
    .then(async (stored) => {
      settings = stored.settings || null;
      if (settings && !settings.codeMode) {
        settings = { ...settings, codeMode: "oj" };
        await chrome.storage.local.set({ settings });
      }
      if (settings) {
        showWorkspace();
      } else {
        await showSettings();
      }
    })
    .catch((error) => showError(settingsError, error));
})();
