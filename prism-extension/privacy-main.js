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
    
    // Get analysis from other modules
    const cookieData = await analyzeSiteCookies();
    const trustReport = await getDomainTrustMetrics(urlString);
    const privacyLabels = generatePrivacyLabels(cookieData);
    
    // Check security flags (Homograph or Scam-Speech)
    const securityFlags = await checkSecurityFlags(domain, tab.id);

    // Calculate Zero-Trust Score
    let zeroTrustScore = 100;
    let warnings = [];
    
    // Subtract 20 points for each 'Stalking' cookie
    if (cookieData.categories && cookieData.categories.stalking > 0) {
      zeroTrustScore -= (cookieData.categories.stalking * 20);
      warnings.push(`Found ${cookieData.categories.stalking} tracking/stalking cookies`);
    }

    // Subtract 50 points for each security flag (Homograph or Scam-Speech)
    if (securityFlags.homograph) {
      zeroTrustScore -= 50;
      warnings.push("Possible homograph attack detected");
    }

    if (securityFlags.scamSpeech) {
      zeroTrustScore -= 50;
      warnings.push("Scam-speech detected on page");
    }

    // Domain checks (legacy deductions)
    if (domain.length > 25) {
      zeroTrustScore -= 10;
      warnings.push("Suspiciously long domain");
    }
    if (!trustReport.isHttps && url.protocol !== 'chrome:' && url.protocol !== 'chrome-extension:') {
      zeroTrustScore -= 30;
      warnings.push("Not using HTTPS");
    }
    if (trustReport.isNewDomain) {
      zeroTrustScore -= 20;
      warnings.push("Newly registered domain (under 6 months old)");
    }
    
    zeroTrustScore = Math.max(0, zeroTrustScore);
    
    const finalData = {
      score: zeroTrustScore,
      warnings: warnings,
      privacyLabels: privacyLabels,
      domain: domain
    };

    // Update UI directly in popup
    updatePopupUI(finalData, tab.id);
    
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
  // Update Score UI
  let scoreElement = document.getElementById("score");
  scoreElement.innerText = data.score;
  
  let badgeColor = "#00FF00";
  if (data.score >= 80) {
    scoreElement.style.color = "lime";
    badgeColor = "#00FF00"; // Green
  } else if (data.score >= 50) {
    scoreElement.style.color = "orange";
    badgeColor = "#FFA500"; // Amber
  } else {
    scoreElement.style.color = "red";
    badgeColor = "#FF0000"; // Red
  }
  
  // Update Badge
  chrome.action.setBadgeText({ text: data.score.toString(), tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId: tabId });
  
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
