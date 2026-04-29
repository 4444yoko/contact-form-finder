/**
 * Contact Form Finder
 * Copyright (c) 2026 Yuki Yokoyama
 * Licensed under the MIT License
 */

/**
 * finder.js
 * ページ内の問い合わせフォーム候補を検出するロジック
 *
 * keywords.js と detector.js を読み込んだ後にこのファイルを注入します。
 * 検出関数は window.__cfFind() として呼び出せます。
 */
(function () {
  'use strict';

  // 既に登録済みなら上書きしない
  if (window.__cfFind) {
    return;
  }

  // ------------------------------------------------------------------
  // メイン関数: ページ内の問い合わせリンク候補を集めて返す
  // ------------------------------------------------------------------
  function find() {
    try {
      const KW = window.__cfKeywords;
      const DET = window.__cfDetector;

      if (!KW || !DET) {
        return {
          ok: false,
          error: 'keywords.js または detector.js が読み込まれていません',
        };
      }

      const candidates = collectCandidates(KW);
      const sorted = Array.from(candidates.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, KW.maxResults);

      // 「営業お断り」「CAPTCHA」検知も同時に行う
      const salesRejection = DET.detectSalesRejection();
      const captcha = DET.detectCaptcha();


      return {
        ok: true,
        candidates: sorted,
        salesRejection,
        captcha,
        pageUrl: window.location.href,
        pageTitle: document.title,
      };
    } catch (err) {
      console.error('[Contact Finder] find() でエラー:', err);
      return {
        ok: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  }

  // ------------------------------------------------------------------
  // ページ内の<a>タグを走査してスコア付き候補マップを作る
  // ------------------------------------------------------------------
  function collectCandidates(KW) {
    const candidates = new Map(); // url -> { url, score, ... }
    const links = document.querySelectorAll('a[href]');

    links.forEach((link) => {
      const href = normalizeUrl(link.href);
      if (!href) return;
      if (!isValidLink(link, href)) return;

      // テキスト・aria-label・titleを集めてマッチング対象にする
      const text = (link.textContent || '').trim();
      const ariaLabel = link.getAttribute('aria-label') || '';
      const title = link.getAttribute('title') || '';
      const combined = `${text} ${ariaLabel} ${title}`.trim();

      let score = 0;
      const matchedLabels = [];
      const matchedUrlPatterns = [];

      // --- テキストキーワードマッチング ---
      KW.textKeywords.forEach(({ pattern, score: s, label }) => {
        if (pattern.test(combined)) {
          score += s;
          matchedLabels.push(label);
        }
      });

      // --- URLキーワードマッチング ---
      KW.urlKeywords.forEach(({ pattern, score: s, label }) => {
        if (pattern.test(href)) {
          score += s;
          matchedUrlPatterns.push(label);
        }
      });

      // --- 配置による加点 ---
      const inFooter = isInFooter(link);
      const inNav = isInNav(link);
      if (inFooter) score += KW.footerBonus;
      else if (inNav) score += KW.navBonus;

      if (score <= 0) return;

      // 同一URLが複数あれば最大スコアの方を採用
      const existing = candidates.get(href);
      if (!existing || existing.score < score) {
        candidates.set(href, {
          url: href,
          text: text || '(テキストなし)',
          score,
          matchedLabels: dedupe(matchedLabels),
          matchedUrlPatterns: dedupe(matchedUrlPatterns),
          inFooter,
          inNav,
        });
      }
    });

    return candidates;
  }

  // ------------------------------------------------------------------
  // URLの正規化: フラグメント（#xxx）を削除して同一視を改善
  // ------------------------------------------------------------------
  function normalizeUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      u.hash = ''; // #section は同一URL扱い
      return u.href;
    } catch (e) {
      return url; // パース失敗時はそのまま
    }
  }

  // ------------------------------------------------------------------
  // 候補から除外するリンクを判定
  // ------------------------------------------------------------------
  function isValidLink(link, href) {
    // javascript: / mailto: / tel: は対象外
    if (/^(javascript|mailto|tel|sms):/i.test(href)) return false;
    // 現在ページ自身は除外
    if (href === normalizeUrl(window.location.href)) return false;
    // 画像など、テキストもlabelもない不可視リンクは除外
    const hasText = (link.textContent || '').trim().length > 0;
    const hasLabel = link.getAttribute('aria-label') || link.getAttribute('title');
    if (!hasText && !hasLabel) {
      // ただしURLパターンに一致する可能性はあるので、
      // 明らかに検出対象URLっぽいものは残す
      if (!/contact|inquiry|toiawase|otoiawase/i.test(href)) {
        return false;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------
  // フッター判定: <footer> や role="contentinfo"、 .footer / #footer
  // ------------------------------------------------------------------
  function isInFooter(link) {
    return !!link.closest(
      'footer, [role="contentinfo"], .footer, #footer, .l-footer, .site-footer, .global-footer'
    );
  }

  // ------------------------------------------------------------------
  // ナビゲーション判定
  // ------------------------------------------------------------------
  function isInNav(link) {
    return !!link.closest(
      'nav, [role="navigation"], header, .header, #header, .global-nav, .gnav'
    );
  }

  // 配列の重複を取り除く（順序維持）
  function dedupe(arr) {
    return Array.from(new Set(arr));
  }

  // 外部に公開
  window.__cfFind = find;

})();
