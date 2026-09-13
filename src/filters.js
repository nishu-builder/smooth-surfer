(function installFilterSetsPage() {
  "use strict";
  const { normalizeFilterSet, BUILTIN_FILTER_SETS, FORMAT_KEYS, FORMAT_LABELS } =
    window.SmoothSurferSettings;
  const { loadFilterSets, watchFilterSets } = window.SmoothSurferStorage;
  const $ = (id) => document.getElementById(id);
  let selected = null;
  let saved = [];
  let busy = false;
  loadFilterSets()
    .then((sets) => {
      saved = sets;
      renderSaved();
    })
    .catch(() => status("Could not load sets. Reload to try again."));
  watchFilterSets((sets) => {
    saved = sets;
    renderSaved();
  });
  BUILTIN_FILTER_SETS.forEach((pack) => $("presets").append(setRow(pack)));
  $("save-set").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const button = $("save-set").querySelector("button");
    button.disabled = true;
    try {
      const name = $("set-name").value.trim();
      await send({ type: "saveFilterSet", name });
      saved = await loadFilterSets();
      renderSaved();
      const pack = saved.find((entry) => entry.name === name);
      if (pack) preview(pack);
      status("Set saved.");
    } catch (error) {
      status(error.message);
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
  $("import-set").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async () => {
    const file = $("import-file").files?.[0];
    $("import-file").value = "";
    if (!file) return;
    try {
      if (file.size > 262144) throw new Error("Choose a filter set smaller than 256 KB.");
      preview(normalizeFilterSet(JSON.parse(await file.text())));
      status("Choose the rules to add.");
    } catch (error) {
      status(error instanceof SyntaxError ? "This file is not valid JSON." : error.message);
    }
  });
  $("apply-set").addEventListener("click", async () => {
    if (!selected || busy) return;
    const criteria = [];
    const formats = {};
    $("choices")
      .querySelectorAll("input:checked")
      .forEach((input) => {
        if (input.dataset.format) formats[input.dataset.format] = true;
        else criteria.push(selected.criteria[Number(input.dataset.rule)]);
      });
    if (!criteria.length && !Object.keys(formats).length) {
      status("Select at least one rule.");
      return;
    }
    busy = true;
    $("apply-set").disabled = true;
    try {
      await send({ type: "applyFilterSet", pack: { ...selected, criteria, formats } });
      status("Selected rules added.");
    } catch (error) {
      status(error.message);
    } finally {
      busy = false;
      $("apply-set").disabled = false;
    }
  });
  $("export-set").addEventListener("click", () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(normalizeFilterSet(selected), null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smooth-surfer-${selected.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "filters"}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("Set exported.");
  });
  function status(text) {
    $("set-status").textContent = text;
  }
  function node(tag, text) {
    const result = document.createElement(tag);
    result.textContent = text;
    return result;
  }
  function setRow(pack, removable = false) {
    const row = node("div", "");
    row.className = "set-row";
    const button = node("button", pack.name);
    button.type = "button";
    button.addEventListener("click", () => preview(pack));
    row.append(button);
    if (removable) {
      const remove = node("button", "Remove");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          await send({ type: "deleteFilterSet", name: pack.name });
          saved = await loadFilterSets();
          renderSaved();
          status("Saved set removed. Active rules are unchanged.");
        } catch (error) {
          status(error.message);
          remove.disabled = false;
        }
      });
      row.append(remove);
    }
    return row;
  }
  function renderSaved() {
    $("saved-sets").replaceChildren(...saved.map((pack) => setRow(pack, true)));
    if (!saved.length) {
      const empty = node("p", "No saved sets.");
      empty.className = "help";
      $("saved-sets").append(empty);
    }
  }
  function preview(pack) {
    selected = normalizeFilterSet(pack);
    $("preview-name").textContent = selected.name;
    $("preview-help").textContent = "Select rules to add. Existing rules stay in place.";
    $("choices").replaceChildren();
    const choice = (text) => {
      const label = node("label", "");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = true;
      label.append(input, node("span", text));
      $("choices").append(label);
      return input;
    };
    selected.criteria.forEach((rule, index) => {
      choice(rule).dataset.rule = String(index);
    });
    FORMAT_KEYS.filter((key) => selected.formats[key]).forEach((key) => {
      choice(`Hide ${FORMAT_LABELS[key].toLowerCase()} on X`).dataset.format = key;
    });
    $("apply-set").disabled = false;
    $("export-set").disabled = false;
  }
  function send(message) {
    return new Promise((resolve, reject) =>
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response?.ok)
          reject(new Error(response?.error || "Could not save. Try again."));
        else resolve(response);
      })
    );
  }
})();
