import js from "@eslint/js";
import prettier from "eslint-config-prettier";

const browserGlobals = {
  Blob: "readonly",
  chrome: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  document: "readonly",
  fetch: "readonly",
  localStorage: "readonly",
  MutationObserver: "readonly",
  Node: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
  window: "readonly"
};

export default [
  { ignores: [".cache/**", "dist/**", "node_modules/**"] },
  js.configs.recommended,
  prettier,
  {
    rules: {
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error"
    }
  },
  {
    // Content scripts and the popup: browser globals, classic scripts.
    files: ["src/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: {
        ...browserGlobals,
        importScripts: "readonly",
        module: "writable",
        self: "readonly"
      }
    }
  },
  {
    // Node test and tooling files.
    files: ["tests/**/*.js", "tests/**/*.mjs", "scripts/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: {
        ...browserGlobals,
        __dirname: "readonly",
        Buffer: "readonly",
        global: "writable",
        process: "readonly",
        require: "readonly",
        self: "writable",
        WebSocket: "readonly"
      }
    }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { sourceType: "commonjs" }
  }
];
