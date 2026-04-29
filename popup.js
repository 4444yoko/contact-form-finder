/**
 * Contact Form Finder
 * Copyright (c) 2026 Yuki Yokoyama
 * Licensed under the MIT License
 */

/**
 * popup.js
 * ポップアップUIの操作とcontent scriptの注入
 *
 * 役割:
 *   1. 「このサイトで探す」: lib/finder.js を注入してリンク候補を取得
 *   2. 「このフォームに入力」: lib/autofill.js を注入してフォームに自動入力
 *   3. オプションページの起動
 *
 * 検出/入力ロジック自体は lib/ 配下のスクリプトにあります。
 *
 * 依存: lib/storage.js（TemplateStorage, SettingsStorage を window に公開）
 */

// ----------------------------------------------------------------------
// DOM要素
// ----------------------------------------------------------------------
const $findBtn = document.getElementById('findBtn');
const $autofillSection = document.getElementById('autofillSection');
const $autofillBtn = document.getElementById('autofillBtn');
const $status = document.getElementById('status');
const $warnings = document.getElementById('warnings');
const $results = document.getElementById('results');
const $picker = document.getElementById('picker');
const $pickerList = document.getElementById('pickerList');
const $pickerEmpty = document.getElementById('pickerEmpty');
const $recipientInput = document.getElementById('recipientInput');
const $cancelPickerBtn = document.getElementById('cancelPickerBtn');
const $openOptionsBtn = document.getElementById('openOptionsBtn');
const $goToOptionsLink = document.getElementById('goToOptionsLink');
const $historyBanner = document.getElementById('historyBanner');
const $historyBannerBody = document.getElementById('historyBannerBody');
const $goToHistoryLink = document.getElementById('goToHistoryLink');

// ----------------------------------------------------------------------
// 初期化
// ----------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', init);

async function init() {
  $findBtn.addEventListener('click', handleFindClick);
  $autofillBtn.addEventListener('click', handleAutofillStart);
  $cancelPickerBtn.addEventListener('click', closePicker);
  $openOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  $goToOptionsLink.addEventListener('click', () => chrome.runtime.openOptionsPage());
  $goToHistoryLink.addEventListener('click', openHistoryPage);

  // テキストエリア検出と履歴チェックを並行実行
  await Promise.all([
    detectAutofillCapability(),
    showHistoryBannerIfAny(),
  ]);
}

// 履歴ページを新しいタブで開く
function openHistoryPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
}

// ----------------------------------------------------------------------
// 起動時: 同じドメインに過去の対応履歴があればバナー表示
// ----------------------------------------------------------------------
async function showHistoryBannerIfAny() {
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.url || isUnsupportedUrl(tab.url)) return;

    const domain = HistoryStorage.extractDomain(tab.url);
    if (!domain) return;

    const matches = await HistoryStorage.findByDomain(domain);
    if (matches.length === 0) return;

    renderHistoryBanner(domain, matches);
  } catch (err) {
    console.warn('[Contact Finder] 履歴チェック失敗:', err);
  }
}

function renderHistoryBanner(domain, entries) {
  // entries は降順（新しいものが先頭）
  const latest = entries[0];
  const relative = formatRelativeDate(latest.timestamp);
  const dateStr = formatDate(latest.timestamp);
  const tplTitle = latest.templateTitle || '(テンプレートなし)';

  let body;
  if (entries.length === 1) {
    body =
      relative + '（' + dateStr + '）に対応\n' +
      'テンプレート: ' + tplTitle;
  } else {
    body =
      '合計 ' + entries.length + ' 回対応\n' +
      '最終: ' + relative + '（' + dateStr + '） - ' + tplTitle;
  }

  // textContent で改行を維持しつつ表示
  $historyBannerBody.textContent = body;
  $historyBannerBody.style.whiteSpace = 'pre-line';
  $historyBanner.classList.remove('hidden');
}

// 相対日付（今日/昨日/X日前/M月D日）
function formatRelativeDate(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diffMs = now - ts;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return '今日';
  if (diffDays === 1) return '昨日';
  if (diffDays < 30) return diffDays + '日前';
  return formatDate(ts);
}

function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
}

