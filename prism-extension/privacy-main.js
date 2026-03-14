document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
    if (!tabs || tabs.length === 0) return;
    const tab = tabs[0];
    const urlString = tab.url;
    
    let url;
    try {
      url = new URL(urlString);
    } catch (e) {
      document.getElementById("site").innerText = "Invalid URL";
      document.getElementById("privacy").innerText = "Cannot scan this page.";
      return;
    }
    
    let domain = url.hostname;
    document.getElementById("site").innerText = domain;
    
    // Listen for policy analysis updates from background
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "policyAnalysisUpdate") {
        updatePolicyUI(msg.data.findings, msg.data.url, msg.data.snippets);
      }
    });

    // Request current analysis from background
    chrome.runtime.sendMessage({ type: "getPolicyAnalysis" }, (response) => {
      if (response && response.data) {
        updatePolicyUI(response.data.findings, response.data.url, response.data.snippets);
      }
    });

    // Get analysis from other modules
    const cookieData = await analyzeSiteCookies();
    const trustReport = await getDomainTrustMetrics(urlString);
    const privacyLabels = generatePrivacyLabels(cookieData);
    
    // Check security flags (Homograph or Scam-Speech)
    const securityFlags = await checkSecurityFlags(domain, tab.id);

    let warnings = [];
    
    // Check for each 'Stalking' cookie
    if (cookieData.categories && cookieData.categories.stalking > 0) {
      warnings.push(`Found ${cookieData.categories.stalking} tracking/stalking cookies`);
    }

    // Check for security flags (Homograph or Scam-Speech)
    if (securityFlags.homograph) {
      warnings.push("Possible homograph attack detected");
    }

    if (securityFlags.scamSpeech) {
      warnings.push("Scam-speech detected on page");
    }

    // Domain checks (legacy warnings)
    if (domain.length > 25) {
      warnings.push("Suspiciously long domain");
    }
    if (!trustReport.isHttps && url.protocol !== 'chrome:' && url.protocol !== 'chrome-extension:') {
      warnings.push("Not using HTTPS");
    }
    if (trustReport.isNewDomain) {
      warnings.push("Newly registered domain (under 6 months old)");
    }
    
    const finalData = {
      warnings: warnings,
      privacyLabels: privacyLabels,
      domain: domain
    };

    // Update UI directly in popup
    updatePopupUI(finalData, tab.id);
    
    // Render cookies UI
    setupCookieManagement(cookieData.cookies, url);

    // Also broadcast to other potential listeners (as requested)
    chrome.runtime.sendMessage({
      type: "updateZeroTrustScore",
      data: finalData
    });
  });
});

async function checkSecurityFlags(domain, tabId) {
  let flags = {
    homograph: false,
    scamSpeech: false
  };

  // Check for homograph
  if (domain.includes("xn--")) {
    flags.homograph = true;
  }

  // To check scam speech dynamically, we inject a quick check or rely on content script message
  // For immediate popup calculation, we execute script if possible
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        let text = document.body.innerText.toLowerCase();
        let scamWords = ["urgent", "verify now", "suspended", "gift card", "police", "act immediately"];
        return scamWords.some(word => text.includes(word));
      }
    });
    if (results && results[0] && results[0].result === true) {
      flags.scamSpeech = true;
    }
  } catch (e) {
    console.error("Could not execute script for scam speech check", e);
  }

  return flags;
}

function updatePopupUI(data, tabId) {
  // No score element to update anymore
  
  // Clear badge
  chrome.action.setBadgeText({ text: "", tabId: tabId });
  
  // Update Warnings
  let warningList = document.getElementById("warnings");
  warningList.innerHTML = ""; // clear previous
  if (data.warnings.length > 0) {
    data.warnings.forEach(w => {
      let li = document.createElement("li");
      li.innerText = w;
      warningList.appendChild(li);
    });
  } else {
    let li = document.createElement("li");
    li.innerText = "No critical warnings.";
    warningList.appendChild(li);
  }
  
  // Update Privacy Labels
  let privacyContainer = document.getElementById("privacy");
  privacyContainer.innerHTML = ""; // clear loading
  const labelList = document.createElement("ul");
  labelList.style.paddingLeft = "20px";
  labelList.style.margin = "0";
  data.privacyLabels.forEach(label => {
    let li = document.createElement("li");
    li.innerText = label;
    li.style.marginBottom = "5px";
    labelList.appendChild(li);
  });
  privacyContainer.appendChild(labelList);
}

