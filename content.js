(function () {
  'use strict';

  // Global references to injected components inside shadow DOM
  let shadowRoot = null;
  let shadowHost = null;
  let tooltipEl = null;
  let badgeEl = null;
  let bannerEl = null;
  let urgencyScore = 0;

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
        for (const mut of mutations) {
          if (mut.addedNodes.length > 0 || mut.type === 'characterData') {
            shouldUpdate = true;
            break;
          }
        }
        
        if (shouldUpdate) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            updateBadgeScore();
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

  // 3. Urgency Scoring Algorithm
  function scoreUrgency(doc) {
    let score = 0;
    try {
      const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
      let textNodes = [];
      let node;

      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (parent && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
          // Exclude invisible elements as best effort synchronously
          textNodes.push(node.nodeValue);
        }
      }

      const fullText = textNodes.join(' ');
      const lowerText = fullText.toLowerCase();

      // Countdown timers heuristic (+30)
      // Checks for time patterns HH:MM:SS, MM:SS next to words like ends, left, timer
      const timerRegex = /\b\d{1,2}:\d{2}(:\d{2})?\b/g;
      const hasTimerFormat = timerRegex.test(fullText);
      const hasTimerWords = /\b(countdown|timer|ends in)\b/.test(lowerText);
      if (hasTimerFormat && hasTimerWords) {
        score += 30;
      } else if (lowerText.includes('countdown timer')) {
        score += 30;
      }

      // Scarcity phrases (+20 each)
      const scarcityPatterns = [
        /only\s+\d+\s+left/g,
        /\blimited time\b/g,
        /\bact now\b/g,
        /\bexpires soon\b/g
      ];

      scarcityPatterns.forEach(pattern => {
        const matches = lowerText.match(pattern);
        if (matches) {
          score += matches.length * 20;
        }
      });

      // Social proof pressure (+15)
      const socialProofRegex = /\b\d+\s+people viewing this\b/g;
      const socialMatches = lowerText.match(socialProofRegex);
      if (socialMatches) {
        score += socialMatches.length * 15;
      }

      // All-caps shouting (+10 per instance, max 3)
      const words = fullText.split(/\s+/);
      let capsCount = 0;
      for (const word of words) {
        // Find words with NO lowercase letters and at least 3 uppercase letters
        if (/^[A-Z]{3,}[!?.,]*$/.test(word)) {
          capsCount++;
        }
      }
      score += Math.min(3, capsCount) * 10;

      // Normalize score 0 - 100
      if (score > 100) score = 100;

    } catch (err) {
      console.error('[DPS] Urgency scoring failed:', err);
    }
    return score;
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
          }
        });
        console.log('[DPS] Messaging bridge connected.');
      }
    } catch (err) {
      console.error('[DPS] Error connecting messaging bridge:', err);
    }
  }

  // Init Runner
  function init() {
    console.log('[DPS] Starting Dark Patterns & Phishing Sentinel...');
    initDOMInjection();
    initEventDelegation();
    initMessagingBridge();
    
    updateBadgeScore();
    detectHomograph(window.location.hostname);
  }

  // Self-invoking trigger
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