// ----------------------------------------------------------------------
// 起動時のフォーム検出（textareaが1つでもあれば autofill ボタンを出す）
// ----------------------------------------------------------------------
async function detectAutofillCapability() {
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id || !tab.url || isUnsupportedUrl(tab.url)) return;

    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        hasTextarea: document.querySelectorAll('textarea').length > 0,
      }),
    });
    const result = injectionResults && injectionResults[0] && injectionResults[0].result;
    if (result && result.hasTextarea) {
      $autofillSection.classList.remove('hidden');
    }
  } catch (err) {
    // 失敗してもfind機能には影響しないので静かに無視
    console.warn('[Contact Finder] フォーム検出に失敗:', err);
  }
}

// ======================================================================
// 機能1（既存）: このサイトで探す
// ======================================================================
async function handleFindClick() {
  resetUI();
  setBusy($findBtn, true, '探しています...');

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.url) {
      showStatus('ページ情報を取得できませんでした', 'error');
      return;
    }
    if (isUnsupportedUrl(tab.url)) {
      showStatus('このページでは動作しません（chrome:// やストアページなど）', 'error');
      return;
    }


    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/keywords.js', 'lib/detector.js', 'lib/finder.js'],
    });

    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (window.__cfFind ? window.__cfFind() : null),
    });
    const result = injectionResults && injectionResults[0] && injectionResults[0].result;

    if (!result) {
      showStatus('検出関数を呼び出せませんでした。ページを再読み込みしてからやり直してください。', 'error');
      return;
    }
    if (!result.ok) {
      showStatus('エラー: ' + (result.error || '不明なエラー'), 'error');
      return;
    }

    renderWarnings(result);
    renderCandidates(result.candidates);
  } catch (err) {
    console.error('[Contact Finder] 例外:', err);
    showStatus('エラー: ' + (err.message || err), 'error');
  } finally {
    setBusy($findBtn, false, 'もう一度探す');
  }
}

function renderWarnings(result) {
  const items = [];
  if (result.salesRejection && result.salesRejection.detected) {
    const detail = result.salesRejection.excerpts.map(escapeHtml).join('<br>');
    items.push(
      '<div class="warning danger">' +
        '<strong>⚠ このサイトには「営業お断り」の記載があります</strong>' +
        '<div class="warning-detail">' + detail + '</div>' +
      '</div>'
    );
  }
  if (result.captcha && result.captcha.detected) {
    const types = escapeHtml(result.captcha.types.join(', '));
    items.push(
      '<div class="warning info">' +
        '<strong>🛡 認証あり（送信時に対応が必要）</strong>' +
        '<div class="warning-detail">検出: ' + types + '</div>' +
      '</div>'
    );
  }
  $warnings.innerHTML = items.join('');
}

function renderCandidates(candidates) {
  if (!candidates || candidates.length === 0) {
    showStatus(
      '問い合わせフォームへのリンクは見つかりませんでした。サイトのトップページで再試行してみてください。',
      'empty'
    );
    return;
  }
  showStatus(candidates.length + '件の候補が見つかりました（スコア順）');

  candidates.forEach((c) => {
    const li = document.createElement('li');
    const labelParts = [];
    if (c.matchedLabels && c.matchedLabels.length) labelParts.push(c.matchedLabels.join(' / '));
    if (c.matchedUrlPatterns && c.matchedUrlPatterns.length)
      labelParts.push('URL: ' + c.matchedUrlPatterns.join(' / '));
    const labels = labelParts.length ? labelParts.join(' ・ ') : '一致情報なし';
    const footerBadge = c.inFooter ? '<span class="badge">フッター</span>' : '';
    const navBadge = c.inNav && !c.inFooter ? '<span class="badge">ナビ</span>' : '';

    li.innerHTML =
      '<div class="result-meta">' +
        '<span class="score">スコア ' + c.score + '</span>' +
        '<span class="labels">' + escapeHtml(labels) + '</span>' +
        footerBadge + navBadge +
      '</div>' +
      '<div class="result-text">' + escapeHtml(c.text || '(テキストなし)') + '</div>' +
      '<a href="' + escapeAttr(c.url) + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(c.url) +
      '</a>';
    $results.appendChild(li);
  });
}

