(function (root) {
  "use strict";

  const LANGUAGES = Object.freeze({
    "python 3": "Python 3",
    python3: "Python 3",
    java: "Java",
    "c++": "C++",
    cpp: "C++",
    javascript: "JavaScript",
    typescript: "TypeScript",
    go: "Go",
    golang: "Go",
    rust: "Rust"
  });

  function normalizeLanguage(value) {
    return LANGUAGES[String(value).trim().toLowerCase()] || null;
  }

  function validateBaseUrl(value) {
    const url = new URL(String(value).trim());
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if (url.protocol !== "https:" && !localHttp) {
      throw new Error("API 地址必须使用 HTTPS；本机仅允许 localhost 或 127.0.0.1。");
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("API 地址不能包含账号、查询参数或片段。");
    }
    if (url.pathname !== "/") {
      throw new Error("Base URL 只填写协议、域名和端口，不要包含路径。");
    }

    return url.origin;
  }

  function endpointFor(baseUrl) {
    return `${baseUrl}/v1/chat/completions`;
  }

  function permissionPatternFor(baseUrl) {
    return `${new URL(baseUrl).origin}/*`;
  }

  function readProblem(documentObject, pathname, site) {
    const match = pathname.match(/^\/problems\/([^/]+)(?:\/description)?\/?$/);
    if (!match) {
      throw new Error("请打开一道公开题，并切换到“题目描述”页面。");
    }

    const slug = match[1];
    const titleLink = documentObject.querySelector(`a[href="/problems/${slug}/"]`);
    const description = documentObject.querySelector('[data-track-load="description_content"]');
    const languageButton = documentObject.querySelector('#editor button[aria-haspopup="dialog"]');

    if (!titleLink || !titleLink.textContent.trim()) {
      throw new Error("未能读取题目标题，LeetCode 页面结构可能已变化。");
    }
    if (!description || !description.innerText.trim()) {
      throw new Error("未能读取题目描述，请确认当前位于“题目描述”页面。");
    }

    return {
      site,
      slug,
      title: titleLink.textContent.trim(),
      description: description.innerText.trim(),
      editorLanguage: languageButton ? normalizeLanguage(languageButton.textContent) : null
    };
  }

  function cacheKeyFor(problem, language, codeMode, settings) {
    return JSON.stringify([
      problem.site,
      problem.slug,
      language,
      codeMode,
      settings.baseUrl,
      settings.model
    ]);
  }

  function readCachedAnswer(entries, key, now) {
    const entry = entries.find((item) => item.key === key);
    if (!entry) {
      return null;
    }

    return {
      answer: entry.answer,
      entries: [{ ...entry, lastUsedAt: now }, ...entries.filter((item) => item.key !== key)]
    };
  }

  function upsertCachedAnswer(entries, key, answer, now) {
    return [
      { key, answer, lastUsedAt: now },
      ...entries.filter((item) => item.key !== key)
    ].slice(0, 100);
  }

  function codeModeInstruction(codeMode) {
    return codeMode === "oj"
      ? "使用 OJ 快捷模式：code 字段只包含 LeetCode 编辑器要求的 Solution 类或指定函数，不要生成 main。"
      : "使用标准独立编译模式：code 字段必须是包含必要导入、数据结构、解题函数和可直接运行 main 示例的完整源文件；不要猜测 stdin 输入协议。";
  }

  function buildSolutionMessages(problem, language, codeMode) {
    return [
      {
        role: "system",
        content:
          "你是一名严谨的算法讲师。只返回一个合法 JSON 对象，不要使用 Markdown 代码围栏或添加额外文字。" +
          '对象结构必须为：{"idea":"非空字符串","steps":["非空字符串"],"timeComplexity":"非空字符串","spaceComplexity":"非空字符串","code":"非空字符串","pitfalls":["非空字符串"]}。' +
          `使用简体中文讲解和代码注释。${codeModeInstruction(codeMode)}`
      },
      {
        role: "user",
        content: `请解答以下题目。\n\n目标编程语言：${language}\n题目标题：${problem.title}\n\n题目描述：\n${problem.description}`
      }
    ];
  }

  function buildFollowUpMessages(problem, language, codeMode, answer, question) {
    return [
      {
        role: "system",
        content:
          "你是一名严谨的算法讲师。使用简体中文纯文本回答追问，保留必要换行，不使用 Markdown，不返回 JSON。"
      },
      {
        role: "user",
        content:
          `请基于当前题目与解答回答追问。\n\n编程语言：${language}\n代码模式：${codeMode}\n` +
          `题目标题：${problem.title}\n题目描述：\n${problem.description}\n\n` +
          `当前解答：\n${JSON.stringify(answer)}\n\n追问：\n${question}`
      }
    ];
  }

  function validateAnswer(answer) {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
      throw new Error("模型返回格式无效：根内容必须是 JSON 对象。");
    }

    const stringFields = ["idea", "timeComplexity", "spaceComplexity", "code"];
    for (const field of stringFields) {
      if (typeof answer[field] !== "string" || answer[field].trim() === "") {
        throw new Error(`模型返回格式无效：${field} 必须是非空字符串。`);
      }
    }

    for (const field of ["steps", "pitfalls"]) {
      if (
        !Array.isArray(answer[field]) ||
        answer[field].length === 0 ||
        answer[field].some((item) => typeof item !== "string" || item.trim() === "")
      ) {
        throw new Error(`模型返回格式无效：${field} 必须是非空字符串数组。`);
      }
    }

    return answer;
  }

  function parseAnswerContent(content) {
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("API 响应无效：缺少 choices[0].message.content。");
    }

    try {
      return validateAnswer(JSON.parse(content));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("模型返回格式无效：内容不是合法 JSON。");
      }
      throw error;
    }
  }

  function parseChatCompletion(payload) {
    return parseAnswerContent(payload?.choices?.[0]?.message?.content);
  }

  async function requestCompletion(settings, messages) {
    const response = await fetch(endpointFor(settings.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({ model: settings.model, messages })
    });

    if (!response.ok) {
      const responseText = (await response.text()).trim();
      let detail = responseText;
      if (response.headers.get("content-type")?.includes("application/json")) {
        try {
          const errorPayload = JSON.parse(responseText);
          detail = errorPayload.error?.message || responseText;
        } catch (error) {
          if (error instanceof SyntaxError) {
            throw new Error(`API 请求失败（${response.status}）：服务返回了无效的 JSON 错误信息。`);
          }
          throw error;
        }
      }
      const safeDetail = String(detail).replaceAll(settings.apiKey, "[已隐藏]");
      throw new Error(`API 请求失败（${response.status}）：${safeDetail.slice(0, 300) || "服务未返回错误信息"}`);
    }

    const responseText = await response.text();
    try {
      const payload = JSON.parse(responseText);
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim() === "") {
        throw new Error("API 响应无效：缺少 choices[0].message.content。");
      }
      return content;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("API 响应无效：响应正文不是合法 JSON。");
      }
      throw error;
    }
  }

  async function requestAnswer(settings, messages) {
    return parseAnswerContent(await requestCompletion(settings, messages));
  }

  root.ZearoCore = Object.freeze({
    buildFollowUpMessages,
    buildSolutionMessages,
    cacheKeyFor,
    codeModeInstruction,
    endpointFor,
    normalizeLanguage,
    parseChatCompletion,
    permissionPatternFor,
    readProblem,
    readCachedAnswer,
    requestAnswer,
    requestCompletion,
    upsertCachedAnswer,
    validateAnswer,
    validateBaseUrl
  });
})(globalThis);
