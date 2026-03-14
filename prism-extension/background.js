importScripts('domain-checker.js', 'cookie-scanner.js');

function updateToolbarBadge(score, tabId = null) {
    let actionProps = { text: score.toString() };
    if (tabId !== null) actionProps.tabId = tabId;
    
    chrome.action.setBadgeText(actionProps);

    let colorProps = { color: "#FF0000" }; // Default Red
    if (tabId !== null) colorProps.tabId = tabId;

    if (score > 80) {
        // Green ('Safe')
        colorProps.color = "#00FF00";
    } else if (score >= 50 && score <= 80) {
        // Yellow ('Caution')
        colorProps.color = "#FFFF00";
    } else {
        // Red ('High Risk')
        colorProps.color = "#FF0000";
    }

    chrome.action.setBadgeBackgroundColor(colorProps);
}

async function evaluateTabScore(tabId, urlString) {
    if (!urlString || !urlString.startsWith('http')) {
        chrome.action.setBadgeText({ text: "", tabId: tabId });
        return;
    }

    let url;
    try {
        url = new URL(urlString);
    } catch (e) {
        return;
    }
    
    let domain = url.hostname;
    
    // Gather cookies for domain
    const cookies = await chrome.cookies.getAll({ domain: domain });
    let stalkingCount = 0;
    for (const cookie of cookies) {
        let info = KNOWN_COOKIES[cookie.name];
        if (!info) {
            info = classifyUnknownCookie(cookie.name);
        }
        if (info.type === 'stalking') {
            stalkingCount++;
        }
    }

    // Gather trust metrics
    const trustReport = await getDomainTrustMetrics(urlString);

    let score = 100;
    
    if (stalkingCount > 0) {
        score -= (stalkingCount * 20);
    }
    if (domain.includes("xn--")) {
        score -= 50;
    }
    if (domain.length > 25) {
        score -= 10;
    }
    if (!trustReport.isHttps) {
        score -= 30;
    }
    if (trustReport.isNewDomain) {
        score -= 20;
    }
    
    score = Math.max(0, score);
    updateToolbarBadge(score, tabId);
}

// Ensure this updates every time the user switches tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) {
            evaluateTabScore(tab.id, tab.url);
        }
    } catch (e) {
        console.error("Error retrieving tab on activated:", e);
    }
});

// Ensure this updates every time the page reloads or URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        evaluateTabScore(tabId, tab.url);
    }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === "scamWarning") {
        if (sender.tab) {
            chrome.action.setBadgeText({ text: "!", tabId: sender.tab.id });
            chrome.action.setBadgeBackgroundColor({ color: "red", tabId: sender.tab.id });
        }
    } else if (msg.type === "updateZeroTrustScore") {
        // From popup UI or other foreground scripts
        if (msg.data && typeof msg.data.score === 'number') {
             chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                 if (tabs && tabs.length > 0) {
                     updateToolbarBadge(msg.data.score, tabs[0].id);
                 }
             });
        }
    }
});