// ======================================================================
// 機能2: フォーム自動入力
// ======================================================================
async function handleAutofillStart() {
  resetUI();
  setBusy($autofillBtn, true, 'チェック中...');

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.url || isUnsupportedUrl(tab.url)) {
      showStatus('このページでは動作しません', 'error');
      return;
    }

    // detector.js + autofill.js を注入してチェック
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/detector.js', 'lib/autofill.js'],
    });

    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (window.__cfAutofill ? window.__cfAutofill.check() : null),
    });
    const check = injectionResults && injectionResults[0] && injectionResults[0].result;

    if (!check || !check.ok) {
      showStatus('チェックに失敗: ' + (check && check.error || '不明なエラー'), 'error');
      return;
    }
    if (!check.hasForm) {
      showStatus('このページには入力可能なテキストエリアが見つかりませんでした', 'empty');
      return;
    }

    // 「営業お断り」検知時はブロック
    if (check.hasSalesRejection) {
      const excerpt = (check.salesExcerpts && check.salesExcerpts[0]) || '(該当文言)';
      alert(
        '⚠ このサイトには「営業お断り」の記載があります。\n\n' +
          '検出文言: ' + excerpt + '\n\n' +
          '営業目的でのフォーム入力はブロックされました。'
      );
      return;
    }

    // テンプレートピッカーを表示
    await openPicker(check, tab);
  } catch (err) {
    console.error('[Contact Finder] autofill 開始エラー:', err);
    showStatus('エラー: ' + (err.message || err), 'error');
  } finally {
    setBusy($autofillBtn, false, '📝 このフォームに入力');
  }
}

// ----------------------------------------------------------------------
// テンプレート選択UIを開く
// ----------------------------------------------------------------------
async function openPicker(check, tab) {
  // 受信側会社名の初期値
  $recipientInput.value = check.recipientCompany || '';

  // 検出されたフィールド情報を簡易表示
  const detected = [];
  if (check.fields.name) detected.push('お名前');
  if (check.fields.email) detected.push('メール');
  if (check.fields.company) detected.push('会社');
  if (check.fields.phone) detected.push('電話');
  if (check.fields.textarea) detected.push('本文');
  showStatus('検出されたフィールド: ' + (detected.length ? detected.join(', ') : 'なし'));

  const templates = await TemplateStorage.list();
  $pickerList.innerHTML = '';

  if (templates.length === 0) {
    $pickerList.classList.add('hidden');
    $pickerEmpty.classList.remove('hidden');
  } else {
    $pickerList.classList.remove('hidden');
    $pickerEmpty.classList.add('hidden');

    templates.forEach((tpl) => {
      const li = document.createElement('li');
      li.className = 'picker-item';

      const titleEl = document.createElement('div');
      titleEl.className = 'pi-title';
      titleEl.textContent = tpl.title;

      const previewEl = document.createElement('div');
      previewEl.className = 'pi-preview';
      previewEl.textContent = tpl.body;

      const useBtn = document.createElement('button');
      useBtn.type = 'button';
      useBtn.className = 'pi-use';
      useBtn.textContent = 'このテンプレートで入力';
      useBtn.addEventListener('click', () => handleTemplatePicked(tpl, tab));

      li.appendChild(titleEl);
      li.appendChild(previewEl);
      li.appendChild(useBtn);
      $pickerList.appendChild(li);
    });
  }

  $picker.classList.remove('hidden');
  $results.classList.add('hidden');
}

function closePicker() {
  $picker.classList.add('hidden');
  $results.classList.remove('hidden');
}