function setupCookieManagement(cookies, urlObj) {
  const toggle = document.getElementById("cookieToggle");
  const container = document.getElementById("cookieListContainer");
  const list = document.getElementById("cookieList");
  const btn = document.getElementById("clearAllCookiesBtn");
  
  if (!toggle || !container || !list || !btn) return;
  
  toggle.addEventListener("change", (e) => {
    container.style.display = e.target.checked ? "block" : "none";
  });
  
  let currentCookies = cookies || [];
  
  function renderList() {
    list.innerHTML = "";
    if (currentCookies.length === 0) {
      list.innerText = "No cookies currently in use.";
      return;
    }
    
    currentCookies.forEach(cookie => {
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.borderBottom = "1px solid #334155";
      item.style.padding = "6px 0";
      
      const textWrapper = document.createElement("div");
      textWrapper.style.display = "flex";
      textWrapper.style.flexDirection = "column";
      textWrapper.style.maxWidth = "165px";

      const nameText = document.createElement("span");
      nameText.innerText = cookie.name;
      nameText.style.fontSize = "10px";
      nameText.style.color = "#94a3b8";
      nameText.style.overflow = "hidden";
      nameText.style.textOverflow = "ellipsis";
      
      const descText = document.createElement("span");
      let description = "Site Functionality";
      
      // Try to get a better description
      let info = (typeof KNOWN_COOKIES !== 'undefined') ? KNOWN_COOKIES[cookie.name] : null;
      if (!info && typeof classifyUnknownCookie !== 'undefined') {
        info = classifyUnknownCookie(cookie.name);
      }

      if (info) {
        if (info.type === 'stalking') {
          description = info.risk === 'high' ? "Behavior Tracker" : "Usage Analytics";
        } else if (info.type === 'preference') {
          description = "Site Preferences";
        } else if (info.type === 'functional') {
          description = "Login / Session";
        }
      }

      descText.innerText = description;
      descText.style.fontSize = "12px";
      descText.style.fontWeight = "500";
      descText.style.color = "#f8fafc";
      
      textWrapper.appendChild(descText);
      textWrapper.appendChild(nameText);
      
      const delBtn = document.createElement("button");
      delBtn.innerText = "Turn Off";
      delBtn.style.padding = "4px 8px";
      delBtn.style.fontSize = "10px";
      delBtn.style.marginLeft = "5px";
      delBtn.style.marginTop = "0";
      delBtn.style.width = "auto";
      delBtn.style.background = "#ef4444";
      delBtn.onclick = () => {
        removeCookie(cookie, urlObj, item);
        currentCookies = currentCookies.filter(c => c.name !== cookie.name);
        if (currentCookies.length === 0) renderList(); 
      };
      
      item.appendChild(textWrapper);
      item.appendChild(delBtn);
      list.appendChild(item);
    });
  }
  
  renderList();
  
  btn.onclick = () => {
    if(!currentCookies) return;
    const items = list.querySelectorAll("div");
    // Snapshot the current cookies array
    const toRemove = [...currentCookies];
    toRemove.forEach((cookie, index) => {
      removeCookie(cookie, urlObj, items[index]);
    });
    currentCookies = [];
    renderList();
  };
}

function removeCookie(cookie, urlObj, listItemElement) {
  let cookieUrl = (urlObj.protocol === "https:" ? "https://" : "http://") + cookie.domain.replace(/^\./, "") + cookie.path;
  chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, (details) => {
    if (details) {
      if (listItemElement && listItemElement.parentNode) listItemElement.remove();
    } else {
      console.error("Failed to remove cookie", chrome.runtime.lastError);
    }
  });
}

