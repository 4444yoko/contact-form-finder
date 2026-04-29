/**
 * Contact Form Finder
 * Copyright (c) 2026 Yuki Yokoyama
 * Licensed under the MIT License
 */

/**
 * lib/autofill.js
 * 問い合わせフォームへの自動入力（content scriptとして注入）
 *
 * 公開する関数:
 *   window.__cfAutofill.check()   ... 入力可否のチェック
 *   window.__cfAutofill.fill(data) ... 実際に入力（送信はしない）
 *
 * 重要:
 *   - 送信ボタンは絶対に押しません
 *   - 値を入れた後はinput/changeイベントを発火（React/Vue等への対応）
 *   - lib/detector.js を事前に注入しておく必要があります（営業お断り検知）
 *
 * おもてなしロジック:
 *   - 苗字/名前で分かれたフォームには「お名前」設定を空白で分割して入力
 *   - フリガナはひらがな/カタカナを送信先フォームに合わせて自動変換
 *   - 郵便番号は7桁分割欄に自動分割、ハイフン要否も maxlength から判定
 *   - 住所は単独欄にも分割欄（都道府県/市区町村/番地/建物名）にも自動配分
 *   - 都道府県は <select> のプルダウンも option matching で選択
 *   - メール確認欄が複数あれば全てに同じ値を入力
 */
