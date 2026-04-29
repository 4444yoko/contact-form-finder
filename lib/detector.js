/**
 * Contact Form Finder
 * Copyright (c) 2026 Yuki Yokoyama
 * Licensed under the MIT License
 */

/**
 * detector.js
 * 「営業お断り」文言とCAPTCHAの検知ロジック
 *
 * 検知のみ行い、突破などの操作は一切しません。
 * グローバル window.__cfDetector にぶら下げて他から呼び出します。
 */
(function () {
  'use strict';

  if (window.__cfDetector) {
    return;
  }

  // -----------------------------------------------------------------
  // 「営業お断り」系の文言を検知
  // ページ全体のテキストから、営業・勧誘などの拒否表現を探す
  // -----------------------------------------------------------------
  function detectSalesRejection() {
    // ページ本文を取得（innerTextなら見えているテキストのみ）
    let bodyText = '';
    try {
      bodyText = document.body ? document.body.innerText : '';
    } catch (e) {
      console.warn('[Contact Finder] body取得失敗:', e);
      return { detected: false, excerpts: [] };
    }

    // 検知パターン（日本語＋英語）
    // [^\n]{0,30} で 30文字以内の任意文字を許容することで
    // 「営業電話のご連絡はお断りさせていただきます」のような揺れにも対応
    const patterns = [
      /営業[^\n]{0,30}(?:お断り|ご遠慮|お受けし(?:ません|ておりません))/,
      /営業電話[^\n]{0,20}(?:お断り|ご遠慮)/,
      /営業目的[^\n]{0,30}(?:お断り|ご遠慮|ご連絡はお控え)/,
      /セールス[^\n]{0,20}(?:お断り|ご遠慮)/,
      /勧誘[^\n]{0,20}(?:お断り|ご遠慮)/,
      /売り?込み[^\n]{0,20}(?:お断り|ご遠慮)/,
      /no\s+(?:solicitation|sales\s+calls?|cold\s+calls?)/i,
    ];

    const excerpts = [];
    patterns.forEach((pattern) => {
      const match = bodyText.match(pattern);
      if (match) {
        // 抜粋テキストを整形（前後の空白除去、改行→スペース）
        const excerpt = match[0].replace(/\s+/g, ' ').trim();
        // 重複排除
        if (!excerpts.includes(excerpt)) {
          excerpts.push(excerpt);
        }
      }
    });

    return {
      detected: excerpts.length > 0,
      excerpts: excerpts.slice(0, 3), // UIには最大3件まで例示
    };
  }

  // -----------------------------------------------------------------
  // CAPTCHA検知
  // フォームを実際に開いていなくても、CAPTCHAスクリプトが読み込まれていれば検出可能
  // -----------------------------------------------------------------
  function detectCaptcha() {
    const types = [];

    try {
      // --- Google reCAPTCHA ---
      // クラス名 .g-recaptcha や iframe の src で判定
      if (
        document.querySelector(
          '.g-recaptcha, [class*="g-recaptcha"], iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"]'
        ) ||
        document.querySelector('script[src*="recaptcha"], script[src*="gstatic.com/recaptcha"]')
      ) {
        types.push('reCAPTCHA');
      }

      // --- hCaptcha ---
      if (
        document.querySelector('.h-captcha, iframe[src*="hcaptcha"]') ||
        document.querySelector('script[src*="hcaptcha.com"]')
      ) {
        types.push('hCaptcha');
      }

      // --- Cloudflare Turnstile ---
      if (
        document.querySelector('.cf-turnstile, iframe[src*="challenges.cloudflare"]') ||
        document.querySelector('script[src*="turnstile"], script[src*="challenges.cloudflare"]')
      ) {
        types.push('Cloudflare Turnstile');
      }
    } catch (e) {
      console.warn('[Contact Finder] CAPTCHA検知中にエラー:', e);
    }

    return {
      detected: types.length > 0,
      types,
    };
  }

  window.__cfDetector = {
    detectSalesRejection,
    detectCaptcha,
  };

})();
