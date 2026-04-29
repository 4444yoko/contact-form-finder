/**
 * Contact Form Finder
 * Copyright (c) 2026 Yuki Yokoyama
 * Licensed under the MIT License
 */

/**
 * keywords.js
 * 問い合わせフォーム検出に使うキーワード・URLパターン・スコアの定義
 *
 * このファイルだけ編集すれば、検出精度をチューニングできるように
 * 設計しています。検出ロジック本体は finder.js を参照してください。
 *
 * グローバル window.__cfKeywords にぶら下げて、他のスクリプトから参照します。
 * (Chrome拡張のcontent scriptは独立したスコープを持つため、共有用)
 */
(function () {
  'use strict';

  // 既に注入済みなら上書きしない（同じタブで複数回ボタンを押した場合の保険）
  if (window.__cfKeywords) {
    return;
  }

  window.__cfKeywords = {
    // -----------------------------------------------------------------
    // テキストキーワード
    // リンクの textContent / aria-label / title 属性に対してマッチする
    // -----------------------------------------------------------------
    textKeywords: [
      // ===== 日本語 =====
      // 「お問い合わせフォーム」のように具体的な単語は高スコア
      { pattern: /お問い?合(わ)?せ\s*フォーム|問合せ\s*フォーム/i, score: 12, label: '問い合わせフォーム' },
      { pattern: /お問い?合(わ)?せ|問い合わせ|問合せ|問合わせ/i, score: 10, label: '問い合わせ' },
      { pattern: /ご相談|無料相談|相談する/i, score: 7, label: '相談' },
      { pattern: /お申(し)?込み|お申込|申し込み/i, score: 6, label: '申込' },
      { pattern: /ご質問|質問する/i, score: 5, label: '質問' },
      { pattern: /メッセージを送る|メッセージ送信/i, score: 8, label: 'メッセージ送信' },
      { pattern: /資料請求/i, score: 6, label: '資料請求' },

      // ===== 英語 =====
      { pattern: /\bcontact\s*us\b/i, score: 11, label: 'Contact Us' },
      { pattern: /\bcontact\b/i, score: 9, label: 'Contact' },
      { pattern: /\binquiry\b|\benquiry\b/i, score: 9, label: 'Inquiry' },
      { pattern: /\bget\s+in\s+touch\b/i, score: 8, label: 'Get in Touch' },
      { pattern: /\breach\s+(out|us)\b/i, score: 6, label: 'Reach Us' },
      { pattern: /\bsend\s+(a\s+)?message\b/i, score: 6, label: 'Send Message' },
    ],

    // -----------------------------------------------------------------
    // URLキーワード
    // <a href="..."> のhref値に対してマッチする
    // -----------------------------------------------------------------
    urlKeywords: [
      { pattern: /\/contact[\-_]?us(?:[\/\-_?#]|$)/i, score: 6, label: '/contact-us' },
      { pattern: /\/contact(?:[\/\-_?#]|$)/i, score: 5, label: '/contact' },
      { pattern: /\/inquiry|\/enquiry/i, score: 5, label: '/inquiry' },
      { pattern: /\/otoiawase|\/toiawase|\/toi(?:awase)?\.html?/i, score: 5, label: '/otoiawase' },
      { pattern: /\/form(?:[\/\-_?#]|$)/i, score: 2, label: '/form' },
      { pattern: /\/support(?:[\/\-_?#]|$)/i, score: 1, label: '/support' },
    ],

    // -----------------------------------------------------------------
    // スコア調整値
    // -----------------------------------------------------------------

    // フッター内のリンクは加点（問い合わせはフッターにあることが多い）
    footerBonus: 3,

    // ヘッダー/ナビ内のリンクは少しだけ加点
    navBonus: 1,

    // 表示する候補の最大件数
    maxResults: 5,
  };

})();