(function () {
  'use strict';

  if (window.__cfAutofill) {
    return;
  }

  // -------------------------------------------------------------------
  // 可視判定
  // -------------------------------------------------------------------
  function isVisible(el) {
    if (!el) return false;
    if (el.disabled || el.readOnly) return false;
    if (el.type === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity || '1') === 0
    ) {
      return false;
    }
    return true;
  }

  function areaOf(el) {
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  }

  // -------------------------------------------------------------------
  // フィールドの「識別子」を集める
  // -------------------------------------------------------------------
  function getFieldIdentifier(el) {
    const parts = [];

    ['name', 'id', 'placeholder', 'aria-label', 'autocomplete', 'title'].forEach((attr) => {
      const v = el.getAttribute(attr);
      if (v) parts.push(v);
    });

    if (el.id) {
      try {
        const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lbl) parts.push(lbl.textContent);
      } catch (e) {}
    }
    const parentLabel = el.closest && el.closest('label');
    if (parentLabel) parts.push(parentLabel.textContent);

    const td = el.closest('td');
    if (td) {
      const tr = td.closest('tr');
      if (tr) {
        const th = tr.querySelector('th');
        if (th) parts.push(th.textContent);
        const firstTd = tr.querySelector('td');
        if (firstTd && firstTd !== td) parts.push(firstTd.textContent);
      }
    }

    const dd = el.closest('dd');
    if (dd) {
      let prev = dd.previousElementSibling;
      while (prev) {
        if (prev.tagName === 'DT') {
          parts.push(prev.textContent);
          break;
        }
        prev = prev.previousElementSibling;
      }
    }

    const wrap = el.closest('p, li, .form-group, .form-row, .field, .form-field, fieldset');
    if (wrap) {
      const labels = wrap.querySelectorAll('label, .label, .form-label, legend');
      labels.forEach((l) => {
        if (!l.contains(el)) parts.push(l.textContent);
      });
    }

    return parts
      .filter(Boolean)
      .map((p) => String(p).replace(/\s+/g, ' ').trim().slice(0, 200))
      .join(' ')
      .toLowerCase();
  }

  // -------------------------------------------------------------------
  // 除外判定
  // -------------------------------------------------------------------
  function isExcludedField(el) {
    if (el.tagName === 'SELECT') {
      // selectは限定的に除外（検索系のみ）
      const id = getFieldIdentifier(el);
      return /(?:^|[\s_\-=])(?:keyword|search|q|query|sort|order|lang|language|country)(?:[\s_\-=]|$)/.test(id);
    }
    const type = (el.type || 'text').toLowerCase();
    if (['hidden', 'password', 'submit', 'button', 'reset', 'file', 'checkbox', 'radio'].includes(type)) {
      return true;
    }
    const id = getFieldIdentifier(el);
    const exclude = [
      /(?:^|[\s_\-=])(?:keyword|search|q|query)(?:[\s_\-=]|$)/,
      /(?:^|[\s_\-=])(?:user(?:name)?|userid|user_id|login|loginid|login_id|account|accountid)(?:[\s_\-=]|$)/,
      /(?:^|[\s_\-=])(?:pass|password|passwd|pwd)(?:[\s_\-=]|$)/,
      /検索|ログイン|パスワード|ユーザーid|ユーザid/,
    ];
    return exclude.some((re) => re.test(id));
  }

  // -------------------------------------------------------------------
  // ひらがな/カタカナ変換
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
  // 郵便番号: 分割と整形
  // -------------------------------------------------------------------
  function splitPostalCode(code) {
    if (!code) return { first: '', second: '', combined: '' };
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

  // フォームのmaxlengthからハイフン要否を判定して整形
  function postalForSingleField(input, code) {
    if (!code) return '';
    const split = splitPostalCode(code);
    const ml = parseInt(input.getAttribute('maxlength') || '0', 10);
    // maxlength=7 → ハイフンなしで7桁
    if (ml === 7 && split.digitsOnly && split.digitsOnly.length === 7) {
      return split.digitsOnly;
    }
    // maxlength=8 → 「XXX-XXXX」想定
    if (ml === 8 && split.first && split.second) {
      return split.combined;
    }
    // それ以外: ユーザー入力をそのまま
    return code;
  }

  // -------------------------------------------------------------------
  // 住所: 分割
  // 例: "〒150-0002 東京都渋谷区渋谷1-2-3 ○○ビル 5F"
  //     → { prefecture: "東京都", city: "渋谷区", street: "渋谷1-2-3", building: "○○ビル 5F", full }
  // -------------------------------------------------------------------
  function parseAddress(full) {
    const result = { prefecture: '', city: '', street: '', building: '', full: '' };
    if (!full) return result;
    let s = String(full).trim();
    // 先頭の郵便番号を削除
    s = s.replace(/^〒?\s*\d{3}[\-\s]?\d{4}\s*/, '').trim();
    result.full = s;

    // 都道府県（北海道は3文字、他は3-4文字、念のため2-4で非貪欲）
    const prefMatch = s.match(/^(.{2,4}?[都道府県])(.*)/);
    if (!prefMatch) {
      result.street = s;
      return result;
    }
    result.prefecture = prefMatch[1];
    let rest = prefMatch[2].trim();

    // 市区町村（最初の市/区/町/村/郡まで）
    const cityMatch = rest.match(/^(.+?[市区町村郡])(.*)/);
    if (!cityMatch) {
      result.street = rest;
      return result;
    }
    result.city = cityMatch[1];
    rest = cityMatch[2].trim();

    // 番地と建物名は最初の空白で分割
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
  // フリガナ判定
  // -------------------------------------------------------------------
  function detectKanaType(id) {
    if (/ひらがな|hiragana|ふりがな/i.test(id)) return 'hiragana';
    if (/カタカナ|katakana|フリガナ|ﾌﾘｶﾞﾅ/i.test(id)) return 'katakana';
    if (/(?:^|[\s])(?:セイ|メイ)(?:[\s]|$)/.test(id)) return 'katakana';
    if (/(?:^|[\s])(?:せい|めい)(?:[\s]|$)/.test(id)) return 'hiragana';
    if (/読み仮名|読みがな|よみがな|よみ\b/.test(id)) return 'hiragana';
    if (/(?:^|[\s_\-=])(?:kana|furigana|romaji|yomi)(?:[\s_\-=]|$)/i.test(id)) return 'unknown';
    return null;
  }

  // -------------------------------------------------------------------
  // 名前パターン
  // -------------------------------------------------------------------
  function isLastNamePattern(id, ac) {
    if (ac === 'family-name') return true;
    if (/(?:^|[\s_\-=])(?:last[\s_\-]?name|lastname|family[\s_\-]?name|familyname|surname|last_kanji|last-kanji|sei)(?:[\s_\-=]|$)/i.test(id)) return true;
    if (/(?:^|[\s　（\(])姓(?:[\s　（\)）：:]|$)/.test(id)) return true;
    if (/(?:^|[\s　（\(])苗字(?:[\s　（\)）：:]|$)/.test(id)) return true;
    return false;
  }

  function isFirstNamePattern(id, ac) {
    if (ac === 'given-name') return true;
    if (/(?:^|[\s_\-=])(?:first[\s_\-]?name|firstname|given[\s_\-]?name|givenname|first_kanji|first-kanji|mei)(?:[\s_\-=]|$)/i.test(id)) return true;
    if (/(?:^|[\s　（\(])名(?:[\s　（\)）：:]|$)/.test(id)) {
      if (/^(?:[^姓]*?)(?:会社名|店名|品名|商品名|件名|曲名|匿名|本名|サイト名|団体名|事業者名)(?:[^姓]*)$/.test(id) &&
          !/(?:^|[\s_\-=])(?:first|mei|given)/i.test(id)) {
        return false;
      }
      return true;
    }
    return false;
  }

  function isFullNamePattern(id, ac) {
    if (ac === 'name') return true;
    if (/(?:^|[\s_\-=])(?:full[\s_\-]?name|fullname|your[\s_\-]?name|sender|customer[\s_\-]?name|customer|namae)(?:[\s_\-=]|$)/i.test(id)) return true;
    if (/氏名|お名前|ご芳名|ご担当者(?:名)?|担当者(?:名)?|代表者(?:名)?|名前/.test(id) &&
        !/会社名|社名|店名|屋号|サイト名|商品名/.test(id)) {
      return true;
    }
    if (/(?:^|[\s_\-=])name(?:[\s_\-=]|$)/i.test(id)) return true;
    return false;
  }

  function detectNamePart(id, ac) {
    if (isLastNamePattern(id, ac)) return 'last';
    if (isFirstNamePattern(id, ac)) return 'first';
    if (isFullNamePattern(id, ac)) return 'full';
    return null;
  }

  function isDepartmentPattern(id) {
    if (/部署(?:名)?|部門(?:名)?|部課/.test(id)) return true;
    if (/所属\s*(?:部署|部門|課)/.test(id)) return true;
    if (/(?:^|[\s_\-=])(?:dept|department|division|busho|bumon)(?:[\s_\-=]|$)/i.test(id)) return true;
    return false;
  }

  function isCompanyPattern(id, ac) {
    if (ac === 'organization') return true;
    if (/(?:^|[\s_\-=])(?:company|organization|org|corp|kaisha|firm)(?:[\s_\-=]|$)/i.test(id)) return true;
    if (/会社(?:名)?|社名|法人(?:名)?|企業(?:名)?|団体名|屋号|店舗(?:名)?|店名|事業者名/.test(id)) return true;
    if (/(?:ご)?所属(?!\s*(?:部署|部門|課))/.test(id)) return true;
    return false;
  }

  // -------------------------------------------------------------------
  // 郵便番号パターン
  // 'first' | 'second' | 'single' | null
  // -------------------------------------------------------------------
  function detectPostalKind(id, ac) {
    // 分割: name="zip1"/"zip2"、name="postcode1"/"postcode2"、郵便番号1/2 など
    if (/(?:^|[\s_\-=])(?:zip|zipcode|postal|postcode|postal_code|yubin|yuubin|郵便番号)[\s_\-=]?1(?:[\s_\-=]|$)/i.test(id)) return 'first';
    if (/(?:^|[\s_\-=])(?:zip|zipcode|postal|postcode|postal_code|yubin|yuubin|郵便番号)[\s_\-=]?2(?:[\s_\-=]|$)/i.test(id)) return 'second';
    // 単独
    if (ac === 'postal-code') return 'single';
    if (/(?:^|[\s_\-=])(?:zip|zipcode|postal|postcode|postal_code|yubin|yuubin|yubinbangou|yuubinbangou)(?:[\s_\-=]|$)/i.test(id)) return 'single';
    if (/郵便番号|〒/.test(id)) return 'single';
    return null;
  }

  // -------------------------------------------------------------------
  // 住所パートの判定
  // 'prefecture' | 'city' | 'street' | 'building' | 'full' | null
  // -------------------------------------------------------------------
  function detectAddressPart(id, ac) {
    // 都道府県
    if (ac === 'address-level1') return 'prefecture';
    if (/都道府県|prefecture|^pref$|(?:^|[\s_\-=])pref(?:[\s_\-=]|$)|(?:^|[\s_\-=])state(?:[\s_\-=]|$)|address[\s_\-]?level[\s_\-]?1/i.test(id)) return 'prefecture';

    // 市区町村
    if (ac === 'address-level2') return 'city';
    if (/市区町村|市町村|(?:^|[\s_\-=])city(?:[\s_\-=]|$)|municipality|address[\s_\-]?level[\s_\-]?2/i.test(id)) return 'city';

    // 建物名（line2を先にチェック）
    if (ac === 'address-line2') return 'building';
    if (/建物(?:名)?|マンション(?:名)?|アパート(?:名)?|ビル(?:名)?|号室|部屋(?:番号)?|address[\s_\-]?line[\s_\-]?2|(?:^|[\s_\-=])addr2(?:[\s_\-=]|$)|(?:^|[\s_\-=])address2(?:[\s_\-=]|$)|building/i.test(id)) return 'building';

    // 番地・町名（line1）
    if (ac === 'address-line1') return 'street';
    if (/番地|丁目|町名|(?:^|[\s_\-=])street(?:[\s_\-=]|$)|street[\s_\-]?address|address[\s_\-]?line[\s_\-]?1|(?:^|[\s_\-=])addr1(?:[\s_\-=]|$)|(?:^|[\s_\-=])address1(?:[\s_\-=]|$)/i.test(id)) return 'street';

    // 住所（フル）
    if (ac === 'street-address') return 'full';
    if (/(?:^|[\s_\-=])住所(?:[\s_\-=]|$)|^住所|(?:^|[\s_\-=])(?:address|addr)(?:[\s_\-=]|$)/i.test(id)) return 'full';

    return null;
  }

  // -------------------------------------------------------------------
  // フィールド分類
  // -------------------------------------------------------------------
  function classifyFields() {
    const result = {
      emails: [],

      lastName: null, firstName: null, fullName: null,
      lastNameKana: null, firstNameKana: null, fullNameKana: null,
      lastNameKanaType: null, firstNameKanaType: null, fullNameKanaType: null,

      phone: null,
      company: null,
      department: null,

      // 郵便番号
      postalCode: null,        // 単独欄
      postalFirst: null,       // 分割の前半
      postalSecond: null,      // 分割の後半

      // 住所
      addressFull: null,       // 単独「住所」欄
      prefecture: null,        // 都道府県（input or select）
      city: null,              // 市区町村
      street: null,            // 番地・町名
      building: null,          // 建物名・部屋

      textarea: null,
    };

    // textarea
    document.querySelectorAll('textarea').forEach((t) => {
      if (!isVisible(t)) return;
      if (areaOf(t) > areaOf(result.textarea)) result.textarea = t;
    });

    // input + select
    const elements = Array.from(
      document.querySelectorAll('input, select')
    ).filter((el) => isVisible(el) && !isExcludedField(el));

    elements.forEach((el) => {
      const id = getFieldIdentifier(el);
      const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
      const isSelect = el.tagName === 'SELECT';

      // ===== select は住所系（特に都道府県）のみ受け付ける =====
      if (isSelect) {
        const part = detectAddressPart(id, ac);
        if (part === 'prefecture' && !result.prefecture) {
          result.prefecture = el;
        } else if (part === 'city' && !result.city) {
          result.city = el;
        }
        return;
      }

      const type = (el.type || 'text').toLowerCase();

      // ===== メール =====
      if (
        type === 'email' ||
        ac === 'email' ||
        /(?:^|[\s_\-=])(?:mail|e-?mail|email|mailaddr|mailaddress|mail_address)(?:[\s_\-=]|$)/i.test(id) ||
        /メール|eメール|ｅメール/.test(id)
      ) {
        result.emails.push(el);
        return;
      }

      // ===== 電話 =====
      if (
        type === 'tel' ||
        ac === 'tel' ||
        /(?:^|[\s_\-=])(?:phone|tel|telephone|mobile|denwa)(?:[\s_\-=]|$)/i.test(id) ||
        /電話|でんわ|携帯|ＴＥＬ/.test(id)
      ) {
        if (!result.phone) result.phone = el;
        return;
      }

      // ===== 郵便番号（メール/電話より後、住所より先） =====
      const postalKind = detectPostalKind(id, ac);
      if (postalKind === 'first') {
        if (!result.postalFirst) result.postalFirst = el;
        return;
      }
      if (postalKind === 'second') {
        if (!result.postalSecond) result.postalSecond = el;
        return;
      }
      if (postalKind === 'single') {
        if (!result.postalCode) result.postalCode = el;
        return;
      }

      // ===== 住所パート =====
      const addrPart = detectAddressPart(id, ac);
      if (addrPart === 'prefecture' && !result.prefecture) {
        result.prefecture = el;
        return;
      }
      if (addrPart === 'city' && !result.city) {
        result.city = el;
        return;
      }
      if (addrPart === 'building' && !result.building) {
        result.building = el;
        return;
      }
      if (addrPart === 'street' && !result.street) {
        result.street = el;
        return;
      }
      if (addrPart === 'full' && !result.addressFull) {
        result.addressFull = el;
        return;
      }

      // ===== フリガナ =====
      const kanaType = detectKanaType(id);
      if (kanaType) {
        const part = detectNamePart(id, ac);
        if (part === 'last' && !result.lastNameKana) {
          result.lastNameKana = el;
          result.lastNameKanaType = kanaType;
        } else if (part === 'first' && !result.firstNameKana) {
          result.firstNameKana = el;
          result.firstNameKanaType = kanaType;
        } else if (!result.fullNameKana) {
          result.fullNameKana = el;
          result.fullNameKanaType = kanaType;
        }
        return;
      }

      // ===== 名前 =====
      const namePart = detectNamePart(id, ac);
      if (namePart === 'last') {
        if (!result.lastName) result.lastName = el;
        return;
      }
      if (namePart === 'first') {
        if (!result.firstName) result.firstName = el;
        return;
      }
      if (namePart === 'full') {
        if (!result.fullName) result.fullName = el;
        return;
      }

      // ===== 部署（会社より先） =====
      if (isDepartmentPattern(id)) {
        if (!result.department) result.department = el;
        return;
      }

      // ===== 会社 =====
      if (isCompanyPattern(id, ac)) {
        if (!result.company) result.company = el;
        return;
      }
    });

    return result;
  }

  // -------------------------------------------------------------------
  // 受信側の会社名を推測
  // -------------------------------------------------------------------
  const SEPS_CLASS = '\\s|｜\\-–—:：、,，。()（）【】「」『』';
  const JP_CORPS = '株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|公益社団法人|学校法人|医療法人|社会福祉法人|（株）|\\(株\\)|（有）|\\(有\\)';
  const EN_CORPS = 'Inc\\.?|Corp\\.?|Co\\.,?\\s*Ltd\\.?|LLC|Ltd\\.?|Limited';

  function detectRecipientCompany() {
    try {
      const og = document.querySelector('meta[property="og:site_name"]');
      if (og && og.content) {
        const cleaned = cleanCompanyName(og.content.trim());
        if (cleaned) return cleaned;
      }
      const title = (document.title || '').trim();
      if (!title) return location.hostname.replace(/^www\./, '');

      const corpPatterns = [
        new RegExp('[^' + SEPS_CLASS + ']+(?:' + JP_CORPS + ')'),
        new RegExp('(?:' + JP_CORPS + ')[^' + SEPS_CLASS + ']+'),
        new RegExp("[A-Za-z][A-Za-z0-9 &.']*\\s*(?:" + EN_CORPS + ')', 'i'),
      ];
      for (const pattern of corpPatterns) {
        const m = title.match(pattern);
        if (m && m[0].trim()) return m[0].trim();
      }

      const parts = title.split(/[|｜\-–—:：]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const NG = /問い?合わせ|問合せ|フォーム|受付|contact|inquiry|home|top|送信完了/i;
        const candidates = parts.filter((p) => !NG.test(p));
        if (candidates.length > 0) {
          return candidates.reduce((a, b) => (b.length > a.length ? b : a));
        }
        const cleaned = parts.map(cleanCompanyName).filter(Boolean);
        if (cleaned.length > 0) {
          return cleaned.reduce((a, b) => (b.length > a.length ? b : a));
        }
      }
      const cleaned = cleanCompanyName(title);
      if (cleaned) return cleaned;
      return location.hostname.replace(/^www\./, '');
    } catch (e) {
      return location.hostname || '';
    }
  }

  function cleanCompanyName(s) {
    if (!s) return s;
    const NG_PHRASES =
      'お?問い?合わせフォーム|お?問い?合わせ受付|お?問い?合わせ|問合せ|お申込み?|お申し込み|資料請求|contact\\s*us|contact|inquiry|フォーム|受付|home|top';
    return String(s)
      .replace(new RegExp('[\\s|｜\\-–—:：]+(?:' + NG_PHRASES + ').*$', 'i'), '')
      .replace(new RegExp('^(?:' + NG_PHRASES + ')[\\s|｜\\-–—:：]+', 'i'), '')
      .trim();
  }

  // -------------------------------------------------------------------
  // 値をセット（input / textarea / select）
  // -------------------------------------------------------------------
  function setSelectValue(el, value) {
    if (!value) return false;
    const target = String(value).trim();
    const options = Array.from(el.options || []);
    // 完全一致 → テキスト一致 → 部分一致 の順で探す
    let match =
      options.find((o) => o.value === target) ||
      options.find((o) => (o.text || '').trim() === target) ||
      options.find((o) => (o.text || '').trim().includes(target)) ||
      options.find((o) => target.includes((o.text || '').trim()) && (o.text || '').trim().length >= 2);
    if (!match) return false;
    el.value = match.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setValue(el, value) {
    if (!el) return false;
    if (el.tagName === 'SELECT') {
      return setSelectValue(el, value);
    }
    const proto =
      el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
    try { el.focus({ preventScroll: true }); } catch (e) {}
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
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

  // ===================================================================
  // 公開API
  // ===================================================================
  window.__cfAutofill = {
    check() {
      try {
        const cls = classifyFields();
        const fields = {
          textarea: !!cls.textarea,
          name: !!(cls.fullName || cls.lastName || cls.firstName),
          splitName: !!(cls.lastName && cls.firstName),
          kana: !!(cls.fullNameKana || cls.lastNameKana || cls.firstNameKana),
          splitKana: !!(cls.lastNameKana && cls.firstNameKana),
          kanaTypes: {
            last: cls.lastNameKanaType,
            first: cls.firstNameKanaType,
            full: cls.fullNameKanaType,
          },
          email: cls.emails.length > 0,
          emailCount: cls.emails.length,
          phone: !!cls.phone,
          company: !!cls.company,
          department: !!cls.department,

          // 新規
          postalCode: !!(cls.postalCode || cls.postalFirst || cls.postalSecond),
          postalSplit: !!(cls.postalFirst && cls.postalSecond),
          address: !!(cls.addressFull || cls.prefecture || cls.city || cls.street || cls.building),
          addressSplit: !!(cls.prefecture || cls.city || cls.street || cls.building) && !cls.addressFull,
        };
        const hasForm = !!cls.textarea;

        let salesRejection = { detected: false, excerpts: [] };
        if (window.__cfDetector && window.__cfDetector.detectSalesRejection) {
          salesRejection = window.__cfDetector.detectSalesRejection();
        }

        return {
          ok: true,
          hasForm,
          fields,
          hasSalesRejection: salesRejection.detected,
          salesExcerpts: salesRejection.excerpts || [],
          recipientCompany: detectRecipientCompany(),
        };
      } catch (err) {
        console.error('[Contact Finder] check() でエラー:', err);
        return { ok: false, error: err.message || String(err) };
      }
    },

    fill(data) {
      try {
        if (!data || !data.body) {
          return { ok: false, error: '本文が空です', filled: [], skipped: [] };
        }
        const settings = data.settings || {};
        const cls = classifyFields();
        const filled = [];
        const skipped = [];
        let firstFilledEl = null;

        const tryFill = (label, el, value) => {
          if (!el) {
            skipped.push(label + '（フィールドが見つかりません）');
            return;
          }
          if (!value) {
            skipped.push(label + '（値が未設定）');
            return;
          }
          const ok = setValue(el, value);
          if (!ok) {
            skipped.push(label + '（値「' + value + '」に対応するoptionが無い）');
            return;
          }
          filled.push(label);
          if (!firstFilledEl) firstFilledEl = el;
        };

        // ===== 漢字の名前 =====
        if (cls.lastName && cls.firstName) {
          const split = splitName(settings.yourName);
          if (split.last && split.first) {
            tryFill('姓', cls.lastName, split.last);
            tryFill('名', cls.firstName, split.first);
          } else if (split.last) {
            tryFill('お名前(姓欄に統合)', cls.lastName, split.last);
            skipped.push('名（お名前設定が1単語のみ）');
          } else {
            skipped.push('お名前（値が未設定）');
          }
        } else if (cls.fullName) {
          tryFill('お名前', cls.fullName, settings.yourName);
        } else if (cls.lastName) {
          tryFill('お名前', cls.lastName, settings.yourName);
        } else if (cls.firstName) {
          tryFill('お名前', cls.firstName, settings.yourName);
        }

        // ===== フリガナ =====
        if (cls.lastNameKana && cls.firstNameKana) {
          const split = splitName(settings.furigana);
          if (split.last && split.first) {
            tryFill('姓フリガナ', cls.lastNameKana, adjustKana(split.last, cls.lastNameKanaType));
            tryFill('名フリガナ', cls.firstNameKana, adjustKana(split.first, cls.firstNameKanaType));
          } else if (split.last) {
            tryFill('フリガナ(姓欄に統合)', cls.lastNameKana, adjustKana(split.last, cls.lastNameKanaType));
            skipped.push('名フリガナ（フリガナ設定が1単語のみ）');
          } else {
            skipped.push('フリガナ（値が未設定）');
          }
        } else if (cls.fullNameKana) {
          tryFill('フリガナ', cls.fullNameKana, adjustKana(settings.furigana, cls.fullNameKanaType));
        } else if (cls.lastNameKana) {
          tryFill('フリガナ', cls.lastNameKana, adjustKana(settings.furigana, cls.lastNameKanaType));
        } else if (cls.firstNameKana) {
          tryFill('フリガナ', cls.firstNameKana, adjustKana(settings.furigana, cls.firstNameKanaType));
        }

        // ===== メール（複数欄に同じ値） =====
        if (cls.emails.length === 0) {
          skipped.push('メールアドレス（フィールドが見つかりません）');
        } else if (!settings.email) {
          skipped.push('メールアドレス（値が未設定）');
        } else {
          cls.emails.forEach((el, idx) => {
            const label = cls.emails.length > 1
              ? `メールアドレス(${idx + 1}/${cls.emails.length})`
              : 'メールアドレス';
            tryFill(label, el, settings.email);
          });
        }

        // ===== 電話 =====
        tryFill('電話番号', cls.phone, settings.phone);

        // ===== 郵便番号 =====
        if (cls.postalFirst && cls.postalSecond) {
          // 分割欄
          const split = splitPostalCode(settings.postalCode);
          if (split.first && split.second) {
            tryFill('郵便番号(前半)', cls.postalFirst, split.first);
            tryFill('郵便番号(後半)', cls.postalSecond, split.second);
          } else {
            skipped.push('郵便番号（値が7桁になっていない）');
          }
        } else if (cls.postalFirst) {
          tryFill('郵便番号(前半)', cls.postalFirst, splitPostalCode(settings.postalCode).first);
        } else if (cls.postalCode) {
          // 単独欄: フォームのmaxlengthからハイフン要否を判定
          tryFill('郵便番号', cls.postalCode, postalForSingleField(cls.postalCode, settings.postalCode));
        }

        // ===== 住所 =====
        if (cls.addressFull) {
          // 単独「住所」欄 → フル住所
          tryFill('住所', cls.addressFull, settings.address);
        }
        // 分割欄（個別に存在すれば各欄を埋める）
        if (cls.prefecture || cls.city || cls.street || cls.building) {
          const parts = parseAddress(settings.address);
          tryFill('都道府県', cls.prefecture, parts.prefecture);
          tryFill('市区町村', cls.city, parts.city);
          tryFill('番地・町名', cls.street, parts.street);
          tryFill('建物名', cls.building, parts.building);
        }

        // ===== 会社名 / 部署名 =====
        tryFill('会社名（自社）', cls.company, settings.companyName);
        tryFill('部署名', cls.department, settings.department);

        // ===== 本文 =====
        tryFill('本文', cls.textarea, data.body);

        if (firstFilledEl && firstFilledEl.scrollIntoView) {
          try {
            firstFilledEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch (e) {}
        }

        return { ok: true, filled, skipped };
      } catch (err) {
        console.error('[Contact Finder] fill() でエラー:', err);
        return { ok: false, error: err.message || String(err), filled: [], skipped: [] };
      }
    },
  };

})();
