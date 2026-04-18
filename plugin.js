// ==UserScript==
// @name         腾讯会议逐字稿复制助手 (Tencent Meeting Transcript Copier)
// @namespace    https://github.com/awesome-tampermonkey
// @version      1.8.3
// @description  复制或导出腾讯会议录制页面/转写页面的完整逐字稿，并生成 AI 修复与 Notion 保存提示词。
// @author       Codex
// @match        https://meeting.tencent.com/cw/*
// @match        https://meeting.tencent.com/ct/*
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/dunhao-raymond/tencent-meeting-transcript-copier
// @supportURL   https://github.com/dunhao-raymond/tencent-meeting-transcript-copier/issues
// @updateURL    https://raw.githubusercontent.com/dunhao-raymond/tencent-meeting-transcript-copier/main/plugin.js
// @downloadURL  https://raw.githubusercontent.com/dunhao-raymond/tencent-meeting-transcript-copier/main/plugin.js
// ==/UserScript==

(function () {
    'use strict';

    const APP_ID = 'tm-transcript-exporter';
    const PANEL_POSITION_KEY = `${APP_ID}:position`;
    const AI_REPAIR_INSTRUCTION = '将上面这段会议录音转写文本修复成正常的文字和语序，修复错别字，减少语气词，重复等等，使其表达更书面，但是不能遗漏任何一个知识点';
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const css = `
        #${APP_ID} {
            position: fixed;
            right: 18px;
            top: 18px;
            z-index: 2147483647;
            width: 206px;
            padding: 10px;
            border: 1px solid rgba(17, 24, 39, 0.12);
            border-radius: 8px;
            background: #ffffff;
            box-shadow: 0 10px 30px rgba(17, 24, 39, 0.18);
            color: #111827;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 13px;
        }
        #${APP_ID} .tm-title {
            margin: -10px -10px 8px;
            padding: 10px;
            font-weight: 700;
            line-height: 1.35;
            cursor: move;
            user-select: none;
            border-bottom: 1px solid #e5e7eb;
        }
        #${APP_ID} button {
            display: block;
            width: 100%;
            min-height: 34px;
            margin: 6px 0 0;
            border: 1px solid #2563eb;
            border-radius: 6px;
            background: #ffffff;
            color: #1d4ed8;
            cursor: pointer;
            font: inherit;
            font-weight: 650;
        }
        #${APP_ID} button:hover {
            background: #2563eb;
            color: #ffffff;
        }
        #${APP_ID} .tm-muted {
            margin-top: 8px;
            color: #6b7280;
            line-height: 1.45;
            word-break: break-word;
        }
        .${APP_ID}-toast {
            position: fixed;
            z-index: 2147483647;
            max-width: 360px;
            padding: 10px 14px;
            border-radius: 6px;
            background: #111827;
            color: #ffffff;
            font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            box-shadow: 0 8px 24px rgba(17, 24, 39, 0.22);
        }
    `;

    const transcriptRowSelectors = [
        '[class*="minutes-module-row"]',
        '[class*="paragraph-module_paragraph"][data-pid]',
        '[class*="paragraph-module_detail"][data-pid]',
        '[class*="transcript"][class*="item"]',
        '[class*="subtitle"][class*="item"]',
        '[class*="sentence"][class*="item"]'
    ].join(',');

    const textSelectors = [
        '[class*="paragraph-module_sentences"]',
        '[class*="sentences"]',
        '[class*="sentence-content"]',
        '[class*="transcript-content"]',
        '[class*="content-text"]',
        '[class*="content"]'
    ].join(',');

    const speakerSelectors = [
        '[class*="paragraph-module_speaker-name"]',
        '[class*="speaker-name"]',
        '[class*="speaker"]',
        '[class*="nickname"]',
        '[class*="name"]'
    ].join(',');

    const timeSelectors = [
        '[class*="paragraph-module_p-start-time"]',
        '[class*="start-time"]',
        '[class*="name-time"]',
        '[class*="time"]'
    ].join(',');

    const timePattern = /(?:\d{1,2}:)?\d{1,2}:\d{2}/;
    const transcriptParagraphSelector = [
        '[class*="paragraph-module_paragraph"][data-pid]',
        '[class*="paragraph-module_detail"][data-pid]'
    ].join(',');

    const uiNoise = new Set([
        '复制完整逐字稿',
        '复制AI修复提示词',
        '打开Codex修复',
        '腾讯会议逐字稿',
        '会议转写助手',
        '正在收集...',
        '取消',
        '关闭'
    ]);

    function normalizeText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t\r\f\v]+/g, ' ')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function getText(element) {
        return normalizeText(element ? (element.innerText || element.textContent || '') : '');
    }

    function isBadTitleText(text) {
        if (!text) return true;
        if (text.length < 3 || text.length > 160) return true;
        if (/^(腾讯会议|Tencent Meeting|会议详情|会议录制|录制详情|逐字稿|转写|会议纪要|纪要)$/i.test(text)) return true;
        if (/您可召开|快速会议|加入会议|预定会议|共享屏幕|登录|注册|微信|手机号|验证码|复制完整逐字稿|导出|打开ChatGPT|打开Codex/.test(text)) return true;
        if (/文档标题使用会议标题|请输出一份|修复成正常|不能遗漏任何一个知识点|Notion|上面这段会议录音/.test(text)) return true;
        if (/^返回$|^分享$|^另存为$|^翻译$|^正在讲话/.test(text)) return true;
        if (/\d{4}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}/.test(text)) return true;
        if (/^[\d:：/.\-\s]+$/.test(text)) return true;
        return false;
    }

    function extractTitleFragments(text) {
        const normalized = normalizeText(text)
            .replace(/[“”]/g, '"')
            .replace(/^"+|"+$/g, '');

        if (!normalized) return [];

        const fragments = [];
        const quotedTitle = normalized.match(/会议标题\s*"?([^"\n]+(?:\n[^"\n]+)*)"?/);
        if (quotedTitle) {
            fragments.push(...extractTitleFragments(quotedTitle[1]));
        }

        const lines = normalized
            .split(/\n+/)
            .map(line => normalizeText(line.replace(/^返回\s*/, '')))
            .flatMap(line => line.split(/\s{2,}/).map(normalizeText))
            .filter(Boolean)
            .filter(line => !isBadTitleText(line))
            .filter(line => !/^\d{3}\s+\d{3}\s+\d{3}$/.test(line));

        fragments.push(...lines);

        const inlineAfterBack = normalized.match(/返回\s+([^\n]+?)(?:\s+\d{4}\s*\/|\n|$)/);
        if (inlineAfterBack) {
            const value = normalizeText(inlineAfterBack[1]);
            if (!isBadTitleText(value)) fragments.push(value);
        }

        return [...new Set(fragments)];
    }

    function addTitleCandidate(candidates, text, source, element) {
        for (const fragment of extractTitleFragments(text)) {
            const value = fragment
                .replace(/^会议主题[:：]\s*/, '')
                .replace(/^录制名称[:：]\s*/, '')
                .replace(/^标题[:：]\s*/, '')
                .replace(/\s*[-_]\s*腾讯会议.*$/, '');

            if (isBadTitleText(value)) continue;

            let score = 0;
            if (/title|subject|topic|name/i.test(source)) score += 8;
            if (/meeting|record|video|detail|file/i.test(source)) score += 6;
            if (/top-header/.test(source)) score += 28;
            if (/[：:]/.test(value)) score += 10;
            if (/\d/.test(value)) score += 6;
            if (/[（(].+[）)]/.test(value)) score += 4;
            if (/[a-zA-Z]/.test(value)) score += 3;
            if (/第.+节|基础|课程|python|课|讲/i.test(value)) score += 10;
            if (element) {
                const rect = element.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) score += 2;
                if (rect.top >= 0 && rect.top < 90 && rect.left >= 0 && rect.left < 720) score += 26;
                if (rect.top >= 0 && rect.top < window.innerHeight * 0.7) score += 2;
                const className = String(element.className || '');
                if (/subject|title|topic|name/i.test(className)) score += 4;
            }
            if (value.length >= 8 && value.length <= 80) score += 3;

            candidates.push({ value, score, source });
        }
    }

    function getMeetingTitle() {
        const exactTitleSelectors = [
            '[class*="title-with-edit"] [class*="subject"]',
            '[class*="meeting-main-subject"] [class*="title-with-edit"] [class*="subject"]',
            '[class*="subject-container"] [class*="title-with-edit"] [class*="subject"]'
        ];

        for (const selector of exactTitleSelectors) {
            const titleElement = document.querySelector(selector);
            const title = getText(titleElement);
            if (!isBadTitleText(title)) return title;
        }

        const candidates = [];
        const selectors = [
            '.meeting-main-subject .subject',
            '.meeting-subject',
            '.meeting-title',
            '[class*="meeting"][class*="title"]',
            '[class*="record"][class*="title"]',
            '[class*="record"][class*="name"]',
            '[class*="video"][class*="title"]',
            '[class*="video"][class*="name"]',
            '[class*="detail"][class*="title"]',
            '[class*="file"][class*="name"]',
            '[class*="topic"]',
            '[class*="subject"]',
            'h1',
            'h2'
        ];

        addTitleCandidate(candidates, document.title, 'document.title');

        document.querySelectorAll('meta[property="og:title"], meta[name="title"]').forEach(meta => {
            addTitleCandidate(candidates, meta.getAttribute('content'), 'meta:title');
        });

        for (const selector of selectors) {
            document.querySelectorAll(selector).forEach(element => {
                addTitleCandidate(candidates, getText(element), selector, element);
                addTitleCandidate(candidates, element.getAttribute('title'), `${selector}@title`, element);
                addTitleCandidate(candidates, element.getAttribute('aria-label'), `${selector}@aria-label`, element);
            });
        }

        document.querySelectorAll('body *').forEach(element => {
            const rect = element.getBoundingClientRect();
            if (rect.top < 0 || rect.top > 92 || rect.left < 0 || rect.left > 760) return;
            const text = getText(element);
            if (!text || text.length > 260) return;
            addTitleCandidate(candidates, text, 'top-header-layout', element);
        });

        candidates.sort((a, b) => b.score - a.score || b.value.length - a.value.length);
        return candidates[0]?.value || '腾讯会议逐字稿';
    }

    function getRecordingTime() {
        const selectors = [
            '.meeting-begin-time-in-date',
            '[class*="begin-time"]',
            '[class*="record"][class*="time"]',
            '[class*="meeting"][class*="time"]'
        ];

        for (const selector of selectors) {
            const text = getText(document.querySelector(selector));
            if (text) return text;
        }

        return new Date().toLocaleString('zh-CN');
    }

    function showToast(message, type = 'info') {
        const old = document.querySelector(`.${APP_ID}-toast`);
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.className = `${APP_ID}-toast`;
        toast.textContent = message;
        if (type === 'success') toast.style.background = '#047857';
        if (type === 'error') toast.style.background = '#b91c1c';
        document.body.appendChild(toast);
        positionToast(toast);
        setTimeout(() => toast.remove(), type === 'error' ? 5200 : 3200);
    }

    function positionToast(toast = document.querySelector(`.${APP_ID}-toast`)) {
        if (!toast) return;

        const panel = document.getElementById(APP_ID);
        if (!panel) {
            toast.style.left = '18px';
            toast.style.top = '18px';
            return;
        }

        const gap = 8;
        const margin = 8;
        const panelRect = panel.getBoundingClientRect();
        const toastWidth = Math.min(360, Math.max(220, panelRect.width));
        toast.style.width = `${toastWidth}px`;

        const toastRect = toast.getBoundingClientRect();
        const left = Math.min(
            Math.max(margin, panelRect.left),
            Math.max(margin, window.innerWidth - toastRect.width - margin)
        );
        const belowTop = panelRect.bottom + gap;
        const aboveTop = panelRect.top - toastRect.height - gap;
        const top = belowTop + toastRect.height + margin <= window.innerHeight
            ? belowTop
            : Math.max(margin, aboveTop);

        toast.style.left = `${left}px`;
        toast.style.top = `${top}px`;
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.cssText = 'position:fixed;left:-9999px;top:0;';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand('copy');
            textarea.remove();
            return ok;
        }
    }

    function isVisible(element) {
        if (!element || element.nodeType !== 1) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }

    function findTextCandidate(row) {
        const candidates = Array.from(row.querySelectorAll(textSelectors))
            .map(element => ({ element, text: getText(element) }))
            .filter(item => item.text && !uiNoise.has(item.text));

        candidates.sort((a, b) => b.text.length - a.text.length);
        return candidates[0]?.text || '';
    }

    function findSpeaker(row, fullText, transcriptText) {
        const candidates = Array.from(row.querySelectorAll(speakerSelectors))
            .map(getText)
            .filter(text => text && text.length <= 40 && text !== transcriptText && !timePattern.test(text));

        if (candidates[0]) return candidates[0];

        const lines = fullText.split('\n').map(normalizeText).filter(Boolean);
        const firstUseful = lines.find(line => line.length <= 40 && !timePattern.test(line) && line !== transcriptText);
        return firstUseful || '未知发言人';
    }

    function findTime(row, fullText) {
        const explicit = Array.from(row.querySelectorAll(timeSelectors))
            .map(getText)
            .find(text => timePattern.test(text));
        return (explicit || fullText).match(timePattern)?.[0] || '';
    }

    function textFromLines(fullText, speaker, time) {
        const lines = fullText
            .split('\n')
            .map(normalizeText)
            .filter(Boolean)
            .filter(line => line !== speaker)
            .filter(line => line !== time)
            .filter(line => !uiNoise.has(line));

        const cleaned = lines
            .map(line => normalizeText(line.replace(timePattern, '')))
            .filter(Boolean);

        if (cleaned.length <= 1) return cleaned[0] || '';
        return cleaned.slice(-Math.min(cleaned.length, 3)).join('\n');
    }

    function cleanTranscriptText(text, speaker, time) {
        const lines = normalizeText(text)
            .split('\n')
            .map(normalizeText)
            .filter(Boolean)
            .filter(line => line !== speaker)
            .filter(line => line !== time)
            .filter(line => !uiNoise.has(line))
            .map(line => normalizeText(line.replace(timePattern, '')))
            .filter(Boolean);

        return lines.join('\n');
    }

    function hasTranscriptDomShape(row) {
        const className = String(row.className || '');
        const paragraph = getTranscriptParagraph(row);

        if (/minutes-module-row/.test(className)) return Boolean(paragraph);
        if (paragraph === row) return true;

        const hasSpeakerNode = Boolean(row.querySelector(speakerSelectors));
        const hasTimeNode = Array.from(row.querySelectorAll(timeSelectors)).some(element => timePattern.test(getText(element)));
        const hasSentenceNode = Boolean(row.querySelector(textSelectors));

        return hasSentenceNode && (hasSpeakerNode || hasTimeNode);
    }

    function getTranscriptParagraph(row) {
        if (!row || row.nodeType !== 1) return null;
        if (row.matches?.(transcriptParagraphSelector)) return row;
        return row.querySelector?.(transcriptParagraphSelector) || null;
    }

    function parseTranscriptRow(row) {
        if (!isVisible(row)) return null;
        if (!hasTranscriptDomShape(row)) return null;

        const paragraph = getTranscriptParagraph(row);
        const source = paragraph || row;
        const fullText = getText(source);
        if (!fullText || fullText.length < 2 || uiNoise.has(fullText)) return null;
        if (/导出|复制|Markdown|HTML|TXT|正在收集/.test(fullText) && fullText.length < 80) return null;

        const time = findTime(source, fullText);
        const selectedText = findTextCandidate(source);
        const speaker = findSpeaker(source, fullText, selectedText);
        const text = cleanTranscriptText(selectedText || textFromLines(fullText, speaker, time), speaker, time);

        if (!text || text.length < 2 || uiNoise.has(text)) return null;
        if (text === speaker || text === time) return null;

        const pid = paragraph?.getAttribute('data-pid') || row.getAttribute('data-pid') || '';
        const index = row.getAttribute('data-index') || row.getAttribute('data-item-index') || '';
        const numericOrder = Number.parseInt(pid || index, 10);

        return {
            pid,
            order: Number.isFinite(numericOrder) ? numericOrder : null,
            time,
            speaker,
            text
        };
    }

    function rowKey(item) {
        if (item.pid) return `pid:${item.pid}`;
        return `${item.time}|${item.speaker}|${item.text}`.slice(0, 300);
    }

    function collectVisibleTranscript(store, root = document) {
        const rows = Array.from(root.querySelectorAll(transcriptRowSelectors));
        let added = 0;

        for (const row of rows) {
            const item = parseTranscriptRow(row);
            if (!item) continue;

            const key = rowKey(item);
            if (!store.has(key)) {
                item.firstSeen = store.size;
                store.set(key, item);
                added += 1;
            }
        }

        return added;
    }

    function scoreScrollable(element) {
        const text = getText(element).slice(0, 2000);
        const transcriptHints = (element.querySelectorAll(transcriptRowSelectors).length * 10)
            + (/逐字稿|转写|发言人|会议纪要|纪要/.test(text) ? 20 : 0)
            + (element.className && /minutes|transcript|paragraph|record|scroll/i.test(String(element.className)) ? 8 : 0);
        return transcriptHints + Math.min(20, Math.floor((element.scrollHeight - element.clientHeight) / 300));
    }

    function getScrollContainers() {
        const elements = Array.from(document.querySelectorAll('body, body *'));
        return elements
            .filter(element => {
                if (!isVisible(element)) return false;
                if (element.scrollHeight <= element.clientHeight + 20) return false;
                const style = getComputedStyle(element);
                return /(auto|scroll|overlay)/.test(`${style.overflowY}${style.overflow}`);
            })
            .map(element => ({ element, score: scoreScrollable(element) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.element);
    }

    async function clickTranscriptTab() {
        const clickableSelectors = [
            'button',
            '[role="tab"]',
            '[class*="tab"]',
            '[class*="menu"]',
            '[class*="nav"]',
            'a'
        ].join(',');

        const candidates = Array.from(document.querySelectorAll(clickableSelectors))
            .filter(isVisible)
            .filter(element => /逐字稿|转写|文字稿|转录|Transcript/i.test(getText(element)))
            .sort((a, b) => getText(a).length - getText(b).length);

        const tab = candidates[0];
        if (!tab) return false;

        tab.click();
        await sleep(900);
        return true;
    }

    async function waitForRows(timeoutMs = 10000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (document.querySelector(transcriptRowSelectors)) return true;
            await sleep(300);
        }
        return false;
    }

    async function sweepContainer(container, store) {
        const originalTop = container.scrollTop;
        const maxSteps = 500;

        container.scrollTop = 0;
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(350);

        let stagnant = 0;
        let previousTop = -1;

        for (let step = 0; step < maxSteps; step += 1) {
            const before = store.size;
            collectVisibleTranscript(store, container);

            const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
            if (container.scrollTop >= maxTop - 5) break;

            const distance = Math.max(260, Math.floor(container.clientHeight * 0.82));
            const nextTop = Math.min(maxTop, container.scrollTop + distance);

            if (nextTop === previousTop || nextTop === container.scrollTop) {
                stagnant += 1;
            } else {
                stagnant = 0;
            }
            if (stagnant > 4) break;

            previousTop = container.scrollTop;
            container.scrollTop = nextTop;
            container.dispatchEvent(new WheelEvent('wheel', { deltaY: distance, bubbles: true, cancelable: true }));
            container.dispatchEvent(new Event('scroll', { bubbles: true }));
            await sleep(store.size > before ? 120 : 220);
        }

        collectVisibleTranscript(store, container);
        container.scrollTop = originalTop;
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
    }

    async function collectTranscript() {
        const store = new Map();

        await clickTranscriptTab();
        await waitForRows();
        const containers = getScrollContainers();
        for (const container of containers) {
            collectVisibleTranscript(store, container);
        }
        for (const container of containers.slice(0, 6)) {
            await sweepContainer(container, store);
        }

        const pageScroller = document.scrollingElement || document.documentElement;
        if (pageScroller && !containers.includes(pageScroller)) {
            await sweepContainer(pageScroller, store);
        }

        const items = Array.from(store.values());
        return items.sort((a, b) => {
            if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
            if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time, 'zh-CN', { numeric: true });
            return a.firstSeen - b.firstSeen;
        });
    }

    function formatMarkdown(items) {
        const title = getMeetingTitle();
        const recordingTime = getRecordingTime();
        const exportTime = new Date().toLocaleString('zh-CN');

        let output = `# ${title}\n\n`;
        output += `**录制时间**: ${recordingTime}\n`;
        output += `**导出时间**: ${exportTime}\n`;
        output += `**内容类型**: 逐字稿\n\n`;
        output += `## 逐字稿\n\n`;

        for (const item of items) {
            const suffix = item.time ? ` (${item.time})` : '';
            output += `### ${item.speaker}${suffix}\n\n${item.text}\n\n`;
        }

        return output;
    }

    function formatPlainText(items) {
        const lines = [
            getMeetingTitle(),
            `录制时间: ${getRecordingTime()}`,
            `导出时间: ${new Date().toLocaleString('zh-CN')}`,
            '',
            '逐字稿',
            ''
        ];

        for (const item of items) {
            const suffix = item.time ? ` (${item.time})` : '';
            lines.push(`${item.speaker}${suffix}`);
            lines.push(item.text);
            lines.push('');
        }

        return lines.join('\n');
    }

    function formatRepairPrompt(items) {
        const title = getMeetingTitle();
        const transcript = formatPlainText(items);

        return `${transcript}

${AI_REPAIR_INSTRUCTION}

请输出一份修正后的完整文字稿，并自动保存到我的 Notion 中：新建一份文档，文档标题使用会议标题“${title}”。`;
    }

    async function openCodexWithPrompt(prompt) {
        const copied = await copyToClipboard(prompt);
        const url = new URL('codex://new');
        url.searchParams.set('originUrl', window.location.href);
        const encodedPrompt = encodeURIComponent(prompt);
        const canPassPromptInUrl = encodedPrompt.length <= 12000;

        if (canPassPromptInUrl) {
            url.searchParams.set('prompt', prompt);
        }

        const link = document.createElement('a');
        link.href = url.toString();
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();

        if (!copied) return '已尝试打开 Codex，但复制提示词失败';
        return canPassPromptInUrl
            ? '已复制完整提示词，并尝试在 Codex 新聊天中填入'
            : '提示词较长，已复制到剪贴板并打开 Codex 新聊天，请粘贴发送';
    }

    async function withTranscript(action) {
        try {
            showToast('正在收集完整逐字稿，请稍候...');
            const items = await collectTranscript();
            if (!items.length) {
                showToast('没有找到逐字稿。请先打开录制里的“逐字稿/转写”面板，等内容加载后再试。', 'error');
                return;
            }
            await action(items);
        } catch (error) {
            console.error('[Tencent transcript exporter]', error);
            showToast(`操作失败: ${error.message || error}`, 'error');
        }
    }

    function clampPanelPosition(left, top, panel) {
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
        const maxTop = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);

        return {
            left: Math.min(Math.max(margin, left), maxLeft),
            top: Math.min(Math.max(margin, top), maxTop)
        };
    }

    function setPanelPosition(panel, left, top, persist = true) {
        const position = clampPanelPosition(left, top, panel);
        panel.style.left = `${position.left}px`;
        panel.style.top = `${position.top}px`;
        panel.style.right = 'auto';
        positionToast();

        if (persist) {
            localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(position));
        }
    }

    function resetPanelPosition(panel) {
        panel.style.left = 'auto';
        panel.style.top = '18px';
        panel.style.right = '18px';
        localStorage.removeItem(PANEL_POSITION_KEY);
        positionToast();
    }

    function restorePanelPosition(panel) {
        try {
            const saved = JSON.parse(localStorage.getItem(PANEL_POSITION_KEY) || 'null');
            if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
                setPanelPosition(panel, saved.left, saved.top, false);
            }
        } catch (_) {
            localStorage.removeItem(PANEL_POSITION_KEY);
        }
    }

    function makePanelDraggable(panel) {
        const handle = panel.querySelector('.tm-title');
        if (!handle) return;

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        handle.title = '拖动移动面板，双击回到右上角';
        handle.addEventListener('dblclick', () => resetPanelPosition(panel));
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;

            const rect = panel.getBoundingClientRect();
            dragging = true;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            panel.setPointerCapture(event.pointerId);
            event.preventDefault();
        });

        panel.addEventListener('pointermove', event => {
            if (!dragging) return;
            setPanelPosition(panel, event.clientX - offsetX, event.clientY - offsetY, false);
        });

        panel.addEventListener('pointerup', event => {
            if (!dragging) return;
            dragging = false;
            const rect = panel.getBoundingClientRect();
            setPanelPosition(panel, rect.left, rect.top, true);
            try {
                panel.releasePointerCapture(event.pointerId);
            } catch (_) {
                // The pointer may already be released by the browser.
            }
        });

        window.addEventListener('resize', () => {
            const rect = panel.getBoundingClientRect();
            if (panel.style.left) setPanelPosition(panel, rect.left, rect.top, true);
            positionToast();
        });
    }

    function createPanel() {
        if (document.getElementById(APP_ID)) return;

        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.id = APP_ID;
        panel.innerHTML = `
            <div class="tm-title">会议转写助手</div>
            <button type="button" data-action="copy-md">复制完整逐字稿</button>
            <button type="button" data-action="copy-repair-prompt">复制AI修复提示词</button>
            <button type="button" data-action="open-codex">打开Codex修复</button>
            <div class="tm-muted">会自动切到逐字稿并滚动收集。Codex 打不开时，可直接粘贴剪贴板内容。</div>
        `;

        panel.addEventListener('click', event => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;

            const action = button.dataset.action;
            withTranscript(async items => {
                if (action === 'copy-md') {
                    const ok = await copyToClipboard(formatMarkdown(items));
                    showToast(ok ? `已复制 ${items.length} 条逐字稿` : '复制失败，请检查浏览器剪贴板权限', ok ? 'success' : 'error');
                }

                if (action === 'copy-repair-prompt') {
                    const ok = await copyToClipboard(formatRepairPrompt(items));
                    showToast(ok ? `已复制 AI 修复提示词，包含 ${items.length} 条逐字稿` : '复制失败，请检查浏览器剪贴板权限', ok ? 'success' : 'error');
                }

                if (action === 'open-codex') {
                    const message = await openCodexWithPrompt(formatRepairPrompt(items));
                    showToast(message, message.includes('失败') ? 'error' : 'success');
                }
            });
        });

        document.body.appendChild(panel);
        restorePanelPosition(panel);
        makePanelDraggable(panel);
    }

    function init() {
        createPanel();
        window.__TencentMeetingTranscriptExporter = {
            collectTranscript,
            formatMarkdown,
            formatPlainText,
            formatRepairPrompt
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1200), { once: true });
    } else {
        setTimeout(init, 1200);
    }
})();
