"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const vm = require("node:vm");

require("../core.js");
const core = globalThis.ZearoCore;

test("normalizes the seven supported editor languages", () => {
  assert.equal(core.normalizeLanguage("Python3"), "Python 3");
  assert.equal(core.normalizeLanguage("Java"), "Java");
  assert.equal(core.normalizeLanguage("C++"), "C++");
  assert.equal(core.normalizeLanguage("JavaScript"), "JavaScript");
  assert.equal(core.normalizeLanguage("TypeScript"), "TypeScript");
  assert.equal(core.normalizeLanguage("Go"), "Go");
  assert.equal(core.normalizeLanguage("Rust"), "Rust");
  assert.equal(core.normalizeLanguage("Kotlin"), null);
});

test("accepts HTTPS and local HTTP base URLs", () => {
  assert.equal(core.validateBaseUrl("https://api.openai.com/"), "https://api.openai.com");
  assert.equal(core.validateBaseUrl("http://localhost:1234"), "http://localhost:1234");
  assert.equal(core.validateBaseUrl("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
  assert.throws(() => core.validateBaseUrl("http://example.com"), /HTTPS/);
  assert.throws(() => core.validateBaseUrl("https://example.com/v1"), /不要包含路径/);
});

test("builds endpoint and permission pattern", () => {
  assert.equal(
    core.endpointFor("https://api.openai.com"),
    "https://api.openai.com/v1/chat/completions"
  );
  assert.equal(core.permissionPatternFor("http://localhost:1234"), "http://localhost:1234/*");
});

test("reads a public problem description and editor language", () => {
  const nodes = {
    'a[href="/problems/two-sum/"]': { textContent: "1. 两数之和" },
    '[data-track-load="description_content"]': { innerText: "给定一个整数数组 nums。" },
    '#editor button[aria-haspopup="dialog"]': { textContent: "C++" }
  };
  const documentObject = { querySelector: (selector) => nodes[selector] || null };

  assert.deepEqual(core.readProblem(documentObject, "/problems/two-sum/description/", "leetcode.cn"), {
    site: "leetcode.cn",
    slug: "two-sum",
    title: "1. 两数之和",
    description: "给定一个整数数组 nums。",
    editorLanguage: "C++"
  });
  assert.deepEqual(core.readProblem(documentObject, "/problems/two-sum/", "leetcode.cn"), {
    site: "leetcode.cn",
    slug: "two-sum",
    title: "1. 两数之和",
    description: "给定一个整数数组 nums。",
    editorLanguage: "C++"
  });
  assert.throws(
    () => core.readProblem(documentObject, "/problems/two-sum/solutions/", "leetcode.cn"),
    /题目描述/
  );
});

test("builds distinct six-dimensional cache keys", () => {
  const problem = { site: "leetcode.cn", slug: "two-sum" };
  const settings = { baseUrl: "https://api.example.com", model: "model-a" };
  const keys = [
    core.cacheKeyFor(problem, "C++", "oj", settings),
    core.cacheKeyFor({ ...problem, site: "leetcode.com" }, "C++", "oj", settings),
    core.cacheKeyFor({ ...problem, slug: "three-sum" }, "C++", "oj", settings),
    core.cacheKeyFor(problem, "Java", "oj", settings),
    core.cacheKeyFor(problem, "C++", "standalone", settings),
    core.cacheKeyFor(problem, "C++", "oj", { ...settings, baseUrl: "https://other.example.com" }),
    core.cacheKeyFor(problem, "C++", "oj", { ...settings, model: "model-b" })
  ];
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys[0].includes("api-key"), false);
});

test("touches, replaces, and limits cached answers with LRU order", () => {
  const entries = Array.from({ length: 100 }, (_, index) => ({
    key: `key-${index}`,
    answer: { code: `code-${index}` },
    lastUsedAt: 100 - index
  }));
  const touched = core.readCachedAnswer(entries, "key-50", 200);
  assert.equal(touched.answer.code, "code-50");
  assert.equal(touched.entries[0].key, "key-50");
  assert.equal(touched.entries[0].lastUsedAt, 200);

  const replaced = core.upsertCachedAnswer(touched.entries, "key-50", { code: "new" }, 201);
  assert.equal(replaced.length, 100);
  assert.deepEqual(replaced[0].answer, { code: "new" });

  const inserted = core.upsertCachedAnswer(entries, "key-new", { code: "latest" }, 202);
  assert.equal(inserted.length, 100);
  assert.equal(inserted[0].key, "key-new");
  assert.equal(inserted.some((entry) => entry.key === "key-99"), false);
  assert.equal(core.readCachedAnswer(entries, "missing", 203), null);
});

test("builds mode-specific solution and plain-text follow-up prompts", () => {
  const problem = { title: "两数之和", description: "给定数组。" };
  const answer = { idea: "哈希表", code: "class Solution {}" };
  const ojMessages = core.buildSolutionMessages(problem, "C++", "oj");
  const standaloneMessages = core.buildSolutionMessages(problem, "C++", "standalone");
  const followUpMessages = core.buildFollowUpMessages(
    problem,
    "C++",
    "oj",
    answer,
    "为什么是 O(n)？"
  );

  assert.match(ojMessages[0].content, /Solution.*不要生成 main/);
  assert.match(standaloneMessages[0].content, /完整源文件/);
  assert.match(standaloneMessages[0].content, /main/);
  assert.match(standaloneMessages[0].content, /不要猜测 stdin/);
  assert.match(followUpMessages[0].content, /纯文本.*不使用 Markdown.*不返回 JSON/);
  assert.match(followUpMessages[1].content, /两数之和/);
  assert.match(followUpMessages[1].content, /class Solution/);
  assert.match(followUpMessages[1].content, /为什么是 O\(n\)/);
});

test("validates the fixed model answer contract", () => {
  const answer = {
    idea: "使用哈希表记录已访问元素。",
    steps: ["遍历数组", "查找补数"],
    timeComplexity: "O(n)",
    spaceComplexity: "O(n)",
    code: "class Solution {}",
    pitfalls: ["不要重复使用同一元素"]
  };
  const payload = { choices: [{ message: { content: JSON.stringify(answer) } }] };

  assert.deepEqual(core.parseChatCompletion(payload), answer);
  assert.throws(() => core.parseChatCompletion({ choices: [] }), /缺少/);
  assert.throws(
    () => core.parseChatCompletion({ choices: [{ message: { content: "not json" } }] }),
    /不是合法 JSON/
  );
  assert.throws(
    () => core.validateAnswer({ ...answer, steps: [] }),
    /steps 必须是非空字符串数组/
  );
});

test("handles mock API success and external failure paths", async () => {
  const answer = {
    idea: "使用哈希表。",
    steps: ["遍历数组"],
    timeComplexity: "O(n)",
    spaceComplexity: "O(n)",
    code: "class Solution {}",
    pitfalls: ["检查下标"]
  };
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const requestBody = JSON.parse(body);
      assert.equal(request.url, "/v1/chat/completions");
      assert.equal(request.headers.authorization, "Bearer test-key");

      if (requestBody.model === "rate-limited") {
        response.writeHead(429, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: { message: "请求过于频繁" } }));
        return;
      }
      if (requestBody.model === "invalid-json") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end("not json");
        return;
      }
      if (requestBody.model === "echo-key") {
        response.writeHead(400, { "Content-Type": "text/plain" });
        response.end("test-key is invalid");
        return;
      }
      if (requestBody.model === "follow-up") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({ choices: [{ message: { content: "哈希表让每次查找保持常数时间。" } }] })
        );
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] })
      );
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const messages = [{ role: "user", content: "test" }];

  assert.deepEqual(
    await core.requestAnswer({ baseUrl, apiKey: "test-key", model: "success" }, messages),
    answer
  );
  await assert.rejects(
    core.requestAnswer({ baseUrl, apiKey: "test-key", model: "rate-limited" }, messages),
    /429.*请求过于频繁/
  );
  assert.equal(
    await core.requestCompletion(
      { baseUrl, apiKey: "test-key", model: "follow-up" },
      messages
    ),
    "哈希表让每次查找保持常数时间。"
  );
  await assert.rejects(
    core.requestAnswer({ baseUrl, apiKey: "test-key", model: "invalid-json" }, messages),
    /响应正文不是合法 JSON/
  );
  await assert.rejects(
    core.requestAnswer({ baseUrl, apiKey: "test-key", model: "echo-key" }, messages),
    (error) => error.message.includes("[已隐藏]") && !error.message.includes("test-key")
  );

  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  await assert.rejects(
    core.requestAnswer({ baseUrl, apiKey: "test-key", model: "success" }, messages),
    /fetch failed/
  );
});

test("reinjecting the content script replaces its message listener", () => {
  const listeners = new Set();
  const context = vm.createContext({
    chrome: {
      runtime: {
        onMessage: {
          addListener: (listener) => listeners.add(listener),
          removeListener: (listener) => listeners.delete(listener)
        }
      }
    },
    ZearoCore: core,
    location: { pathname: "/problems/two-sum/", hostname: "leetcode.com" },
    document: { querySelector: () => null }
  });
  const contentScript = fs.readFileSync(require.resolve("../content.js"), "utf8");

  vm.runInContext(contentScript, context);
  const firstListener = [...listeners][0];
  vm.runInContext(contentScript, context);

  assert.equal(listeners.size, 1);
  assert.notEqual([...listeners][0], firstListener);
});
