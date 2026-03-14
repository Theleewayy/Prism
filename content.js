(function () {
  'use strict';

  // Global references to injected components inside shadow DOM
  let shadowRoot = null;
  let shadowHost = null;
  let tooltipEl = null;
  let badgeEl = null;
  let bannerEl = null;
  let urgencyScore = 0;
  let fakeTimerPenalty = 0;
  const knownTimers = new Map();

  // Configuration for homograph detection
  const confusables = {
    // Cyrillic
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x',
    // Greek
    'ο': 'o', 'ν': 'v',
    // Common Latin lookalikes
    '1': 'l', '0': 'o', 'l': '1', 'I': 'l'
  };

  const topBrands = [
    "google", "paypal", "amazon", "apple", "microsoft", "facebook", 
    "instagram", "netflix", "twitter", "linkedin", "dropbox", "github", 
    "yahoo", "wellsfargo", "bankofamerica", "chase", "coinbase", "binance", 
    "steam", "roblox"
  ];

  // 1. DOM Injection System
  function initDOMInjection() {
    try {
      // Clean up existing instance if "torn down" / reinjected
      const existingHost = document.getElementById('dps-root');
      if (existingHost) {
        existingHost.remove();
      }

      shadowHost = document.createElement('dps-root');
      shadowHost.id = 'dps-root';

      // Style host so it doesn't affect page layout
      shadowHost.style.position = 'fixed';
      shadowHost.style.top = '0';
      shadowHost.style.left = '0';
      shadowHost.style.width = '100%';
      shadowHost.style.height = '0';
      shadowHost.style.pointerEvents = 'none'; // Click-through by default
      shadowHost.style.zIndex = '2147483647'; // Maximum z-index

      shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

      // Inject base styles
      const style = document.createElement('style');
      style.textContent = `
        * { box-sizing: border-box; }
        .badge {
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 8px 16px;
          border-radius: 8px;
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          pointer-events: auto;
          transition: background-color 0.3s ease;
        }
        .badge.green { background-color: #10B981; }
        .badge.amber { background-color: #F59E0B; }
        .badge.red { background-color: #EF4444; }

        .tooltip {
          position: fixed;
          background: #1F2937;
          color: #F9FAFB;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 13px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          pointer-events: none;
          max-width: 300px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          display: none;
          line-height: 1.4;
          word-break: break-word;
        }

        .banner {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          background: #DC2626;
          color: white;
          text-align: center;
          padding: 12px 20px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-weight: bold;
          font-size: 15px;
          pointer-events: auto;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        }

        .threat-warning {
          margin-top: 4px;
          color: #EF4444;
          font-weight: bold;
        }

        /* Cookie Summary Card */
        .cookie-card {
          position: fixed;
          bottom: 70px;
          right: 20px;
          width: 340px;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #1F2937;
          pointer-events: auto;
          display: none;
          flex-direction: column;
          border: 1px solid #E5E7EB;
          overflow: hidden;
          z-index: 2147483647;
        }
        .cookie-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #F9FAFB;
          border-bottom: 1px solid #E5E7EB;
        }
        .cookie-card-title {
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
        }
        .cookie-risk-pill {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 9999px;
          font-weight: 500;
          text-transform: uppercase;
        }
        .cookie-risk-pill.low { background: #D1FAE5; color: #065F46; }
        .cookie-risk-pill.medium { background: #FEF3C7; color: #92400E; }
        .cookie-risk-pill.high { background: #FEE2E2; color: #991B1B; }
        
        .cookie-close-btn {
          cursor: pointer;
          background: none;
          border: none;
          font-size: 16px;
          color: #6B7280;
          padding: 4px;
        }
        .cookie-close-btn:hover { color: #111827; }

        .cookie-card-body {
          padding: 16px;
          font-size: 13px;
          line-height: 1.5;
        }
        .cookie-card-body ul {
          margin: 0 0 16px 0;
          padding-left: 20px;
        }
        .cookie-card-body li { margin-bottom: 8px; }

        .cookie-recommendation {
          background: #F3F4F6;
          padding: 10px 12px;
          border-radius: 6px;
          display: flex;
          gap: 8px;
          align-items: flex-start;
          font-weight: 500;
        }

        .cookie-card-footer {
          padding: 12px 16px;
          border-top: 1px solid #E5E7EB;
          display: flex;
          gap: 8px;
        }
        .cookie-btn {
          flex: 1;
          padding: 8px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.2s;
        }
        .cookie-btn-primary {
          background: #3B82F6;
          color: white;
        }
        .cookie-btn-primary:hover { background: #2563EB; }
        
        .cookie-btn-secondary {
          background: white;
          color: #374151;
          border-color: #D1D5DB;
        }
        .cookie-btn-secondary:hover { background: #F3F4F6; }

        /* Skeleton Loading */
        .skeleton-block {
          height: 12px;
          background: #E5E7EB;
          border-radius: 4px;
          margin-bottom: 8px;
          animation: pulse 1.5s infinite;
        }
        .skeleton-block:last-child { width: 60%; }
        
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `;
      shadowRoot.appendChild(style);

      // Initialize Badge
      badgeEl = document.createElement('div');
      badgeEl.className = 'badge green';
      badgeEl.textContent = 'Urgency: 0';
      shadowRoot.appendChild(badgeEl);

      // Initialize Tooltip
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'tooltip';
      shadowRoot.appendChild(tooltipEl);

      document.documentElement.appendChild(shadowHost);
      console.log('[DPS] DOM injection completed successfully.');
    } catch (err) {
      console.error('[DPS] Failed to inject DOM elements:', err);
    }
  }

  // 2. Event Delegation Layer
  function initEventDelegation() {
    try {
      document.addEventListener('mouseover', handleMouseOver, true);
      document.addEventListener('mouseout', handleMouseOut, true);

      // Mutation observer to re-scan for dynamically added content
      let debounceTimer = null;
      const observer = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        let checkForCookieBanner = false;

        for (const mut of mutations) {
          if (mut.addedNodes.length > 0 || mut.type === 'characterData') {
            shouldUpdate = true;
          }
          if (mut.addedNodes.length > 0) {
            checkForCookieBanner = true;
          }
        }
        
        if (shouldUpdate) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            updateBadgeScore();
            if (checkForCookieBanner && !cookieBannerDetected) {
              detectCookieBanner();
            }
          }, 1000);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      console.log('[DPS] Event delegation layered added.');
    } catch (err) {
      console.error('[DPS] Failed to initialize event delegation:', err);
    }
  }

  function handleMouseOver(e) {
    try {
      if (!e.target || typeof e.target.closest !== 'function') return;
      
      const anchor = e.target.closest('a');
      if (!anchor) return;

      const result = checkLink(anchor);
      if (result.mismatch) {
        showTooltip(
          e.clientX, 
          e.clientY, 
          `⚠️ Link mismatch detected!\nExpected: ${result.displayedDomain}\nDest: ${result.actualDomain}`
        );
      }
    } catch (err) {
      console.error('[DPS] Error processing mouseover:', err);
    }
  }

  function handleMouseOut(e) {
    if (!e.target || typeof e.target.closest !== 'function') return;
    const anchor = e.target.closest('a');
    if (anchor) {
      hideTooltip();
    }
  }

  function showTooltip(x, y, text) {
    if (!tooltipEl) return;
    
    // Clear and set text preserving line breaks
    tooltipEl.innerHTML = '';
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      tooltipEl.appendChild(document.createTextNode(line));
      if (idx < lines.length - 1) tooltipEl.appendChild(document.createElement('br'));
    });
    
    tooltipEl.style.display = 'block';
    
    // Offset slightly above the cursor
    const offset = 15;
    let targetX = x + offset;
    let targetY = y + offset;

    // Boundary checks
    const rect = tooltipEl.getBoundingClientRect();
    if (targetX + rect.width > window.innerWidth) {
      targetX = x - rect.width - offset;
    }
    if (targetY + rect.height > window.innerHeight) {
      targetY = y - rect.height - offset;
    }

    tooltipEl.style.left = targetX + 'px';
    tooltipEl.style.top = targetY + 'px';
  }

  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.style.display = 'none';
      tooltipEl.innerHTML = ''; // reset content
    }
  }

  // Helper to check element visibility
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return true;
  }

  function getVisualMultiplier(el) {
    let mult = 1.0;
    if (!el) return mult;
    const style = window.getComputedStyle(el);
    const fontSize = parseFloat(style.fontSize);
    if (fontSize > 20) mult += 0.5;
    if (style.fontWeight === '600' || style.fontWeight === '700' || style.fontWeight === 'bold') mult += 0.3;
    if (style.color === 'rgb(255, 0, 0)' || style.color === 'red') mult += 0.3;
    if (style.position === 'fixed' || style.position === 'sticky') mult += 0.5;
    return mult;
  }

  function getProximityMultiplier(el) {
    if (!el) return 1.0;
    let current = el;
    for (let i = 0; i < 4; i++) {
      if (!current) break;
      if (current.tagName === 'BUTTON' || (current.tagName === 'INPUT' && current.type === 'submit')) return 1.5;
      if (current.tagName === 'A') {
        const text = current.textContent ? current.textContent.toLowerCase() : '';
        if (text.includes('buy') || text.includes('checkout') || text.includes('cart')) return 1.5;
      }
      current = current.parentElement;
    }
    return 1.0;
  }

  function parseTimeSpanToSeconds(text) {
    const match = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
    if (!match) return -1;
    let hours = 0, mins = 0, secs = 0;
    if (match[3]) {
      hours = parseInt(match[1], 10);
      mins = parseInt(match[2], 10);
      secs = parseInt(match[3], 10);
    } else {
      mins = parseInt(match[1], 10);
      secs = parseInt(match[2], 10);
    }
    return hours * 3600 + mins * 60 + secs;
  }

  function trackTimer(node) {
    if (fakeTimerPenalty > 0) return;
    const el = node.parentElement;
    if (!el) return;

    const currentSeconds = parseTimeSpanToSeconds(node.nodeValue);
    if (currentSeconds === -1) return;

    const now = Date.now();
    const existing = knownTimers.get(el);

    if (existing) {
      const elapsedMs = now - existing.timestamp;
      if (elapsedMs < 500) return; // Ignore too frequent updates

      const expectedSeconds = existing.seconds - (elapsedMs / 1000);
      if (currentSeconds > existing.seconds + 2 || currentSeconds < expectedSeconds - 5) {
        console.log('[DPS] Fake timer detected!', el);
        fakeTimerPenalty = 50;
      } else {
        knownTimers.set(el, { seconds: currentSeconds, timestamp: now });
      }
    } else {
      knownTimers.set(el, { seconds: currentSeconds, timestamp: now });
    }
  }

  // 3. Urgency Scoring Algorithm
  function scoreUrgency(doc) {
    let score = fakeTimerPenalty;
    try {
      const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
      let node;

      const timerRegex = /\b\d{1,2}:\d{2}(:\d{2})?\b/i;
      
      const scarcityPatterns = [
        /only\s+\d+\s+left/i,
        /\blimited time\b/i,
        /\bact now\b/i,
        /\bexpires soon\b/i,
        /\balmost gone\b/i,
        /\bselling fast\b/i,
        /\bhigh demand\b/i
      ];

      const confirmShamingPatterns = [
        /no thanks, i hate/i,
        /i prefer paying full price/i,
        /i don't want to save/i
      ];

      const cartTimerPatterns = [
        /cart is reserved/i,
        /are not guaranteed/i
      ];

      const socialProofRegex = /\b\d+\s+people viewing this\b/i;

      let globalCapsCount = 0;

      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;
        
        if (!isVisible(parent)) continue;

        const text = node.nodeValue.trim();
        if (!text) continue;

        const lowerText = text.toLowerCase();
        const combinedMult = getVisualMultiplier(parent) * getProximityMultiplier(parent);

        if ((timerRegex.test(text) && /\b(countdown|timer|ends in)\b/.test(lowerText)) || lowerText.includes('countdown timer')) {
          score += 30 * combinedMult;
          trackTimer(node);
        } else if (timerRegex.test(text)) {
          trackTimer(node);
        }

        for (const pattern of scarcityPatterns) {
          if (pattern.test(lowerText)) score += 20 * combinedMult;
        }

        for (const pattern of confirmShamingPatterns) {
          if (pattern.test(lowerText)) score += 15 * combinedMult;
        }

        for (const pattern of cartTimerPatterns) {
          if (pattern.test(lowerText)) score += 25 * combinedMult;
        }

        if (socialProofRegex.test(lowerText)) {
          score += 15 * combinedMult;
        }

        const words = text.split(/\s+/);
        for (const word of words) {
          if (/^[A-Z]{3,}[!?.,]*$/.test(word)) {
            if (globalCapsCount < 3) {
              globalCapsCount++;
              score += 10 * combinedMult;
            }
          }
        }
      }

      if (score > 100) score = 100;

    } catch (err) {
      console.error('[DPS] Urgency scoring failed:', err);
    }
    return Math.floor(score);
  }

  function updateBadgeScore() {
    urgencyScore = scoreUrgency(document);
    if (!badgeEl) return;

    badgeEl.textContent = `Urgency: ${urgencyScore}`;
    badgeEl.className = 'badge';

    if (urgencyScore <= 30) {
      badgeEl.classList.add('green');
    } else if (urgencyScore <= 65) {
      badgeEl.classList.add('amber');
    } else {
      badgeEl.classList.add('red');
    }
  }

  // 4. Link Revelation Check
  function checkLink(anchor) {
    try {
      const visibleText = anchor.innerText ? anchor.innerText.trim() : '';
      const href = anchor.href; // Returns resolved absolute URL mostly

      if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return { mismatch: false, displayedDomain: '', actualDomain: '' };
      }

      // If text contains space, it's likely a sentence/label, ignore.
      // Must contain a dot to simulate a URL.
      if (!visibleText.includes('.') || visibleText.includes(' ')) {
        return { mismatch: false, displayedDomain: '', actualDomain: '' };
      }

      // Attempt to extract domains
      let displayedDomainStr = visibleText.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
      
      let actualDomainStr = '';
      try {
        const urlObj = new URL(href, window.location.href);
        actualDomainStr = urlObj.hostname.replace(/^www\./i, '');
      } catch (e) {
        return { mismatch: false, displayedDomain: '', actualDomain: '' };
      }

      // Mismatch is true if the visible text domain explicitly differs from actual domain.
      // E.g., displayed "google.com", actual "evil.com" -> Mismatch!
      // However displayed "evil.com" actual "evil.com" -> No Mismatch.
      // Note: we ignore casing and compare base domains roughly.
      const displayedLower = displayedDomainStr.toLowerCase();
      const actualLower = actualDomainStr.toLowerCase();

      if (displayedLower && actualLower && displayedLower !== actualLower) {
        // If the actual domain does not end with the displayed domain (e.g. subdomains)
        if (!actualLower.endsWith('.' + displayedLower)) {
          return {
            mismatch: true,
            displayedDomain: displayedLower,
            actualDomain: actualLower
          };
        }
      }
      
      return { mismatch: false, displayedDomain: '', actualDomain: '' };

    } catch (err) {
      console.error('[DPS] Link revelation check error:', err);
      return { mismatch: false, displayedDomain: '', actualDomain: '' };
    }
  }

  // 5. Homograph Detection
  function detectHomograph(hostname) {
    try {
      if (!hostname) return;

      let normalizedStr = '';
      let isMutated = false;

      // Extract parts to check against the confusables
      for (const char of hostname.toLowerCase()) {
        if (confusables[char]) {
          normalizedStr += confusables[char];
          isMutated = true;
        } else {
          normalizedStr += char;
        }
      }

      // Parse domain parts
      const parts = normalizedStr.split('.');
      let rootDomain = normalizedStr;
      
      // Basic extraction for standard top-level cases (e.g., example.com -> example)
      if (parts.length > 1) {
        // e.g. "google.com" -> "google"
        rootDomain = parts[parts.length - 2];
      }

      // Only check if mutation occurred or we want to blanket check
      for (const brand of topBrands) {
        if (rootDomain === brand) {
          // If the hostname differs from the normalized version, we caught a homograph
          if (hostname.toLowerCase() !== normalizedStr) {
            triggerBanner(`⚠️ This domain may be impersonating ${brand}. Proceed with caution.`);
            return true;
          }
        }
      }
      
      return false;
    } catch (err) {
      console.error('[DPS] Homograph detection error:', err);
      return false;
    }
  }

  function triggerBanner(message) {
    if (bannerEl) return; // Prevent multiple banners
    if (!shadowRoot) return;
    
    try {
      bannerEl = document.createElement('div');
      bannerEl.className = 'banner';
      bannerEl.textContent = message;
      shadowRoot.appendChild(bannerEl);
    } catch (err) {
      console.error('[DPS] Error triggering warning banner:', err);
    }
  }

  // 6. Messaging Bridge
  function initMessagingBridge() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
          if (request.type === 'GET_SCORE') {
            sendResponse({ score: urgencyScore });
          } else if (request.type === 'THREAT_RESULT') {
            const payload = request.payload;
            if (payload && payload.flagged) {
              // Append a threat warning tooltip at bottom center
              showTooltip(
                (window.innerWidth / 2) - 100, 
                window.innerHeight - 80, 
                '🚨 THREAT DETECTED 🚨\nReported by ThreatDB'
              );
            }
            sendResponse({ success: true });
          } else if (request.type === 'COOKIE_SUMMARY_RESULT') {
            // Handle push response from background ai summarizer
            if (request.payload) {
              clearTimeout(cookieFallbackTimer);
              renderCookieSummaryCard(request.payload.summary, request.payload.recommendation, request.payload.riskLevel);
            }
            sendResponse({ success: true });
          }
        });
        console.log('[DPS] Messaging bridge connected.');
      }
    } catch (err) {
      console.error('[DPS] Error connecting messaging bridge:', err);
    }

    // Add local testing listener for the homograph test page
    window.addEventListener("message", (event) => {
      if (event.source !== window || !event.data || event.data.type !== 'TEST_HOMOGRAPH') {
        return;
      }
      
      console.log(`[DPS] Triggered homograph test for: ${event.data.hostname}`);
      const isHomograph = detectHomograph(event.data.hostname);
      if (!isHomograph) {
        console.log(`[DPS] ${event.data.hostname} is considered safe.`);
      }
    }, false);
  }

  // === COOKIE SIMPLIFIER MODULE START ===
  
  let cookieBannerDetected = false;
  let originalCookieBannerEl = null;
  let cookieCardEl = null;
  let cookieFallbackTimer = null;

  function detectCookieBanner() {
    if (cookieBannerDetected) return null;

    try {
      // 1. Check by ID/Class Patterns
      const classPatterns = ['cookie', 'consent', 'gdpr', 'cc-banner', 'cookie-notice', 'cookie-popup', 'privacy-banner', 'onetrust', 'cookielaw', 'truste', 'cookiebanner'];
      const textPatterns = ['we use cookies', 'privacy preferences', 'cookie consent', 'personalized ads'];
      
      let bestCandidate = null;

      // Scan standard elements
      const elements = document.querySelectorAll('div, section, aside, form, dialog');
      for (const el of elements) {
        if (!isVisible(el)) continue; // ignore hidden elements

        // Check ID/Class
        const idClassStr = (el.id + ' ' + el.className).toLowerCase();
        const matchesClass = classPatterns.some(p => idClassStr.includes(p));

        // Check Role
        const role = el.getAttribute('role');
        const matchesRole = (role === 'dialog' || role === 'alertdialog');

        if (matchesClass || matchesRole) {
          // Verify text relevance to avoid false positives
          const text = (el.innerText || '').toLowerCase();
          if (textPatterns.some(p => text.includes(p)) || text.includes('cookie')) {
            bestCandidate = el;
            break; // Found highest confidence match
          }
        }
      }

      if (bestCandidate) {
        cookieBannerDetected = true;
        originalCookieBannerEl = bestCandidate;
        
        let identifier = bestCandidate.id ? `#${bestCandidate.id}` : (bestCandidate.className ? `.${bestCandidate.className.split(' ')[0]}` : '');
        console.log(`[DPS] Cookie banner detected: <${bestCandidate.tagName.toLowerCase()}> ${identifier}`);
        
        extractAndSummarizeBanner(bestCandidate);
        return bestCandidate;
      }
      return null;

    } catch (err) {
      console.error('[DPS] Error detecting cookie banner:', err);
      return null;
    }
  }

  function extractBannerText(element) {
    try {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
      let textNodes = [];
      let node;

      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (parent && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName) && isVisible(parent)) {
          textNodes.push(node.nodeValue.trim());
        }
      }

      // Deduplicate and join
      const uniquePhrases = [...new Set(textNodes.filter(t => t.length > 5))];
      let rawText = uniquePhrases.join(' ').replace(/\s+/g, ' ').trim();

      // Truncate cleanly around 2000 chars at a sentence boundary
      if (rawText.length > 2000) {
        rawText = rawText.substring(0, 2000);
        const lastPeriod = rawText.lastIndexOf('.');
        if (lastPeriod > 0) {
          rawText = rawText.substring(0, lastPeriod + 1);
        }
      }
      return rawText;
    } catch (err) {
      console.error('[DPS] Error extracting banner text:', err);
      return '';
    }
  }

  function extractAndSummarizeBanner(element) {
    const rawText = extractBannerText(element);
    if (!rawText) return;

    // Inject loading UI first
    injectCookieSummaryCardLoading();

    // Hide original banner (don't remove)
    element.style.visibility = 'hidden';

    // Set fallback timeout
    cookieFallbackTimer = setTimeout(() => {
      fallbackSummarize(rawText);
    }, 4000);

    // Send to background
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage(
          { type: 'SUMMARIZE_COOKIE', payload: { text: rawText } },
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[DPS] Background worker unavailable for AI cookie summary, waiting for fallback...');
              return;
            }
            if (response && response.summary) {
              clearTimeout(cookieFallbackTimer);
              renderCookieSummaryCard(response.summary, response.recommendation, response.riskLevel);
            }
          }
        );
      } catch (err) {
        console.warn('[DPS] Failed to send to background, waiting for fallback...', err);
      }
    }
  }

  function fallbackSummarize(text) {
    try {
      const lowerText = text.toLowerCase();
      let bulletPoints = [];
      let signalCount = 0;

      if (lowerText.includes('advertis') || lowerText.includes('tracking') || lowerText.includes('personalized ads')) {
        bulletPoints.push("This site uses cookies for advertising or analytics");
        signalCount++;
      }
      if (lowerText.includes('third party') || lowerText.includes('third-party') || lowerText.includes('partners')) {
        bulletPoints.push("Your data may be shared with third-party partners");
        signalCount++;
      }
      if (lowerText.includes('location')) {
        bulletPoints.push("Your location data may be collected");
        signalCount++;
      }
      if (lowerText.includes('personaliz') || lowerText.includes('tailor')) {
        bulletPoints.push("Content may be personalized based on your behavior");
        signalCount++;
      }
      
      const retentionMatch = lowerText.match(/(?:retained|kept|stored) for (\d+ (?:days|months|years))/);
      if (retentionMatch) {
         bulletPoints.push(`Data is retained for ${retentionMatch[1]}`);
         signalCount++;
      }

      if (bulletPoints.length === 0) {
        bulletPoints.push("Standard analytical and functional cookies detected.");
      }
      bulletPoints.push("Quick scan (AI summary unavailable)");

      let riskLevel = 'low';
      let recommendation = 'Safe to accept';

      if (signalCount >= 4) {
        riskLevel = 'high';
        recommendation = 'Accept only essential cookies';
      } else if (signalCount >= 2) {
        riskLevel = 'medium';
        recommendation = 'Accept only essential cookies';
      }

      renderCookieSummaryCard(bulletPoints, recommendation, riskLevel);

    } catch (err) {
      console.error('[DPS] Error in fallback summarizer:', err);
    }
  }

  function injectCookieSummaryCardLoading() {
    if (cookieCardEl) cookieCardEl.remove();
    
    cookieCardEl = document.createElement('div');
    cookieCardEl.className = 'cookie-card';
    
    cookieCardEl.innerHTML = `
      <div class="cookie-card-header">
        <h3 class="cookie-card-title">🍪 Cookie Summary</h3>
        <button class="cookie-close-btn" title="Dismiss">✕</button>
      </div>
      <div class="cookie-card-body">
        <p style="margin-top:0; color:#6B7280;">Analyzing cookie policy...</p>
        <div class="skeleton-block"></div>
        <div class="skeleton-block"></div>
        <div class="skeleton-block"></div>
      </div>
    `;

    shadowRoot.appendChild(cookieCardEl);
    cookieCardEl.style.display = 'flex';

    cookieCardEl.querySelector('.cookie-close-btn').addEventListener('click', dismissCookieSummary);
  }

  function renderCookieSummaryCard(bullets, recommendation, riskLevel) {
    if (!cookieCardEl) return;

    console.log(`[DPS] Cookie summary rendered: ${riskLevel}`);

    let listHtml = '<ul>';
    bullets.forEach(b => listHtml += `<li>${b}</li>`);
    listHtml += '</ul>';

    cookieCardEl.innerHTML = `
      <div class="cookie-card-header">
        <h3 class="cookie-card-title">
          🍪 Cookie Summary
          <span class="cookie-risk-pill ${riskLevel}">${riskLevel} Risk</span>
        </h3>
        <button class="cookie-close-btn" title="Dismiss">✕</button>
      </div>
      <div class="cookie-card-body">
        ${listHtml}
        <div class="cookie-recommendation">
          <span>💡</span>
          <span>${recommendation}</span>
        </div>
      </div>
      <div class="cookie-card-footer">
        <button class="cookie-btn cookie-btn-primary" id="dps-btn-essential">Accept Essential Only</button>
        <button class="cookie-btn cookie-btn-secondary" id="dps-btn-full">See Full Policy</button>
      </div>
    `;

    cookieCardEl.querySelector('.cookie-close-btn').addEventListener('click', dismissCookieSummary);
    cookieCardEl.querySelector('#dps-btn-full').addEventListener('click', dismissCookieSummary);
    cookieCardEl.querySelector('#dps-btn-essential').addEventListener('click', () => {
      console.log('[DPS] User chose: essential only');
      cookieCardEl.style.display = 'none';
      // In a real implementation, this would try to automatically click the "Reject All" / "Settings" button.
    });
  }

  function dismissCookieSummary() {
    if (cookieCardEl) {
      cookieCardEl.style.display = 'none';
      if (originalCookieBannerEl) {
        originalCookieBannerEl.style.visibility = 'visible';
      }
    }
  }

  // === COOKIE SIMPLIFIER MODULE END ===

  // Init Runner
  function init() {
    console.log('[DPS] Starting Dark Patterns & Phishing Sentinel...');
    initDOMInjection();
    initEventDelegation();
    initMessagingBridge();
    
    updateBadgeScore();
    detectHomograph(window.location.hostname);
    
    // Attempt initial sync detection
    setTimeout(() => {
        detectCookieBanner();
    }, 500); // Slight delay to let DOM settle
  }

  // Self-invoking trigger
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