function updatePolicyUI(findings, url, snippets = {}) {
  const summaryEl = document.getElementById("policySummary");
  const detailsEl = document.getElementById("policyDetails");
  const toggleLabel = document.getElementById("policyToggleLabel");
  const toggle = document.getElementById("policyToggle");

  if (!summaryEl || !detailsEl || !toggleLabel || !toggle) return;

  const concernCount = Object.values(findings).filter(v => v === true).length;
  
  if (concernCount === 0) {
    summaryEl.innerText = "PRISM analyzed the policy healthy: No major red flags found.";
    toggleLabel.style.display = "none";
    return;
  }

  summaryEl.innerText = `PRISM detected ${concernCount} privacy concerns in the policy.`;
  toggleLabel.style.display = "block";
  
  toggle.onchange = (e) => {
    detailsEl.style.display = e.target.checked ? "block" : "none";
    toggleLabel.querySelector("span").innerText = e.target.checked ? "Hide Details" : "See Details";
  };

  detailsEl.innerHTML = "";
  
  const labels = {
    dataSelling: "Data Selling / Third-Party Sharing",
    locationTracking: "Real-time Location Tracking",
    contactSharing: "Contact List Access",
    advertising: "Targeted Advertising Partners"
  };

  const descriptions = {
    dataSelling: "This site claims the right to share or sell your data to undefined third parties.",
    locationTracking: "The policy mentions tracking your GPS or IP-based location.",
    contactSharing: "The site may ask to sync and store your phone or email contacts.",
    advertising: "Your behavior is tracked to build a profile for personalized ads."
  };

  for (const [key, value] of Object.entries(findings)) {
    if (value === true) {
      const concernItem = document.createElement("div");
      concernItem.style.marginBottom = "10px";
      concernItem.style.padding = "10px";
      concernItem.style.background = "#1e293b";
      concernItem.style.borderRadius = "6px";
      concernItem.style.borderLeft = "4px solid #f87171";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      
      const title = document.createElement("span");
      title.innerText = labels[key];
      title.style.fontSize = "11px";
      title.style.fontWeight = "bold";
      title.style.color = "#fca5a5";

      const statusBadge = document.createElement("span");
      statusBadge.innerText = "UNNECESSARY";
      statusBadge.style.fontSize = "9px";
      statusBadge.style.background = "#450a0a";
      statusBadge.style.color = "#f87171";
      statusBadge.style.padding = "2px 4px";
      statusBadge.style.borderRadius = "3px";

      header.appendChild(title);
      header.appendChild(statusBadge);

      const desc = document.createElement("div");
      desc.innerText = descriptions[key];
      desc.style.fontSize = "10px";
      desc.style.color = "#94a3b8";
      desc.style.marginTop = "4px";

      concernItem.appendChild(header);
      concernItem.appendChild(desc);

      // Add Snippet if available
      if (snippets[key]) {
        const snippetBox = document.createElement("div");
        snippetBox.style.marginTop = "8px";
        snippetBox.style.padding = "6px";
        snippetBox.style.background = "rgba(0,0,0,0.3)";
        snippetBox.style.borderRadius = "4px";
        snippetBox.style.fontSize = "10px";
        snippetBox.style.color = "#cbd5e1";
        snippetBox.style.fontStyle = "italic";
        snippetBox.style.borderLeft = "2px solid #64748b";
        
        snippetBox.innerHTML = `<strong>Scraped Evidence:</strong><br>"${snippets[key]}"`;
        concernItem.appendChild(snippetBox);
      }

      detailsEl.appendChild(concernItem);
    }
  }

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.innerText = "Read Full Policy";
  link.style.display = "block";
  link.style.fontSize = "10px";
  link.style.marginTop = "5px";
  link.style.color = "#60a5fa";
  link.style.textAlign = "right";
  detailsEl.appendChild(link);
}


