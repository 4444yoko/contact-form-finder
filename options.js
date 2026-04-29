/**
 * Contact Form Finder
 * Copyright (c) 2026 Yuki Yokoyama
 * Licensed under the MIT License
 */

/**
 * options.js
 * オプションページのロジック
 *
 * 機能:
 *   - テンプレートのCRUD
 *   - ユーザー設定の load/save/reset
 *   - 住所/フリガナ/郵便番号のライブプレビュー
 *   - テンプレ編集の変数挿入ボタン
 *   - 設定とテンプレートの JSON エクスポート/インポート
 *
 * 依存: window.TemplateStorage / SettingsStorage / CFFormat
 */

// ----------------------------------------------------------------------
// DOM要素の取得
// ----------------------------------------------------------------------
const $list = document.getElementById('templateList');
const $counter = document.getElementById('counter');
const $addBtn = document.getElementById('addBtn');
const $editor = document.getElementById('editor');
const $editorTitle = document.getElementById('editorTitle');
const $titleInput = document.getElementById('titleInput');
const $bodyInput = document.getElementById('bodyInput');
const $charCount = document.getElementById('charCount');
const $saveBtn = document.getElementById('saveBtn');
const $cancelBtn = document.getElementById('cancelBtn');

// 編集中のテンプレートID（新規作成時はnull）
let editingId = null;

// ユーザー設定フォームの要素
const $settingsYourName = document.getElementById('settings-yourName');
const $settingsFurigana = document.getElementById('settings-furigana');
const $settingsEmail = document.getElementById('settings-email');
const $settingsPhone = document.getElementById('settings-phone');
const $settingsPostalCode = document.getElementById('settings-postalCode');
const $settingsAddress = document.getElementById('settings-address');
const $settingsCompany = document.getElementById('settings-companyName');
const $settingsDepartment = document.getElementById('settings-department');
const $saveSettingsBtn = document.getElementById('saveSettingsBtn');
const $resetSettingsBtn = document.getElementById('resetSettingsBtn');
const $settingsStatus = document.getElementById('settingsStatus');

// プレビュー
const $furiganaPreview = document.getElementById('furiganaPreview');
const $postalPreview = document.getElementById('postalPreview');
const $addressPreview = document.getElementById('addressPreview');

// エクスポート/インポート
const $exportBtn = document.getElementById('exportBtn');
const $importBtn = document.getElementById('importBtn');
const $importFileInput = document.getElementById('importFileInput');

// ----------------------------------------------------------------------
// 初期化
// ----------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  refresh();
  loadSettings();

  $addBtn.addEventListener('click', () => openEditor(null));
  $cancelBtn.addEventListener('click', closeEditor);
  $saveBtn.addEventListener('click', handleSave);
  $bodyInput.addEventListener('input', updateCharCount);
  $saveSettingsBtn.addEventListener('click', handleSaveSettings);
  $resetSettingsBtn.addEventListener('click', handleResetSettings);

  // ライブプレビュー
  $settingsFurigana.addEventListener('input', updateFuriganaPreview);
  $settingsPostalCode.addEventListener('input', updatePostalPreview);
  $settingsAddress.addEventListener('input', updateAddressPreview);

  // エクスポート/インポート
  $exportBtn.addEventListener('click', handleExport);
  $importBtn.addEventListener('click', () => $importFileInput.click());
  $importFileInput.addEventListener('change', handleImport);

  // 変数挿入ボタン
  document.querySelectorAll('.var-btn').forEach((btn) => {
    btn.addEventListener('click', () => insertVariable(btn.dataset.var));
  });

  // モーダル外クリック / ESC
  $editor.addEventListener('click', (e) => {
    if (e.target === $editor) closeEditor();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$editor.classList.contains('hidden')) {
      closeEditor();
    }
  });
});

// ======================================================================
// テンプレート CRUD
// ======================================================================
async function refresh() {
  try {
    const templates = await TemplateStorage.list();
    renderList(templates);
    updateCounter(templates.length);
  } catch (err) {
    console.error('[Contact Finder] テンプレート読み込みエラー:', err);
    alert('テンプレートの読み込みに失敗しました: ' + err.message);
  }
}

