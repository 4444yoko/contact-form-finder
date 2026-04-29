/**
 * Contact Form Finder
 * Copyright (c) 2026 Yuki Yokoyama
 * Licensed under the MIT License
 */

/**
 * lib/format.js
 * 純粋なフォーマット/パース用ユーティリティ
 *
 * - chrome APIに依存しない純関数のみ
 * - popup, options, autofill 各画面から共有して使う
 * - window.CFFormat にぶら下げて公開
 */
(function () {
  'use strict';

  if (window.CFFormat) {
    return;
  }

  // -------------------------------------------------------------------
  // ひらがな ↔ カタカナ
  // -------------------------------------------------------------------
  function toHiragana(s) {
    return String(s || '').replace(/[ァ-ヶ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  }
  function toKatakana(s) {
    return String(s || '').replace(/[ぁ-ゖ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
  }
  function adjustKana(text, targetType) {
    if (!text) return '';
    if (targetType === 'hiragana') return toHiragana(text);
    if (targetType === 'katakana') return toKatakana(text);
    return text;
  }

  // -------------------------------------------------------------------
  // 名前を 姓/名 に分割
  // -------------------------------------------------------------------
  function splitName(fullName) {
    if (!fullName) return { last: '', first: '' };
    const parts = String(fullName).trim().split(/[\s　]+/).filter(Boolean);
    if (parts.length >= 2) {
      return { last: parts[0], first: parts.slice(1).join(' ') };
    }
    return { last: parts[0] || '', first: '' };
  }

  // -------------------------------------------------------------------
  // 郵便番号を分割
  // -------------------------------------------------------------------
  function splitPostalCode(code) {
    if (!code) return { first: '', second: '', combined: '', digitsOnly: '' };
    const s = String(code).trim();
    const digits = s.replace(/[^\d]/g, '');
    if (digits.length === 7) {
      return {
        first: digits.slice(0, 3),
        second: digits.slice(3),
        combined: digits.slice(0, 3) + '-' + digits.slice(3),
        digitsOnly: digits,
      };
    }
    return { first: '', second: '', combined: s, digitsOnly: digits };
  }

  // -------------------------------------------------------------------
  // 住所を分割
  // -------------------------------------------------------------------
  function parseAddress(full) {
    const result = { prefecture: '', city: '', street: '', building: '', full: '' };
    if (!full) return result;
    let s = String(full).trim();
    s = s.replace(/^〒?\s*\d{3}[\-\s]?\d{4}\s*/, '').trim();
    result.full = s;

    const prefMatch = s.match(/^(.{2,4}?[都道府県])(.*)/);
    if (!prefMatch) {
      result.street = s;
      return result;
    }
    result.prefecture = prefMatch[1];
    let rest = prefMatch[2].trim();

    const cityMatch = rest.match(/^(.+?[市区町村郡])(.*)/);
    if (!cityMatch) {
      result.street = rest;
      return result;
    }
    result.city = cityMatch[1];
    rest = cityMatch[2].trim();

    const splitIdx = rest.search(/[\s　]/);
    if (splitIdx > 0) {
      result.street = rest.slice(0, splitIdx).trim();
      result.building = rest.slice(splitIdx + 1).trim();
    } else {
      result.street = rest;
    }
    return result;
  }

  // -------------------------------------------------------------------
  // 本日の日付（テンプレート変数 {本日の日付} 用）
  // -------------------------------------------------------------------
  function formatToday() {
    const d = new Date();
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  // -------------------------------------------------------------------
  // 公開
  // -------------------------------------------------------------------
  window.CFFormat = {
    toHiragana,
    toKatakana,
    adjustKana,
    splitName,
    splitPostalCode,
    parseAddress,
    formatToday,
  };

})();