// ----------------------------------------------------------------------
// テンプレートが選択されたとき: 変数置換 → 確認 → 入力
// ----------------------------------------------------------------------
async function handleTemplatePicked(tpl, tab) {
  try {
    const recipientCompany = $recipientInput.value.trim();
    const settings = await SettingsStorage.get();

    // 本文中の変数を置換
    const body = TemplateStorage.applyVariables(tpl.body, {
      yourName: settings.yourName,
      recipientCompany: recipientCompany,
    });

    // 確認ダイアログ（操作前）
    const confirmMsg =
      '以下の内容でフォームに入力します。\n' +
      '────────────────\n' +
      'テンプレート: ' + tpl.title + '\n' +
      '宛先会社名(本文中): ' + (recipientCompany || '(未設定)') + '\n' +
      '──[フォーム欄に入る値]──\n' +
      'お名前    : ' + (settings.yourName || '(未設定 → スキップ)') + '\n' +
      'フリガナ  : ' + (settings.furigana || '(未設定 → スキップ)') + '\n' +
      'メール    : ' + (settings.email || '(未設定 → スキップ)') + '\n' +
      '電話      : ' + (settings.phone || '(未設定 → スキップ)') + '\n' +
      '郵便番号  : ' + (settings.postalCode || '(未設定 → スキップ)') + '\n' +
      '住所      : ' + (settings.address || '(未設定 → スキップ)') + '\n' +
      '会社名    : ' + (settings.companyName || '(未設定 → スキップ)') + '\n' +
      '部署名    : ' + (settings.department || '(未設定 → スキップ)') + '\n' +
      '────────────────\n' +
      '※送信ボタンは押されません。\n' +
      '※入力後の内容確認は必ず人間が行ってください。\n\n' +
      'よろしいですか？';

    if (!confirm(confirmMsg)) return;

    // 本文をクリップボードにコピー（入力できなかった時のフォールバック用）
    // user gestureが残っているうちにコピーする
    let clipboardCopied = false;
    try {
      await navigator.clipboard.writeText(body);
      clipboardCopied = true;
    } catch (clipErr) {
      console.warn('[Contact Finder] クリップボードコピー失敗:', clipErr);
    }

    // 入力実行
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (data) => (window.__cfAutofill ? window.__cfAutofill.fill(data) : null),
      args: [{ body, settings }],
    });
    const result = injectionResults && injectionResults[0] && injectionResults[0].result;

    if (!result || !result.ok) {
      const clipNote = clipboardCopied
        ? '\n\n📋 本文はクリップボードにコピー済みです。手動で貼り付けてご利用ください。'
        : '';
      alert('入力に失敗しました: ' + (result && result.error || '不明なエラー') + clipNote);
      return;
    }

    // 送信履歴に記録（失敗してもユーザー体験は妨げない）
    try {
      await HistoryStorage.add({
        domain: HistoryStorage.extractDomain(tab.url),
        url: tab.url,
        pageTitle: tab.title || '',
        recipientCompany: recipientCompany || '',
        templateId: tpl.id,
        templateTitle: tpl.title,
        filledFields: result.filled || [],
        skippedFields: result.skipped || [],
      });
    } catch (histErr) {
      console.warn('[Contact Finder] 履歴保存失敗:', histErr);
    }

    // 結果ダイアログ（操作完了後）
    const filledMsg =
      result.filled.length > 0
        ? '✅ 入力したフィールド:\n  ・' + result.filled.join('\n  ・')
        : '⚠ 入力できたフィールドはありませんでした';
    const skippedMsg =
      result.skipped.length > 0
        ? '\n\nスキップ:\n  ・' + result.skipped.join('\n  ・')
        : '';
    const clipMsg = clipboardCopied
      ? '\n\n📋 本文はクリップボードにもコピーしました。\n（入力できなかった欄には、貼り付け（Ctrl+V）で利用できます）'
      : '';
    alert(filledMsg + skippedMsg + clipMsg + '\n\n送信前に必ず内容を確認してください。');

    closePicker();
    // ポップアップを閉じてフォームに集中させる
    window.close();
  } catch (err) {
    console.error('[Contact Finder] 入力エラー:', err);
    alert('入力に失敗しました: ' + (err.message || err));
  }
}

// ======================================================================
// ユーティリティ
// ======================================================================
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0];
}

function isUnsupportedUrl(url) {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('chrome-search://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('view-source:') ||
    url.includes('chromewebstore.google.com') ||
    url.includes('chrome.google.com/webstore')
  );
}

function resetUI() {
  $status.textContent = '';
  $status.className = 'status';
  $warnings.innerHTML = '';
  $results.innerHTML = '';
  $results.classList.remove('hidden');
  closePicker();
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  if (label) btn.textContent = label;
}

function showStatus(text, type) {
  $status.textContent = text;
  $status.className = 'status' + (type ? ' ' + type : '');
}

function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
