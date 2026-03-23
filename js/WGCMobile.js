(function () {
    'use strict';

    if (window.__wgWaygroundCheatBookmarklet && typeof window.__wgWaygroundCheatBookmarklet.toggleMenu === "function") {
        try { window.__wgWaygroundCheatBookmarklet.toggleMenu(); } catch {}
        return;
    }

    const getIOSVersion = () => {
        const ua = String(navigator.userAgent || "");
        const platform = String(navigator.platform || "");
        const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
        const isIPhone = /iPhone/.test(ua);
        const isIPad = /iPad/.test(ua);
        const isIPod = /iPod/.test(ua);
        const isIPadOS13Plus = platform === "MacIntel" && maxTouchPoints > 1 && /Mobile/.test(ua);
        const isIOS = isIPhone || isIPad || isIPod || isIPadOS13Plus;
        if (!isIOS) return { isIOS: false, major: 0, minor: 0, patch: 0 };
        const m = ua.match(/OS (\d+)[._](\d+)(?:[._](\d+))?/);
        const major = m ? Number(m[1]) : 0;
        const minor = m ? Number(m[2]) : 0;
        const patch = m && m[3] ? Number(m[3]) : 0;
        return {
            isIOS: true,
            major: Number.isFinite(major) ? major : 0,
            minor: Number.isFinite(minor) ? minor : 0,
            patch: Number.isFinite(patch) ? patch : 0
        };
    };

    const iosVersion = getIOSVersion();
    try { window.__wgIOSVersion = iosVersion; } catch {}

    const addStyle = (css) => {
        try {
            const id = "wg-solver-style";
            const existing = document.getElementById(id);
            if (existing) return;
            const style = document.createElement("style");
            style.id = id;
            style.textContent = String(css || "");
            (document.head || document.documentElement || document.body).appendChild(style);
        } catch {}
    };

    const USER_DEFAULTS = {
        mode: "manual",
        delayMs: 2000,
        percent: 100,
        manualKeyCode: "Equal",
        menuKeyCode: "Minus",
        showHiddenPower: false,
        autoEssentials: false,
        autoEssentialsDelayMs: 200,
        menuPosition: "top_left",
        menuOffsetPx: 20,
        customPosition: { x: 20, y: 20 }
    };

    const WG_INPUT_TYPES = new Set([
        "pointerdown", "pointermove", "pointerup", "pointerenter", "pointerleave", "pointerover", "pointerout", "pointercancel", "pointerrawupdate",
        "mousedown", "mousemove", "mouseup", "mouseenter", "mouseleave", "mouseover", "mouseout",
        "touchstart", "touchmove", "touchend", "touchcancel"
    ]);

    const wgListenerRegistry = new WeakMap();
    const wgLastPointerPos = new WeakMap();

    const wgRecordListener = (target, type, listener) => {
        if (!target || !type || !listener) return;
        let byType = wgListenerRegistry.get(target);
        if (!byType) {
            byType = new Map();
            wgListenerRegistry.set(target, byType);
        }
        let set = byType.get(type);
        if (!set) {
            set = new Set();
            byType.set(type, set);
        }
        set.add(listener);
    };

    const wgCallListeners = (target, type, evt) => {
        const byType = wgListenerRegistry.get(target);
        if (!byType) return;
        const set = byType.get(type);
        if (!set || set.size === 0) return;
        for (const listener of set) {
            try {
                if (typeof listener === "function") listener.call(target, evt);
                else if (listener && typeof listener.handleEvent === "function") listener.handleEvent.call(listener, evt);
            } catch {}
        }
    };

    const wgCallBubbling = (startTarget, type, makeEvt) => {
        let node = startTarget;
        while (node) {
            wgCallListeners(node, type, makeEvt(node, type));
            node = node.parentNode;
        }
        try { wgCallListeners(document, type, makeEvt(document, type)); } catch {}
        try { wgCallListeners(window, type, makeEvt(window, type)); } catch {}
    };

    try {
        if (!EventTarget.prototype.__wgListenerHooked) {
            Object.defineProperty(EventTarget.prototype, "__wgListenerHooked", { value: true });
            const oldAddEventListener = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, listener, options) {
                try {
                    if (WG_INPUT_TYPES.has(type)) {
                        const isCanvas = this?.tagName === "CANVAS" || this instanceof HTMLCanvasElement;
                        const isGlobal = this === window || this === document || this === document.documentElement || this === document.body;
                        const isMyCanvas = this?.id === "myCanvas";
                        if (isCanvas || isGlobal || isMyCanvas) {
                            wgRecordListener(this, type, listener);
                        }
                    }
                } catch {}
                return oldAddEventListener.call(this, type, listener, options);
            };
        }
    } catch {}

    let hookedPin = null;
    let autoLoaded = false;
    let autoLoadRequested = false;

    function findCode(obj) {
        if (!obj || typeof obj !== "object") return null;
        for (const key in obj) {
            const value = obj[key];
            if (key.toLowerCase().includes("code") && typeof value === "string") {
                if (/^\d{4,8}$/.test(value)) return value;
            }
            if (typeof value === "object") {
                const found = findCode(value);
                if (found) return found;
            }
        }
        return null;
    }

    function onPinDetected(code) {
        if (!code || hookedPin === code) return;
        hookedPin = code;

        const input = document.getElementById("wg-pin-input");
        if (input) input.value = code;

        const status = document.getElementById("wg-solver-info");
        if (status) {
            status.textContent = "🔥 Hooked PIN: " + code;
            status.style.color = "#00ff88";
        }

        autoLoaded = false;
        autoLoadRequested = true;

        const btn = document.getElementById("wg-load-btn");
        if (btn) {
            setTimeout(() => {
                if (autoLoadRequested && !autoLoaded) {
                    autoLoaded = true;
                    autoLoadRequested = false;
                    btn.click();
                }
            }, 0);
        }
    }

    const oldFetch = window.fetch;
    window.fetch = async (...args) => {
        const res = await oldFetch(...args);
        try {
            const clone = res.clone();
            const text = await clone.text();
            if (text.includes("code")) {
                try {
                    const json = JSON.parse(text);
                    const code = findCode(json);
                    if (code) onPinDetected(code);
                } catch {}
            }
        } catch {}
        return res;
    };

    const oldOpen = XMLHttpRequest.prototype.open;
    const oldSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        this._url = url;
        return oldOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
        this.addEventListener("load", function () {
            try {
                if (!this.responseText) return;
                if (this.responseText.includes("code")) {
                    const json = JSON.parse(this.responseText);
                    const code = findCode(json);
                    if (code) onPinDetected(code);
                }
            } catch {}
        });
        return oldSend.apply(this, arguments);
    };

    const OldWS = window.WebSocket;
    window.WebSocket = function (...args) {
        const ws = new OldWS(...args);
        ws.addEventListener("message", function (event) {
            try {
                const data = event.data;
                if (typeof data === "string" && data.includes("code")) {
                    const json = JSON.parse(data);
                    const code = findCode(json);
                    if (code) onPinDetected(code);
                }
            } catch {}
        });
        return ws;
    };

    addStyle(`
        #wg-solver-menu {
            position: fixed;
            z-index: 999999;
            padding: 10px 10px 12px;
            background-color: rgba(26, 27, 30, 0.85);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
            width: 320px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
            touch-action: none;
            max-height: 72vh;
            overflow-y: auto;
        }

        #wg-solver-menu.wg-hidden { display: none; }

        #wg-solver-title {
            color: white;
            font-size: 14px;
            font-weight: 800;
            margin-bottom: 2px;
            line-height: 1.35;
            cursor: move;
        }

        #wg-solver-info {
            color: rgba(255,255,255,0.85);
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 10px;
            line-height: 1.35;
        }

        #wg-solver-menu .wg-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
        }

        #wg-solver-menu .wg-row {
            display: grid;
            grid-template-columns: 110px 1fr;
            gap: 8px;
            align-items: center;
        }

        #wg-solver-menu label {
            color: rgba(255,255,255,0.82);
            font-size: 12px;
            font-weight: 600;
            user-select: none;
        }

        #wg-solver-menu select,
        #wg-solver-menu input {
            width: 100%;
            background: rgba(0,0,0,0.30);
            color: white;
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 10px;
            padding: 8px 10px;
            outline: none;
        }

        #wg-solver-menu input[type="checkbox"] {
            width: 18px;
            height: 18px;
            padding: 0;
            accent-color: #8b5cf6;
        }

        #wg-solver-menu .wg-toggle {
            display: flex;
            justify-content: flex-end;
            align-items: center;
        }

        #wg-solver-menu input:focus,
        #wg-solver-menu select:focus {
            border-color: rgba(139, 92, 246, 0.9);
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.22);
        }

        #wg-pin-row {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        #wg-pin-input {
            flex-grow: 1;
            text-align: center;
        }

        #wg-load-btn {
            background: #8b5cf6;
            border: none;
            color: white;
            border-radius: 10px;
            padding: 9px 14px;
            cursor: pointer;
            font-weight: 700;
            user-select: none;
            white-space: nowrap;
        }

        #wg-load-btn:hover { filter: brightness(1.05); }

        #wg-reset-btn {
            width: 100%;
            background: rgba(255,255,255,0.10);
            border: 1px solid rgba(255,255,255,0.14);
            color: rgba(255,255,255,0.92);
            border-radius: 10px;
            padding: 9px 14px;
            cursor: pointer;
            font-weight: 700;
            user-select: none;
        }

        #wg-reset-btn:hover { background: rgba(255,255,255,0.14); }

        #wg-solver-menu .wg-hint {
            color: rgba(255,255,255,0.65);
            font-size: 11px;
            line-height: 1.35;
            user-select: none;
            margin-top: 2px;
            white-space: pre-line;
        }

        .wg-correct-outline {
            outline: 3px solid #00ff88 !important;
            outline-offset: 2px !important;
            box-shadow: 0 0 0 3px rgba(0, 255, 136, 0.18) !important;
            border-radius: 10px !important;
        }

        .wg-hidden-power-badge { pointer-events: none !important; }
        .wg-hidden-power-badge img { display: inline-block !important; }

        #wg-menu-toggle-btn, #wg-manual-hold-btn {
            position: fixed;
            z-index: 1000000;
            width: 30px;
            height: 30px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.18);
            background: rgba(26, 27, 30, 0.72);
            color: rgba(255,255,255,0.95);
            font-weight: 900;
            font-size: 14px;
            line-height: 30px;
            text-align: center;
            padding: 0;
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
            -webkit-tap-highlight-color: transparent;
        }

        #wg-menu-toggle-btn { top: 10px; right: 10px; }
        #wg-manual-hold-btn { top: 50%; right: 10px; transform: translateY(-50%); }
        #wg-manual-hold-btn.wg-holding { background: rgba(139, 92, 246, 0.72); border-color: rgba(139, 92, 246, 0.9); }
    `);

    const cachedAnswers = new Map();
    const CONFIG_KEY = "wgSolverConfig_v1";
    const defaultConfig = { ...USER_DEFAULTS };

    const loadConfig = () => {
        try {
            const raw = localStorage.getItem(CONFIG_KEY);
            if (!raw) return { ...defaultConfig };
            const parsed = JSON.parse(raw);
            const migrated = { ...parsed };
            if (migrated.autoEssentials === undefined && migrated.autoSwarmAttack !== undefined) {
                migrated.autoEssentials = migrated.autoSwarmAttack;
            }
            if (migrated.autoEssentialsDelayMs === undefined && migrated.autoSwarmDelayMs !== undefined) {
                migrated.autoEssentialsDelayMs = migrated.autoSwarmDelayMs;
            }
            return {
                ...defaultConfig,
                ...migrated,
                mode: defaultConfig.mode,
                customPosition: { ...defaultConfig.customPosition, ...(migrated.customPosition || {}) }
            };
        } catch {
            return { ...defaultConfig };
        }
    };

    const saveConfig = (next) => {
        try {
            const { mode: _mode, ...persisted } = next || {};
            localStorage.setItem(CONFIG_KEY, JSON.stringify(persisted));
        } catch {}
    };

    const isEditableTarget = (target) => {
        if (!target) return false;
        if (target.isContentEditable) return true;
        const tag = target.tagName?.toLowerCase();
        return tag === "input" || tag === "textarea" || tag === "select";
    };

    let config = loadConfig();
    let answersLoaded = false;
    let autoSolveTimeout = null;
    let autoSolveScheduledForId = null;
    let lastAutoSolveActionAt = 0;
    let tickInterval = null;
    let manualActive = false;
    let dragging = false;
    let hiddenPowerObserver = null;
    let autoEssentialsObserver = null;
    let autoEssentialsInterval = null;
    let autoEssentialsRunning = false;
    let autoEssentialsTimeout = null;

    const questionAttempts = new Map();
    const questionStrategy = new Map();

    const cleanText = (text) => text?.replace(/<p>|<\/p>/g, '').trim().replace(/\s+/g, ' ') || '';

    async function fetchAndCacheAnswers(pin, statusDisplay) {
        statusDisplay.textContent = `🌀 Loading Answers...`;
        statusDisplay.style.color = "white";
        try {
            const response = await fetch(`https://api.quizit.online/quizizz?pin=${pin}`);
            const data = await response.json();
            const answers = data.answers || data.data?.answers;
            if (!Array.isArray(answers) || answers.length === 0) {
                statusDisplay.textContent = "❌ No Answers Found";
                statusDisplay.style.color = "#ff6b6b";
                return false;
            }
            cachedAnswers.clear();
            questionAttempts.clear();
            questionStrategy.clear();
            answers.forEach(q => {
                const id = q.id || q._id;
                if (!id) return;
                if (q.type === 'MSQ') {
                    cachedAnswers.set(id, q.answers.map(a => cleanText(a.text)));
                } else {
                    cachedAnswers.set(id, cleanText(q.answers?.[0]?.text));
                }
            });
            answersLoaded = true;
            statusDisplay.textContent = `✅ Loaded: ${cachedAnswers.size} Answers`;
            statusDisplay.style.color = "#00ff88";
            return true;
        } catch {
            statusDisplay.textContent = "❌ API Failed";
            statusDisplay.style.color = "#ff6b6b";
            return false;
        }
    }

    function getCurrentQuestionData() {
        const q = document.querySelector('[data-quesid]');
        if (!q) return null;
        const options = Array.from(document.querySelectorAll('.option'));
        const signature = options
            .slice(0, 8)
            .map(el => cleanText(el?.innerText))
            .join("\u0001");
        return { questionId: q.dataset.quesid, options, signature };
    }

    function normalizeAnswerText(text) {
        return cleanText(text)
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[“”]/g, '"')
            .replace(/[’]/g, "'")
            .replace(/[\s\u00a0]+/g, " ")
            .replace(/^[\s\W]+|[\s\W]+$/g, "")
            .trim();
    }

    function buildOptionModels(optionElements) {
        return optionElements
            .filter(Boolean)
            .map(el => {
                const rawText = cleanText(el.innerText);
                return { el, rawText, normText: normalizeAnswerText(rawText) };
            })
            .filter(o => o.normText.length > 0);
    }

    function isTextMatch(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        if (a.includes(b) || b.includes(a)) return true;
        return false;
    }

    function findMatchingOptions(answer, optionElements) {
        const answers = (Array.isArray(answer) ? answer : [answer])
            .map(a => normalizeAnswerText(a))
            .filter(Boolean);
        const options = buildOptionModels(optionElements);
        if (!answers.length || !options.length) return [];
        const matches = [];
        for (const ans of answers) {
            const exact = options.find(o => o.normText === ans);
            if (exact) {
                matches.push(exact);
                continue;
            }
            const loose = options.find(o => isTextMatch(o.normText, ans));
            if (loose) matches.push(loose);
        }
        return matches;
    }

    function clearManualOutline() {
        document.querySelectorAll(".wg-correct-outline").forEach(el => el.classList.remove("wg-correct-outline"));
    }

    function applyManualOutline(answer, data) {
        clearManualOutline();
        const matches = findMatchingOptions(answer, data.options);
        matches.forEach(m => m.el.classList.add("wg-correct-outline"));
    }

    function solveCorrect(answer, data) {
        const matches = findMatchingOptions(answer, data.options);
        matches.forEach(m => m.el.click());
    }

    function solveWrong(correctAnswer, data) {
        const options = buildOptionModels(data.options);
        if (!options.length) return;
        const correctNorms = (Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer])
            .map(a => normalizeAnswerText(a))
            .filter(Boolean);
        const wrongOptions = options.filter(o => !correctNorms.some(c => isTextMatch(o.normText, c)));
        const pool = wrongOptions.length ? wrongOptions : options;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        pick.el.click();
    }

    function getStrategyForQuestion(questionId) {
        if (questionStrategy.has(questionId)) return questionStrategy.get(questionId);
        if (config.percent === 100) {
            const strategy = { perfect: true, wrongBeforeCorrect: 0 };
            questionStrategy.set(questionId, strategy);
            return strategy;
        }
        const wrongBeforeCorrect = config.percent === 80 ? 2 : 1;
        const perfect = Math.random() < 0.5;
        const strategy = { perfect, wrongBeforeCorrect };
        questionStrategy.set(questionId, strategy);
        return strategy;
    }

    function shouldAnswerCorrect(questionId) {
        const strategy = getStrategyForQuestion(questionId);
        if (strategy.perfect) return true;
        const attempt = (questionAttempts.get(questionId) || 0) + 1;
        questionAttempts.set(questionId, attempt);
        if (attempt <= strategy.wrongBeforeCorrect) return false;
        return true;
    }

    function updateUIFromConfig() {
        const modeSelect = document.getElementById("wg-mode");
        const delayInput = document.getElementById("wg-delay");
        const percentSelect = document.getElementById("wg-percent");
        const hiddenPowerToggle = document.getElementById("wg-hidden-power");
        const autoEssentialsToggle = document.getElementById("wg-auto-essentials");
        const autoEssentialsDelayInput = document.getElementById("wg-auto-essentials-delay");
        const menuPosSelect = document.getElementById("wg-menu-position");
        if (modeSelect) modeSelect.value = config.mode;
        if (delayInput) delayInput.value = String(config.delayMs);
        if (percentSelect) percentSelect.value = String(config.percent);
        if (hiddenPowerToggle) hiddenPowerToggle.checked = !!config.showHiddenPower;
        if (autoEssentialsToggle) autoEssentialsToggle.checked = !!config.autoEssentials;
        if (autoEssentialsDelayInput) autoEssentialsDelayInput.value = String(config.autoEssentialsDelayMs ?? defaultConfig.autoEssentialsDelayMs);
        if (menuPosSelect) menuPosSelect.value = config.menuPosition;
    }

    function readConfigFromUI() {
        const mode = document.getElementById("wg-mode")?.value;
        const delayRaw = document.getElementById("wg-delay")?.value;
        const percentRaw = document.getElementById("wg-percent")?.value;
        const showHiddenPower = !!document.getElementById("wg-hidden-power")?.checked;
        const autoEssentials = !!document.getElementById("wg-auto-essentials")?.checked;
        const autoEssentialsDelayRaw = document.getElementById("wg-auto-essentials-delay")?.value;
        const menuPositionRaw = document.getElementById("wg-menu-position")?.value;

        const delayMs = Math.max(0, Number(delayRaw || config.delayMs));
        const autoEssentialsDelayMs = Math.max(0, Number(autoEssentialsDelayRaw || config.autoEssentialsDelayMs || defaultConfig.autoEssentialsDelayMs));
        const percent = [100, 90, 80].includes(Number(percentRaw)) ? Number(percentRaw) : 100;
        const allowedPositions = new Set(["top_left", "top_right", "middle_left", "middle_right", "bottom_left", "bottom_right", "custom"]);
        const menuPosition = allowedPositions.has(menuPositionRaw) ? menuPositionRaw : config.menuPosition;

        config = {
            ...config,
            mode: mode === "manual" ? "manual" : "auto",
            delayMs: Number.isFinite(delayMs) ? delayMs : defaultConfig.delayMs,
            percent,
            showHiddenPower,
            autoEssentials,
            autoEssentialsDelayMs: Number.isFinite(autoEssentialsDelayMs) ? autoEssentialsDelayMs : defaultConfig.autoEssentialsDelayMs,
            menuPosition
        };

        saveConfig(config);
    }

    function updateMenuVisibility() {
        const delayInput = document.getElementById("wg-delay");
        const percentSelect = document.getElementById("wg-percent");
        const autoEssentialsDelayInput = document.getElementById("wg-auto-essentials-delay");

        const setVisible = (el, visible) => {
            const row = el?.closest?.(".wg-row");
            if (!row) return;
            row.style.display = visible ? "grid" : "none";
        };

        setVisible(delayInput, config.mode === "auto");
        setVisible(percentSelect, config.mode === "auto");
        setVisible(autoEssentialsDelayInput, !!config.autoEssentials);
    }

    function extractBreakroomNameFromDataCy(value) {
        const prefix = "data-breakroom-item-";
        if (!value || !value.startsWith(prefix)) return null;
        return value.slice(prefix.length).trim();
    }

    function normalizeBreakroomKey(text) {
        return String(text || "")
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .replace(/[“”]/g, '"')
            .replace(/[’]/g, "'")
            .replace(/[\s\u00a0]+/g, " ")
            .trim();
    }

    function decodeHtmlEntities(text) {
        try {
            const el = document.createElement("textarea");
            el.innerHTML = String(text || "");
            return el.value;
        } catch {
            return String(text || "");
        }
    }

    const HIDDEN_POWER_STYLE = new Map([
        ["tan cong bay dan", "red"],
        ["tim thu ban can", "red"],
        ["cuoc chien vong tron", "red"],
        ["cuc tay", "green"],
        ["lavalanche", "green"],
        ["immunity", "green"],
        ["50/50", "green"]
    ]);

    function getHiddenPowerStyle(name) {
        const key = normalizeBreakroomKey(name);
        return HIDDEN_POWER_STYLE.get(key) || null;
    }

    function applyHiddenPowerBadgesInRoot(root) {
        if (!root) return;
        const targets = root.matches?.('div[data-cy^="data-breakroom-item-"]')
            ? [root]
            : Array.from(root.querySelectorAll?.('div[data-cy^="data-breakroom-item-"]') || []);

        for (const container of targets) {
            const dataCy = container.getAttribute("data-cy") || "";
            const name = extractBreakroomNameFromDataCy(dataCy);
            if (!name) continue;

            const img = container.querySelector('img[src*="https://cf.quizizz.com/img/mpThemes/kilimanjaro/images/breakroom/closed-gunny.svg"], img[src*="/breakroom/closed-gunny.svg"]');
            if (!img) continue;

            if (container.querySelector(".wg-hidden-power-badge")) continue;

            const decodedName = decodeHtmlEntities(name);
            const style = getHiddenPowerStyle(decodedName);
            if (!style) continue;

            if (container.dataset.wgHiddenPowerPrevPos === undefined) {
                container.dataset.wgHiddenPowerPrevPos = container.style.position || "";
            }
            if (!container.style.position || container.style.position === "static") {
                container.style.position = "relative";
            }

            const badge = document.createElement("div");
            badge.className = `wg-hidden-power-badge text-xxs md:text-lg absolute -top-10 md:-top-11 py-0.5 pr-2 bg-ds-dark-500-50 rounded-lg font-semibold flex items-center min-w-max ${style === "green" ? "bg-green-faded text-green-dark" : "bg-red-faded text-red-dark"}`;
            badge.style.left = "50%";
            badge.style.transform = "translateX(-50%)";

            const arrow = document.createElement("img");
            arrow.alt = "breakroom item";
            arrow.className = "w-5 h-5";
            arrow.src = style === "green"
                ? "https://cf.quizizz.com/join/img/mystic_peak/powerup-arrow.svg"
                : "https://cf.quizizz.com/join/img/mystic_peak/obstacle-arrow.svg";

            const text = document.createElement("span");
            text.textContent = decodedName;

            badge.appendChild(arrow);
            badge.appendChild(text);
            container.appendChild(badge);
        }
    }

    function removeHiddenPowerLabels() {
        document.querySelectorAll(".wg-hidden-power-badge").forEach(el => el.remove());
        document.querySelectorAll(".wg-hidden-power-label").forEach(el => el.remove());
        document.querySelectorAll('[data-wg-hidden-power-flex="1"]').forEach(container => {
            container.style.display = container.dataset.wgHiddenPowerPrevDisplay || "";
            container.style.alignItems = container.dataset.wgHiddenPowerPrevAlign || "";
            container.style.flexDirection = container.dataset.wgHiddenPowerPrevDir || "";
            delete container.dataset.wgHiddenPowerPrevDisplay;
            delete container.dataset.wgHiddenPowerPrevAlign;
            delete container.dataset.wgHiddenPowerPrevDir;
            delete container.dataset.wgHiddenPowerFlex;
        });
        document.querySelectorAll('[data-wg-hidden-power-prev-pos]').forEach(container => {
            container.style.position = container.dataset.wgHiddenPowerPrevPos || "";
            delete container.dataset.wgHiddenPowerPrevPos;
        });
    }

    function setHiddenPowerEnabled(enabled) {
        if (!enabled) {
            if (hiddenPowerObserver) {
                hiddenPowerObserver.disconnect();
                hiddenPowerObserver = null;
            }
            removeHiddenPowerLabels();
            return;
        }
        applyHiddenPowerBadgesInRoot(document.body);
        if (hiddenPowerObserver) return;
        hiddenPowerObserver = new MutationObserver((mutations) => {
            if (!config.showHiddenPower) return;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node?.nodeType === 1) applyHiddenPowerBadgesInRoot(node);
                }
            }
        });
        hiddenPowerObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    function normalizeUrl(url) {
        return String(url || "").trim().replace(/^`+|`+$/g, "");
    }

    function isMatchingPairsTileButton(btn) {
        return !!btn?.querySelector('img[src*="miniGames/matchingPairs/closed.svg"], img[src*="/miniGames/matchingPairs/closed.svg"]');
    }

    function getMatchingPairsInner(btn) {
        return btn?.querySelector(".flip-card-inner") || null;
    }

    function isTileFaceUp(inner) {
        if (!inner) return false;
        const inlineTransform = inner.style?.transform || "";
        if (inlineTransform.includes("rotateY(180deg)")) return true;
        if (inlineTransform === "none") return false;
        const styleAttr = inner.getAttribute?.("style") || "";
        if (styleAttr.includes("rotateY(180deg)")) return true;
        if (styleAttr.includes("transform: none")) return false;
        try {
            const computed = window.getComputedStyle(inner).transform;
            if (computed && computed !== "none") return true;
        } catch {}
        return false;
    }

    function getEssentialSrcFromButton(btn) {
        const essentialImg = btn?.querySelector('img[src*="cf.quizizz.com/join/img/mystic_peak/essentials/"], img[src*="/join/img/mystic_peak/essentials/"]');
        if (!essentialImg) return null;
        const src = normalizeUrl(essentialImg.getAttribute("src"));
        return src || null;
    }

    function collectSwarmTiles(root) {
        const tiles = [];
        const buttons = Array.from((root || document).querySelectorAll("button"));
        for (const btn of buttons) {
            if (!btn) continue;
            if (!isMatchingPairsTileButton(btn)) continue;
            if (btn.disabled) continue;
            if (btn.getAttribute("aria-disabled") === "true") continue;
            const inner = getMatchingPairsInner(btn);
            if (!inner) continue;
            const src = getEssentialSrcFromButton(btn);
            if (!src) continue;
            tiles.push({ btn, inner, src, faceUp: isTileFaceUp(inner) });
        }
        return tiles;
    }

    function autoEssentialsStep() {
        const tiles = collectSwarmTiles(document);
        if (!tiles.length) return;
        const faceDown = tiles.filter(t => !t.faceUp);
        if (faceDown.length === 0) return;
        const faceUp = tiles.filter(t => t.faceUp);
        const groupsFaceUp = new Map();
        for (const t of faceUp) {
            const list = groupsFaceUp.get(t.src) || [];
            list.push(t);
            groupsFaceUp.set(t.src, list);
        }
        const solvedSrc = new Set();
        for (const [src, list] of groupsFaceUp) {
            if (list.length >= 2) solvedSrc.add(src);
        }
        const unsolvedFaceUp = faceUp.filter(t => !solvedSrc.has(t.src));
        const unsolvedFaceDown = faceDown.filter(t => !solvedSrc.has(t.src));
        if (unsolvedFaceUp.length >= 2) return;
        if (!unsolvedFaceDown.length) return;
        if (unsolvedFaceUp.length === 1) {
            const open = unsolvedFaceUp[0];
            const match = unsolvedFaceDown.find(t => t.src === open.src);
            if (!match) return;
            autoEssentialsRunning = true;
            const delay = Math.max(0, Number(config.autoEssentialsDelayMs || defaultConfig.autoEssentialsDelayMs));
            setTimeout(() => {
                if (!config.autoEssentials) {
                    autoEssentialsRunning = false;
                    return;
                }
                if (!match.btn.isConnected) {
                    autoEssentialsRunning = false;
                    return;
                }
                if (isTileFaceUp(getMatchingPairsInner(match.btn))) {
                    autoEssentialsRunning = false;
                    return;
                }
                match.btn.click();
                autoEssentialsRunning = false;
            }, delay);
            return;
        }
        const groups = new Map();
        for (const t of unsolvedFaceDown) {
            const list = groups.get(t.src) || [];
            list.push(t);
            groups.set(t.src, list);
        }
        let pair = null;
        for (const [, list] of groups) {
            const usable = list.filter(t => t.btn.isConnected && !t.faceUp);
            if (usable.length >= 2) {
                pair = [usable[0], usable[1]];
                break;
            }
        }
        if (!pair) return;
        autoEssentialsRunning = true;
        const [a, b] = pair;
        a.btn.click();
        const delay = Math.max(0, Number(config.autoEssentialsDelayMs || defaultConfig.autoEssentialsDelayMs));
        setTimeout(() => {
            if (!config.autoEssentials) {
                autoEssentialsRunning = false;
                return;
            }
            if (!b.btn.isConnected) {
                autoEssentialsRunning = false;
                return;
            }
            if (isTileFaceUp(getMatchingPairsInner(b.btn))) {
                autoEssentialsRunning = false;
                return;
            }
            b.btn.click();
            autoEssentialsRunning = false;
        }, delay);
    }

    function scheduleAutoEssentialsTick(delayMs) {
        if (autoEssentialsTimeout) clearTimeout(autoEssentialsTimeout);
        autoEssentialsTimeout = setTimeout(() => {
            if (!config.autoEssentials) return;
            if (autoEssentialsRunning) return;
            autoEssentialsStep();
        }, Math.max(0, Number(delayMs)));
    }

    function setAutoEssentialsEnabled(enabled) {
        if (!enabled) {
            if (autoEssentialsObserver) {
                autoEssentialsObserver.disconnect();
                autoEssentialsObserver = null;
            }
            if (autoEssentialsInterval) {
                clearInterval(autoEssentialsInterval);
                autoEssentialsInterval = null;
            }
            if (autoEssentialsTimeout) {
                clearTimeout(autoEssentialsTimeout);
                autoEssentialsTimeout = null;
            }
            autoEssentialsRunning = false;
            return;
        }
        scheduleAutoEssentialsTick(0);
        if (!autoEssentialsInterval) {
            autoEssentialsInterval = setInterval(() => scheduleAutoEssentialsTick(0), 250);
        }
        if (!autoEssentialsObserver) {
            autoEssentialsObserver = new MutationObserver(() => scheduleAutoEssentialsTick(0));
            autoEssentialsObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        }
    }

    function applyMenuPositionFromConfig() {
        const menu = document.getElementById("wg-solver-menu");
        if (!menu) return;
        const offset = Number.isFinite(config.menuOffsetPx) ? config.menuOffsetPx : defaultConfig.menuOffsetPx;
        menu.style.transform = "none";

        if (config.menuPosition === "custom") {
            const x = Number.isFinite(config.customPosition?.x) ? config.customPosition.x : defaultConfig.customPosition.x;
            const y = Number.isFinite(config.customPosition?.y) ? config.customPosition.y : defaultConfig.customPosition.y;
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
            menu.style.right = "auto";
            menu.style.bottom = "auto";
            return;
        }

        menu.style.left = "auto";
        menu.style.top = "auto";
        menu.style.right = "auto";
        menu.style.bottom = "auto";

        if (config.menuPosition === "top_left") {
            menu.style.left = `${offset}px`;
            menu.style.top = `${offset}px`;
        } else if (config.menuPosition === "top_right") {
            menu.style.right = `${offset}px`;
            menu.style.top = `${offset}px`;
        } else if (config.menuPosition === "middle_left") {
            menu.style.left = `${offset}px`;
            menu.style.top = "50%";
            menu.style.transform = "translateY(-50%)";
        } else if (config.menuPosition === "middle_right") {
            menu.style.right = `${offset}px`;
            menu.style.top = "50%";
            menu.style.transform = "translateY(-50%)";
        } else if (config.menuPosition === "bottom_right") {
            menu.style.right = `${offset}px`;
            menu.style.bottom = `${offset}px`;
        } else {
            menu.style.left = `${offset}px`;
            menu.style.bottom = `${offset}px`;
        }
    }

    function setMenuVisible(visible) {
        const menu = document.getElementById("wg-solver-menu");
        if (!menu) return;
        if (visible) menu.classList.remove("wg-hidden");
        else menu.classList.add("wg-hidden");
    }

    function toggleMenu() {
        const menu = document.getElementById("wg-solver-menu");
        if (!menu) return;
        menu.classList.toggle("wg-hidden");
    }

    const ensureFloatingButtons = () => {
        if (document.getElementById("wg-menu-toggle-btn")) return;

        const menuBtn = document.createElement("button");
        menuBtn.id = "wg-menu-toggle-btn";
        menuBtn.type = "button";
        menuBtn.textContent = "≡";

        const manualBtn = document.createElement("button");
        manualBtn.id = "wg-manual-hold-btn";
        manualBtn.type = "button";
        manualBtn.textContent = "M";

        const stopEvent = (e) => {
            try { e.preventDefault(); } catch {}
            try { e.stopPropagation(); } catch {}
            try { e.stopImmediatePropagation(); } catch {}
        };

        menuBtn.addEventListener("click", (e) => {
            stopEvent(e);
            toggleMenu();
        }, true);

        const manualDown = (e) => {
            stopEvent(e);
            if (config.mode !== "manual") return;
            manualActive = true;
            manualBtn.classList.add("wg-holding");
            const data = getCurrentQuestionData();
            if (data) {
                const ans = cachedAnswers.get(data.questionId);
                if (ans) applyManualOutline(ans, data);
            }
            try { if (e.pointerId !== undefined) manualBtn.setPointerCapture(e.pointerId); } catch {}
        };

        const manualUp = (e) => {
            stopEvent(e);
            manualActive = false;
            manualBtn.classList.remove("wg-holding");
            clearManualOutline();
            try { if (e.pointerId !== undefined) manualBtn.releasePointerCapture(e.pointerId); } catch {}
        };

        manualBtn.addEventListener("pointerdown", manualDown, true);
        manualBtn.addEventListener("pointerup", manualUp, true);
        manualBtn.addEventListener("pointercancel", manualUp, true);
        manualBtn.addEventListener("touchstart", manualDown, { capture: true, passive: false });
        manualBtn.addEventListener("touchend", manualUp, { capture: true, passive: false });
        manualBtn.addEventListener("touchcancel", manualUp, { capture: true, passive: false });
        manualBtn.addEventListener("mousedown", manualDown, true);
        manualBtn.addEventListener("mouseup", manualUp, true);
        manualBtn.addEventListener("contextmenu", stopEvent, true);

        (document.body || document.documentElement).appendChild(menuBtn);
        (document.body || document.documentElement).appendChild(manualBtn);
    };

    function scheduleAutoSolve(questionId) {
        if (autoSolveTimeout) clearTimeout(autoSolveTimeout);
        autoSolveScheduledForId = questionId;
        autoSolveTimeout = setTimeout(() => {
            const status = document.getElementById("wg-solver-info");
            if (!status) return;
            if (!answersLoaded) return;
            if (config.mode !== "auto") return;

            const done = () => {
                autoSolveTimeout = null;
                autoSolveScheduledForId = null;
                lastAutoSolveActionAt = Date.now();
            };

            const attemptSolve = (remaining) => {
                const data = getCurrentQuestionData();
                if (!data || data.questionId !== questionId) return;
                const ans = cachedAnswers.get(data.questionId);
                if (!ans) { done(); return; }

                const answerText = Array.isArray(ans) ? ans.join(", ") : ans;
                status.textContent = "💡 " + answerText;
                status.style.color = "white";

                const matches = findMatchingOptions(ans, data.options);
                if (matches.length === 0) {
                    if (remaining <= 0) { done(); return; }
                    setTimeout(() => attemptSolve(remaining - 1), 150);
                    return;
                }

                const correct = shouldAnswerCorrect(data.questionId);
                if (correct) solveCorrect(ans, data);
                else solveWrong(ans, data);
                done();
            };

            attemptSolve(20);
        }, config.delayMs);
    }

    function tick() {
        if (!answersLoaded) return;
        const data = getCurrentQuestionData();
        if (!data) return;
        if (manualActive && config.mode === "manual") {
            const ans = cachedAnswers.get(data.questionId);
            if (ans) applyManualOutline(ans, data);
        }
        if (config.mode === "auto") {
            if (Date.now() - lastAutoSolveActionAt < 450) return;
            if (!autoSolveTimeout || autoSolveScheduledForId !== data.questionId) {
                scheduleAutoSolve(data.questionId);
            }
        }
    }

    function init() {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="wg-solver-menu" class="wg-hidden">
                <div id="wg-solver-title">Wayground Cheat</div>
                <div id="wg-solver-info">🔎 Waiting PIN...</div>
                <div class="wg-grid">
                    <div class="wg-row">
                        <label>Mode</label>
                        <select id="wg-mode">
                            <option value="manual">Manual</option>
                            <option value="auto">Auto Solve</option>
                        </select>
                    </div>

                    <div class="wg-row">
                        <label>Delay (ms)</label>
                        <input id="wg-delay" type="number" min="0" step="100" value="2000">
                    </div>

                    <div class="wg-row">
                        <label>Percent</label>
                        <select id="wg-percent">
                            <option value="100">100%</option>
                            <option value="90">90%</option>
                            <option value="80">80%</option>
                        </select>
                    </div>

                    <div class="wg-row">
                        <label>Show Hidden Power</label>
                        <div class="wg-toggle">
                            <input id="wg-hidden-power" type="checkbox">
                        </div>
                    </div>

                    <div class="wg-row">
                        <label>Auto essentials</label>
                        <div class="wg-toggle">
                            <input id="wg-auto-essentials" type="checkbox">
                        </div>
                    </div>

                    <div class="wg-row">
                        <label>Delay Auto essentials</label>
                        <input id="wg-auto-essentials-delay" type="number" min="0" step="50" value="500">
                    </div>

                    <div class="wg-row">
                        <label>Menu position</label>
                        <select id="wg-menu-position">
                            <option value="top_left">Top Left</option>
                            <option value="top_right">Top Right</option>
                            <option value="middle_left">Middle Left</option>
                            <option value="middle_right">Middle Right</option>
                            <option value="bottom_left">Bottom Left</option>
                            <option value="bottom_right">Bottom Right</option>
                            <option value="custom">Custom (Drag)</option>
                        </select>
                    </div>

                    <div class="wg-row">
                        <label>PIN</label>
                        <div id="wg-pin-row">
                            <input id="wg-pin-input" inputmode="numeric" autocomplete="off">
                            <button id="wg-load-btn">Load</button>
                        </div>
                    </div>
                </div>
                <div class="wg-row">
                    <label></label>
                    <button id="wg-reset-btn">Reset Config</button>
                </div>
                <div class="wg-hint">Menu: nút góc phải trên.\nManual: giữ nút bên phải giữa để hiện outline.</div>
            </div>
        `);

        ensureFloatingButtons();

        const btn = document.getElementById("wg-load-btn");
        const input = document.getElementById("wg-pin-input");
        const status = document.getElementById("wg-solver-info");
        const mode = document.getElementById("wg-mode");
        const delay = document.getElementById("wg-delay");
        const percent = document.getElementById("wg-percent");
        const hiddenPower = document.getElementById("wg-hidden-power");
        const autoEssentials = document.getElementById("wg-auto-essentials");
        const autoEssentialsDelay = document.getElementById("wg-auto-essentials-delay");
        const resetBtn = document.getElementById("wg-reset-btn");
        const menuPosition = document.getElementById("wg-menu-position");

        updateUIFromConfig();
        setMenuVisible(false);
        applyMenuPositionFromConfig();
        setHiddenPowerEnabled(!!config.showHiddenPower);
        setAutoEssentialsEnabled(!!config.autoEssentials);
        updateMenuVisibility();

        if (hookedPin && input) input.value = hookedPin;
        if (hookedPin && status) {
            status.textContent = "🔥 Hooked PIN: " + hookedPin;
            status.style.color = "#00ff88";
        }
        if (hookedPin) autoLoadRequested = true;

        const onAnyChange = () => {
            readConfigFromUI();
            applyMenuPositionFromConfig();
            setHiddenPowerEnabled(!!config.showHiddenPower);
            setAutoEssentialsEnabled(!!config.autoEssentials);
            updateMenuVisibility();
        };

        delay?.addEventListener("change", onAnyChange);
        percent?.addEventListener("change", onAnyChange);
        hiddenPower?.addEventListener("change", onAnyChange);
        autoEssentials?.addEventListener("change", onAnyChange);
        autoEssentialsDelay?.addEventListener("change", onAnyChange);
        menuPosition?.addEventListener("change", onAnyChange);

        resetBtn?.addEventListener("click", () => {
            try { localStorage.removeItem(CONFIG_KEY); } catch {}
            config = { ...defaultConfig };
            questionAttempts.clear();
            questionStrategy.clear();
            if (autoSolveTimeout) { clearTimeout(autoSolveTimeout); autoSolveTimeout = null; }
            autoSolveScheduledForId = null;
            lastAutoSolveActionAt = 0;
            updateUIFromConfig();
            applyMenuPositionFromConfig();
            setHiddenPowerEnabled(!!config.showHiddenPower);
            setAutoEssentialsEnabled(!!config.autoEssentials);
            updateMenuVisibility();
        });

        mode?.addEventListener("change", () => {
            const prevMode = config.mode;
            readConfigFromUI();
            applyMenuPositionFromConfig();
            updateMenuVisibility();
            if (prevMode === config.mode) return;
            if (config.mode === "auto") {
                manualActive = false;
                clearManualOutline();
                if (answersLoaded) {
                    const data = getCurrentQuestionData();
                    if (data) scheduleAutoSolve(data.questionId);
                }
            } else {
                if (autoSolveTimeout) { clearTimeout(autoSolveTimeout); autoSolveTimeout = null; }
            }
        });

        btn.onclick = async () => {
            const ok = await fetchAndCacheAnswers(input.value, status);
            if (!ok) return;
            if (tickInterval) clearInterval(tickInterval);
            tickInterval = setInterval(tick, 250);
        };

        const menu = document.getElementById("wg-solver-menu");
        const dragHandle = document.getElementById("wg-solver-title");
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        const stopDrag = () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.userSelect = "";
            saveConfig(config);
        };

        const onMouseMove = (e) => {
            if (!dragging || !menu) return;
            const rect = menu.getBoundingClientRect();
            const nextX = Math.min(Math.max(0, e.clientX - dragOffsetX), window.innerWidth - rect.width);
            const nextY = Math.min(Math.max(0, e.clientY - dragOffsetY), window.innerHeight - rect.height);
            menu.style.left = `${Math.round(nextX)}px`;
            menu.style.top = `${Math.round(nextY)}px`;
            menu.style.right = "auto";
            menu.style.bottom = "auto";
            menu.style.transform = "none";
            config.menuPosition = "custom";
            config.customPosition = { x: Math.round(nextX), y: Math.round(nextY) };
            const posSelect = document.getElementById("wg-menu-position");
            if (posSelect) posSelect.value = "custom";
        };

        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove, true);
            document.removeEventListener("mouseup", onMouseUp, true);
            stopDrag();
            updateUIFromConfig();
        };

        dragHandle?.addEventListener("mousedown", (e) => {
            if (!menu) return;
            if (e.button !== 0) return;
            if (isEditableTarget(e.target)) return;
            const rect = menu.getBoundingClientRect();
            dragging = true;
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            document.body.style.userSelect = "none";
            document.addEventListener("mousemove", onMouseMove, true);
            document.addEventListener("mouseup", onMouseUp, true);
            e.preventDefault();
            e.stopPropagation();
        });

        if (autoLoadRequested && !autoLoaded) {
            setTimeout(() => {
                const loadBtn = document.getElementById("wg-load-btn");
                if (!loadBtn) return;
                if (!autoLoadRequested || autoLoaded) return;
                autoLoaded = true;
                autoLoadRequested = false;
                loadBtn.click();
            }, 0);
        }
    }

    const boot = () => {
        if (document.getElementById("wg-solver-menu")) return;
        if (document.body) {
            init();
            return;
        }
        const observer = new MutationObserver(() => {
            if (!document.body) return;
            observer.disconnect();
            if (document.getElementById("wg-solver-menu")) return;
            init();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    };

    const api = {
        toggleMenu,
        ensureButtons: ensureFloatingButtons,
        getIOSVersion
    };
    try { window.__wgWaygroundCheatBookmarklet = api; } catch {}

    boot();
})();