function renderList(templates) {
  $list.innerHTML = '';

  if (templates.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'まだテンプレートがありません。「+ 新しいテンプレートを作成」から追加してください。';
    $list.appendChild(li);
    return;
  }

  templates.forEach((tpl) => {
    const li = document.createElement('li');
    li.className = 'template-item';

    const head = document.createElement('div');
    head.className = 't-head';

    const h3 = document.createElement('h3');
    h3.textContent = tpl.title;

    const actions = document.createElement('div');
    actions.className = 't-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-btn';
    editBtn.textContent = '編集';
    editBtn.addEventListener('click', () => openEditor(tpl.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '削除';
    deleteBtn.addEventListener('click', () => handleDelete(tpl));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    head.appendChild(h3);
    head.appendChild(actions);

    const body = document.createElement('pre');
    body.className = 't-body';
    body.textContent = tpl.body;

    const meta = document.createElement('div');
    meta.className = 't-meta';
    meta.textContent = '更新: ' + formatDate(tpl.updatedAt);

    li.appendChild(head);
    li.appendChild(body);
    li.appendChild(meta);
    $list.appendChild(li);
  });
}

function updateCounter(count) {
  const max = TemplateStorage.MAX;
  $counter.textContent = count + ' / ' + max;
  $counter.className = count >= max ? 'counter full' : 'counter';
  $addBtn.disabled = count >= max;
  $addBtn.title = count >= max ? 'テンプレートは最大' + max + '件までです' : '';
}

async function openEditor(id) {
  editingId = id;
  if (id) {
    const tpl = await TemplateStorage.get(id);
    if (!tpl) {
      alert('テンプレートが見つかりませんでした。一覧を更新します。');
      refresh();
      return;
    }
    $editorTitle.textContent = 'テンプレートを編集';
    $titleInput.value = tpl.title;
    $bodyInput.value = tpl.body;
  } else {
    $editorTitle.textContent = '新しいテンプレート';
    $titleInput.value = '';
    $bodyInput.value = '';
  }
  updateCharCount();
  $editor.classList.remove('hidden');
  setTimeout(() => $titleInput.focus(), 50);
}

function closeEditor() {
  $editor.classList.add('hidden');
  editingId = null;
}

function updateCharCount() {
  const len = $bodyInput.value.length;
  const max = TemplateStorage.MAX_BODY_LENGTH;
  $charCount.textContent = len + ' / ' + max;
  $charCount.className = len > max ? 'char-count over' : 'char-count';
}

async function handleSave() {
  const title = $titleInput.value.trim();
  const body = $bodyInput.value.trim();

  if (!title) {
    alert('タイトルを入力してください');
    $titleInput.focus();
    return;
  }
  if (!body) {
    alert('本文を入力してください');
    $bodyInput.focus();
    return;
  }

  try {
    $saveBtn.disabled = true;
    await TemplateStorage.save({ id: editingId, title, body });
    alert(editingId ? 'テンプレートを更新しました' : 'テンプレートを保存しました');
    closeEditor();
    refresh();
  } catch (err) {
    console.error('[Contact Finder] 保存エラー:', err);
    alert('保存に失敗しました: ' + err.message);
  } finally {
    $saveBtn.disabled = false;
  }
}

async function handleDelete(tpl) {
  if (!confirm('「' + tpl.title + '」を削除しますか？\nこの操作は取り消せません。')) return;
  try {
    await TemplateStorage.remove(tpl.id);
    refresh();
  } catch (err) {
    console.error('[Contact Finder] 削除エラー:', err);
    alert('削除に失敗しました: ' + err.message);
  }
}

// ======================================================================
// 変数挿入（テンプレート本文のカーソル位置に挿入）
// ======================================================================
function insertVariable(text) {
  if (!text) return;
  const start = $bodyInput.selectionStart;
  const end = $bodyInput.selectionEnd;
  const before = $bodyInput.value.slice(0, start);
  const after = $bodyInput.value.slice(end);
  $bodyInput.value = before + text + after;
  // カーソルを挿入文字列の直後に
  const newPos = start + text.length;
  $bodyInput.selectionStart = $bodyInput.selectionEnd = newPos;
  $bodyInput.focus();
  updateCharCount();
}

// ======================================================================
// ユーザー設定 load/save/reset
// ======================================================================
async function loadSettings() {
  try {
    const settings = await SettingsStorage.get();
    $settingsYourName.value = settings.yourName || '';
    $settingsFurigana.value = settings.furigana || '';
    $settingsEmail.value = settings.email || '';
    $settingsPhone.value = settings.phone || '';
    $settingsPostalCode.value = settings.postalCode || '';
    $settingsAddress.value = settings.address || '';
    $settingsCompany.value = settings.companyName || '';
    $settingsDepartment.value = settings.department || '';
    // 初期表示でプレビューを反映
    updateFuriganaPreview();
    updatePostalPreview();
    updateAddressPreview();
  } catch (err) {
    console.error('[Contact Finder] 設定の読み込み失敗:', err);
    showSettingsStatus('読み込み失敗: ' + err.message, 'error');
  }
}

async function handleSaveSettings() {
  try {
    $saveSettingsBtn.disabled = true;
    showSettingsStatus('保存中...');

    await SettingsStorage.save({
      yourName: $settingsYourName.value.trim(),
      furigana: $settingsFurigana.value.trim(),
      email: $settingsEmail.value.trim(),
      phone: $settingsPhone.value.trim(),
      postalCode: $settingsPostalCode.value.trim(),
      address: $settingsAddress.value.trim(),
      companyName: $settingsCompany.value.trim(),
      department: $settingsDepartment.value.trim(),
    });

    showSettingsStatus('✓ 保存しました', 'success');
    setTimeout(() => showSettingsStatus(''), 3000);
  } catch (err) {
    console.error('[Contact Finder] 設定の保存失敗:', err);
    showSettingsStatus('保存失敗: ' + err.message, 'error');
  } finally {
    $saveSettingsBtn.disabled = false;
  }
}

async function handleResetSettings() {
  // 一段階目
  if (!confirm(
    'すべての設定（あなたの情報）を空にリセットします。\n\n' +
    '・お名前 / フリガナ\n' +
    '・メール / 電話 / 郵便番号 / 住所\n' +
    '・会社名 / 部署名\n\n' +
    'テンプレートと送信履歴はリセットされません。\n' +
    'この操作は取り消せません。'
  )) return;
  // 二段階目（誤操作防止）
  const typed = prompt('確認のため、半角で「リセット」と入力してください:');
  if (typed !== 'リセット') {
    alert('入力が一致しなかったため、キャンセルしました。');
    return;
  }
  try {
    await SettingsStorage.reset();
    await loadSettings();
    showSettingsStatus('✓ 設定をリセットしました', 'success');
    setTimeout(() => showSettingsStatus(''), 3000);
  } catch (err) {
    console.error('[Contact Finder] リセット失敗:', err);
    showSettingsStatus('リセット失敗: ' + err.message, 'error');
  }
}

function showSettingsStatus(msg, type) {
  $settingsStatus.textContent = msg;
  $settingsStatus.className = 'settings-status' + (type ? ' ' + type : '');
}

// ======================================================================
// ライブプレビュー
// ======================================================================
function updateFuriganaPreview() {
  const v = $settingsFurigana.value.trim();
  if (!v) {
    $furiganaPreview.classList.add('hidden');
    return;
  }
  const hiragana = CFFormat.toHiragana(v);
  const katakana = CFFormat.toKatakana(v);
  const split = CFFormat.splitName(v);
  $furiganaPreview.innerHTML =
    '<span class="prev-label">変換プレビュー</span> ' +
    '<span class="prev-key">ひらがな</span>' + escapeHtml(hiragana) + ' / ' +
    '<span class="prev-key">カタカナ</span>' + escapeHtml(katakana) +
    (split.first
      ? '<br><span class="prev-label">姓名分割</span> ' +
        '<span class="prev-key">姓</span>' + escapeHtml(split.last) + ' / ' +
        '<span class="prev-key">名</span>' + escapeHtml(split.first)
      : '');
  $furiganaPreview.classList.remove('hidden');
}

function updatePostalPreview() {
  const v = $settingsPostalCode.value.trim();
  if (!v) {
    $postalPreview.classList.add('hidden');
    return;
  }
  const split = CFFormat.splitPostalCode(v);
  if (!split.first) {
    $postalPreview.innerHTML =
      '<span class="prev-label">郵便番号</span> ' +
      '<span class="prev-empty">7桁の数字を入力してください（現在: ' + escapeHtml(split.digitsOnly) + '桁）</span>';
  } else {
    $postalPreview.innerHTML =
      '<span class="prev-label">分割プレビュー</span> ' +
      '<span class="prev-key">前半</span>' + escapeHtml(split.first) + ' / ' +
      '<span class="prev-key">後半</span>' + escapeHtml(split.second) + ' / ' +
      '<span class="prev-key">結合</span>' + escapeHtml(split.combined);
  }
  $postalPreview.classList.remove('hidden');
}

function updateAddressPreview() {
  const v = $settingsAddress.value.trim();
  if (!v) {
    $addressPreview.classList.add('hidden');
    return;
  }
  const parts = CFFormat.parseAddress(v);
  const fmt = (key, val) =>
    '<span class="prev-key">' + key + '</span>' +
    (val ? escapeHtml(val) : '<span class="prev-empty">(なし)</span>');
  $addressPreview.innerHTML =
    '<span class="prev-label">住所分割プレビュー</span><br>' +
    fmt('都道府県', parts.prefecture) + ' / ' +
    fmt('市区町村', parts.city) + ' / ' +
    fmt('番地', parts.street) + ' / ' +
    fmt('建物名', parts.building);
  $addressPreview.classList.remove('hidden');
}

// ======================================================================
// エクスポート / インポート
// ======================================================================
async function handleExport() {
  try {
    const settings = await SettingsStorage.get();
    const templates = await TemplateStorage.list();
    const data = {
      format: 'contact-form-finder-backup',
      version: '1.4.0',
      exportedAt: new Date().toISOString(),
      note: 'プライバシー保護のため、送信履歴はこのファイルに含まれません',
      settings,
      templates,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contact-finder-backup-' + dateStamp() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[Contact Finder] エクスポート失敗:', err);
    alert('エクスポートに失敗しました: ' + err.message);
  }
}

async function handleImport(event) {
  const file = event.target.files && event.target.files[0];
  // 同じファイルを連続で選んでも change が発火するようにリセット
  event.target.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      alert('ファイルが JSON ではありません。エクスポートしたファイルを選んでください。');
      return;
    }

    if (data.format !== 'contact-form-finder-backup') {
      alert('このファイルは Contact Form Finder のバックアップではありません。');
      return;
    }

    if (!data.settings || !Array.isArray(data.templates)) {
      alert('ファイルの内容が不正です（settings / templates が見当たりません）。');
      return;
    }

    const currentTemplates = await TemplateStorage.list();
    const msg =
      'バックアップファイルから復元しますか？\n' +
      '────────────\n' +
      'エクスポート日: ' + (data.exportedAt || '不明') + '\n' +
      'バージョン: ' + (data.version || '不明') + '\n' +
      '────────────\n' +
      '【上書きされるもの】\n' +
      '・あなたの情報（設定）: 全項目を上書き\n' +
      '・テンプレート: ' + currentTemplates.length + ' 件 → ' + data.templates.length + ' 件 に置換\n' +
      '【影響しないもの】\n' +
      '・送信履歴（このまま残ります）\n' +
      '────────────\n' +
      'この操作は取り消せません。実行しますか？';

    if (!confirm(msg)) return;

    await SettingsStorage.replaceAll(data.settings);
    await TemplateStorage.replaceAll(data.templates);

    alert('インポートが完了しました。ページを再読み込みして反映します。');
    location.reload();
  } catch (err) {
    console.error('[Contact Finder] インポート失敗:', err);
    alert('インポートに失敗しました: ' + err.message);
  }
}

function dateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
}

// ======================================================================
// ユーティリティ
// ======================================================================
function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}
