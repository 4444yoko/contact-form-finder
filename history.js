/**
 * Contact Form Finder
 * Copyright (c) 2026 Yuki Yokoyama
 * Licensed under the MIT License
 */

/**
 * history.js
 * 送信履歴ページのロジック（一覧・検索・削除）
 *
 * window.HistoryStorage（lib/storage.js）に依存
 */

const $list = document.getElementById('historyList');
const $counter = document.getElementById('counter');
const $searchInput = document.getElementById('searchInput');
const $clearAllBtn = document.getElementById('clearAllBtn');

// 全履歴データ（フィルタ前）
let allEntries = [];

document.addEventListener('DOMContentLoaded', () => {
  refresh();
  $searchInput.addEventListener('input', filterAndRender);
  $clearAllBtn.addEventListener('click', handleClearAll);
});

// ----------------------------------------------------------------------
// 履歴の再読み込み
// ----------------------------------------------------------------------
async function refresh() {
  try {
    allEntries = await HistoryStorage.list();
    updateCounter(allEntries.length);
    filterAndRender();
  } catch (err) {
    console.error('[Contact Finder] 履歴の読み込みエラー:', err);
    alert('履歴の読み込みに失敗しました: ' + err.message);
  }
}

function updateCounter(count) {
  $counter.textContent = count + ' / ' + HistoryStorage.MAX;
  $counter.className = count >= HistoryStorage.MAX ? 'counter full' : 'counter';
  $clearAllBtn.disabled = count === 0;
}

// ----------------------------------------------------------------------
// 検索フィルタ + 描画
// ----------------------------------------------------------------------
function filterAndRender() {
  const q = $searchInput.value.trim().toLowerCase();
  const filtered = q
    ? allEntries.filter((e) =>
        (e.domain || '').toLowerCase().includes(q) ||
        (e.recipientCompany || '').toLowerCase().includes(q) ||
        (e.templateTitle || '').toLowerCase().includes(q) ||
        (e.pageTitle || '').toLowerCase().includes(q)
      )
    : allEntries;
  renderList(filtered);
}

function renderList(entries) {
  $list.innerHTML = '';

  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = allEntries.length === 0
      ? 'まだ履歴がありません。「このフォームに入力」を使うと、ここに記録されます。'
      : '検索条件に一致する履歴がありません。';
    $list.appendChild(li);
    return;
  }

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'history-item';

    // ヘッダー: 日時 / ドメイン / 削除ボタン
    const head = document.createElement('div');
    head.className = 'hi-head';

    const date = document.createElement('span');
    date.className = 'hi-date';
    date.textContent = formatDateTime(entry.timestamp);

    const domain = document.createElement('span');
    domain.className = 'hi-domain';
    domain.textContent = entry.domain || '(不明なドメイン)';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'hi-delete';
    deleteBtn.textContent = '削除';
    deleteBtn.addEventListener('click', () => handleDelete(entry));

    head.appendChild(date);
    head.appendChild(domain);
    head.appendChild(deleteBtn);

    // 受信側会社名
    const recipient = document.createElement('div');
    recipient.className = 'hi-recipient';
    recipient.textContent = '宛先: ' + (entry.recipientCompany || '(不明)');

    // ページタイトル
    if (entry.pageTitle) {
      const pageTitle = document.createElement('div');
      pageTitle.className = 'hi-page-title';
      pageTitle.textContent = entry.pageTitle;
      li.appendChild(head);
      li.appendChild(recipient);
      li.appendChild(pageTitle);
    } else {
      li.appendChild(head);
      li.appendChild(recipient);
    }

    // メタ情報
    const meta = document.createElement('div');
    meta.className = 'hi-meta';
    const filledCount = (entry.filledFields || []).length;
    const skippedCount = (entry.skippedFields || []).length;
    meta.textContent =
      'テンプレート: ' + (entry.templateTitle || '(なし)') +
      ' / 入力 ' + filledCount + '項目' +
      ' / スキップ ' + skippedCount + '項目';
    li.appendChild(meta);

    // URL
    if (entry.url) {
      const url = document.createElement('a');
      url.className = 'hi-url';
      url.href = entry.url;
      url.target = '_blank';
      url.rel = 'noopener noreferrer';
      url.textContent = entry.url;
      li.appendChild(url);
    }

    $list.appendChild(li);
  });
}

// ----------------------------------------------------------------------
// 削除（個別、確認ダイアログあり）
// ----------------------------------------------------------------------
async function handleDelete(entry) {
  const message =
    'この履歴を削除しますか？\n' +
    '────────\n' +
    'ドメイン: ' + entry.domain + '\n' +
    '日時: ' + formatDateTime(entry.timestamp) + '\n' +
    '宛先: ' + (entry.recipientCompany || '(不明)') + '\n' +
    '────────\n' +
    'この操作は取り消せません。';

  if (!confirm(message)) return;

  try {
    await HistoryStorage.remove(entry.id);
    refresh();
  } catch (err) {
    console.error('[Contact Finder] 削除エラー:', err);
    alert('削除に失敗しました: ' + err.message);
  }
}

// ----------------------------------------------------------------------
// 全削除（二段階確認）
// ----------------------------------------------------------------------
async function handleClearAll() {
  if (allEntries.length === 0) return;

  const firstConfirm = confirm(
    '本当にすべての履歴 (' + allEntries.length + '件) を削除しますか？\n' +
    'この操作は取り消せません。'
  );
  if (!firstConfirm) return;

  // 二段階目: 「削除」と入力させる（誤クリック防止）
  const typed = prompt('確認のため、半角で「削除」と入力してください:');
  if (typed !== '削除') {
    alert('入力が一致しなかったため、キャンセルしました。');
    return;
  }

  try {
    await HistoryStorage.clear();
    refresh();
    alert('すべての履歴を削除しました。');
  } catch (err) {
    console.error('[Contact Finder] 全削除エラー:', err);
    alert('削除に失敗しました: ' + err.message);
  }
}

// ----------------------------------------------------------------------
// 日時整形
// ----------------------------------------------------------------------
function formatDateTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() + '/' +
    pad(d.getMonth() + 1) + '/' +
    pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' +
    pad(d.getMinutes())
  );
}
