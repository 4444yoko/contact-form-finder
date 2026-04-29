/**
 * Contact Form Finder
 * Copyright (c) 2026 Yuki Yokoyama
 * Licensed under the MIT License
 */

/**
 * lib/storage.js
 * chrome.storage.local を使った永続化ラッパー
 *
 * このファイルは「拡張機能の内部ページ（popup.html / options.html）」から
 * <script src="lib/storage.js"></script> で読み込んで使う想定です。
 * （content scriptとしてWebページに注入するファイルではありません）
 *
 * 機能1（テンプレート管理）で使用。
 * 後の機能（履歴、設定）でもこのファイルに追記していく予定。
 */
(function () {
  'use strict';

  // ===================================================================
  // ストレージのキー定義（衝突を避けるためプレフィックス付き）
  // ===================================================================
  const KEYS = {
    TEMPLATES: 'cf_templates',
    SETTINGS: 'cf_settings',
    HISTORY: 'cf_history',
  };

  // ===================================================================
  // 制限値
  // ===================================================================
  const LIMITS = {
    MAX_TEMPLATES: 10,
    MAX_TITLE_LENGTH: 100,
    MAX_BODY_LENGTH: 5000,
  };

  // ===================================================================
  // ID生成（時刻+ランダムで衝突しないやつ）
  // ===================================================================
  function generateId(prefix) {
    return (
      prefix +
      '_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 8)
    );
  }

  // ===================================================================
  // テンプレート管理
  // ===================================================================
  const TemplateStorage = {
    MAX: LIMITS.MAX_TEMPLATES,
    MAX_TITLE_LENGTH: LIMITS.MAX_TITLE_LENGTH,
    MAX_BODY_LENGTH: LIMITS.MAX_BODY_LENGTH,

    /**
     * 全テンプレートを取得（更新日時の降順）
     */
    async list() {
      const data = await chrome.storage.local.get(KEYS.TEMPLATES);
      const list = data[KEYS.TEMPLATES] || [];
      // 更新日時が新しいものを上に
      return list.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },

    /**
     * IDを指定して1件取得
     */
    async get(id) {
      const list = await this.list();
      return list.find((t) => t.id === id) || null;
    },

    /**
     * 新規作成 or 更新
     * template.id があれば更新、なければ新規
     * @returns 保存後のテンプレート
     */
    async save(template) {
      // バリデーション
      const title = (template.title || '').trim();
      const body = (template.body || '').trim();
      if (!title) throw new Error('タイトルは必須です');
      if (!body) throw new Error('本文は必須です');
      if (title.length > LIMITS.MAX_TITLE_LENGTH) {
        throw new Error(`タイトルは${LIMITS.MAX_TITLE_LENGTH}文字以内で入力してください`);
      }
      if (body.length > LIMITS.MAX_BODY_LENGTH) {
        throw new Error(`本文は${LIMITS.MAX_BODY_LENGTH}文字以内で入力してください`);
      }

      // 現在のリストを取得（並び順を維持するため list() ではなく直接）
      const data = await chrome.storage.local.get(KEYS.TEMPLATES);
      const templates = data[KEYS.TEMPLATES] || [];

      const now = Date.now();
      let saved;

      if (template.id) {
        // ----- 更新 -----
        const idx = templates.findIndex((t) => t.id === template.id);
        if (idx === -1) throw new Error('対象のテンプレートが見つかりませんでした');
        templates[idx] = {
          ...templates[idx],
          title,
          body,
          updatedAt: now,
        };
        saved = templates[idx];
      } else {
        // ----- 新規作成 -----
        if (templates.length >= LIMITS.MAX_TEMPLATES) {
          throw new Error(
            `テンプレートは最大${LIMITS.MAX_TEMPLATES}件までです。不要なものを削除してください。`
          );
        }
        saved = {
          id: generateId('tpl'),
          title,
          body,
          createdAt: now,
          updatedAt: now,
        };
        templates.push(saved);
      }

      await chrome.storage.local.set({ [KEYS.TEMPLATES]: templates });
      return saved;
    },

    /**
     * 指定IDのテンプレートを削除
     */
    async remove(id) {
      const data = await chrome.storage.local.get(KEYS.TEMPLATES);
      const templates = data[KEYS.TEMPLATES] || [];
      const filtered = templates.filter((t) => t.id !== id);
      if (filtered.length === templates.length) {
        // 何も削除されなかった = 元々存在しなかった（エラーにはしない）
        return false;
      }
      await chrome.storage.local.set({ [KEYS.TEMPLATES]: filtered });
      return true;
    },

    /**
     * テンプレート全件を入れ替え（インポート用）
     */
    async replaceAll(templates) {
      if (!Array.isArray(templates)) {
        throw new Error('テンプレートは配列である必要があります');
      }
      // 簡易バリデーション
      const cleaned = [];
      for (const t of templates) {
        if (!t || typeof t !== 'object') continue;
        if (!t.title || !t.body) continue;
        cleaned.push({
          id: t.id || generateId('tpl'),
          title: String(t.title).slice(0, LIMITS.MAX_TITLE_LENGTH),
          body: String(t.body).slice(0, LIMITS.MAX_BODY_LENGTH),
          createdAt: t.createdAt || Date.now(),
          updatedAt: t.updatedAt || Date.now(),
        });
      }
      if (cleaned.length > LIMITS.MAX_TEMPLATES) {
        cleaned.length = LIMITS.MAX_TEMPLATES;
      }
      await chrome.storage.local.set({ [KEYS.TEMPLATES]: cleaned });
      return cleaned;
    },
  };

  // ===================================================================
  // テンプレート変数の置換
  // body中の {会社名} {自分の名前} {本日の日付} を実値で置き換える
  // ctx = { recipientCompany, yourName, todayDate? }
  // ===================================================================
  function formatToday() {
    const d = new Date();
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  TemplateStorage.applyVariables = function (body, ctx) {
    if (!body) return '';
    const today = (ctx && ctx.todayDate) || formatToday();
    return String(body)
      // 宛先（送信先）の会社名
      .replace(/\{会社名\}/g, (ctx && ctx.recipientCompany) || '')
      // 送信者の氏名
      .replace(/\{自分の名前\}/g, (ctx && ctx.yourName) || '')
      // 本日の日付
      .replace(/\{本日の日付\}/g, today);
  };

  // ===================================================================
  // ユーザー設定（機能2の自動入力で使用、機能4で拡張予定）
  // ===================================================================
  const DEFAULT_SETTINGS = {
    yourName: '',     // 氏名（フォーム名前欄／本文の{自分の名前}）
    furigana: '',     // フリガナ（カタカナ／ひらがなどちらでもOK、送信先に合わせて自動変換）
    email: '',        // メールアドレス
    phone: '',        // 電話番号
    postalCode: '',   // 郵便番号（150-0002 / 1500002 どちらでもOK）
    address: '',      // 住所（フルテキスト、送信先のフォーム形式に合わせて自動分割）
    companyName: '',  // 自社の会社名（フォームの会社欄）
    department: '',   // 部署名（フォームの部署欄）
  };

  const SettingsStorage = {
    /**
     * 設定を取得（未設定の項目はデフォルト値で埋める）
     */
    async get() {
      const data = await chrome.storage.local.get(KEYS.SETTINGS);
      return { ...DEFAULT_SETTINGS, ...(data[KEYS.SETTINGS] || {}) };
    },

    /**
     * 設定を更新（部分更新OK）
     */
    async save(partial) {
      const current = await this.get();
      const merged = { ...current, ...partial };

      // 軽いバリデーション
      if (merged.email && !/^.+@.+\..+$/.test(merged.email)) {
        throw new Error('メールアドレスの形式が正しくありません');
      }

      await chrome.storage.local.set({ [KEYS.SETTINGS]: merged });
      return merged;
    },

    /**
     * 設定を全リセット（デフォルトに戻す）
     */
    async reset() {
      await chrome.storage.local.set({ [KEYS.SETTINGS]: { ...DEFAULT_SETTINGS } });
      return { ...DEFAULT_SETTINGS };
    },

    /**
     * 設定を全置換（インポート用）
     */
    async replaceAll(settings) {
      if (!settings || typeof settings !== 'object') {
        throw new Error('設定オブジェクトが必要です');
      }
      // 既知のキーだけを取り出す（不正キーの混入を防ぐ）
      const cleaned = { ...DEFAULT_SETTINGS };
      for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (settings[k] != null) cleaned[k] = String(settings[k]);
      }
      // メールバリデーション
      if (cleaned.email && !/^.+@.+\..+$/.test(cleaned.email)) {
        throw new Error('メールアドレスの形式が正しくありません');
      }
      await chrome.storage.local.set({ [KEYS.SETTINGS]: cleaned });
      return cleaned;
    },
  };

  // ===================================================================
  // 送信履歴
  // ===================================================================
  const MAX_HISTORY = 1000;

  // URLからドメインを抽出（先頭の www. は剥がす）
  function extractDomain(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  const HistoryStorage = {
    MAX: MAX_HISTORY,

    /**
     * URLからドメインを抽出（外部からも使えるようにヘルパーとして公開）
     */
    extractDomain,

    /**
     * 全履歴を取得（タイムスタンプ降順）
     */
    async list() {
      const data = await chrome.storage.local.get(KEYS.HISTORY);
      const entries = data[KEYS.HISTORY] || [];
      return entries
        .slice()
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    },

    /**
     * 指定ドメインの履歴のみ取得
     */
    async findByDomain(domain) {
      if (!domain) return [];
      const all = await this.list();
      const norm = String(domain).replace(/^www\./, '').toLowerCase();
      return all.filter((e) => (e.domain || '') === norm);
    },

    /**
     * 履歴を1件追加（容量超過時はFIFOで削除）
     */
    async add(entry) {
      if (!entry || !entry.domain) {
        throw new Error('domainが必要です');
      }

      const data = await chrome.storage.local.get(KEYS.HISTORY);
      let entries = data[KEYS.HISTORY] || [];

      const now = Date.now();
      const newEntry = {
        id: generateId('h'),
        // toLowerCase してから www. を剥がす（大文字 WWW. への対応）
        domain: String(entry.domain).toLowerCase().replace(/^www\./, ''),
        url: String(entry.url || ''),
        pageTitle: String(entry.pageTitle || ''),
        recipientCompany: String(entry.recipientCompany || ''),
        templateId: String(entry.templateId || ''),
        templateTitle: String(entry.templateTitle || ''),
        filledFields: Array.isArray(entry.filledFields) ? entry.filledFields.slice(0, 50) : [],
        skippedFields: Array.isArray(entry.skippedFields) ? entry.skippedFields.slice(0, 50) : [],
        timestamp: now,
        createdAt: now,
      };
      entries.push(newEntry);

      // 上限超過 → 古いものを削除
      if (entries.length > MAX_HISTORY) {
        entries.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        entries = entries.slice(-MAX_HISTORY);
      }

      await chrome.storage.local.set({ [KEYS.HISTORY]: entries });
      return newEntry;
    },

    /**
     * 履歴を1件削除
     */
    async remove(id) {
      const data = await chrome.storage.local.get(KEYS.HISTORY);
      const entries = data[KEYS.HISTORY] || [];
      const filtered = entries.filter((e) => e.id !== id);
      if (filtered.length === entries.length) return false;
      await chrome.storage.local.set({ [KEYS.HISTORY]: filtered });
      return true;
    },

    /**
     * すべての履歴を削除
     */
    async clear() {
      await chrome.storage.local.remove(KEYS.HISTORY);
    },
  };

  // ===================================================================
  // グローバル公開
  // ===================================================================
  window.TemplateStorage = TemplateStorage;
  window.SettingsStorage = SettingsStorage;
  window.HistoryStorage = HistoryStorage;
  window.CF_STORAGE_KEYS = KEYS; // 後の機能で参照する想定

})();
