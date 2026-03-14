importScripts('domain-checker.js', 'cookie-scanner.js');

const policyCache = {};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "scamWarning") {
        if (sender.tab) {
            chrome.action.setBadgeText({ text: "!", tabId: sender.tab.id });
            chrome.action.setBadgeBackgroundColor({ color: "red", tabId: sender.tab.id });
        }
    } else if (msg.type === "foundPolicyLink") {
        if (sender.tab) {
            analyzePolicyInBackground(msg.url, sender.tab.id);
        }
    } else if (msg.type === "getPolicyAnalysis") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                const tabId = tabs[0].id;
                sendResponse({ data: policyCache[tabId] || null });
            }
        });
        return true; // Keep channel open for async response
    } else if (msg.type === "resolveURL") {
        resolveFinalURL(msg.url).then(finalUrl => {
            sendResponse({ finalUrl: finalUrl });
        });
        return true;
    }
});

async function resolveFinalURL(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return response.url;
    } catch (e) {
        console.error("PRISM URL resolution failed:", e);
        return url; // Return original on failure
    }
}


async function analyzePolicyInBackground(url, tabId) {
    try {
        const response = await fetch(url);
        const policyContent = (await response.text()).toLowerCase();

        const findings = {
            dataSelling: /sell.*your.*(data|information)|share.*with.*third.*parties/i.test(policyContent),
            locationTracking: /track.*your.*location|gps|real-time.*location/i.test(policyContent),
            contactSharing: /access.*your.*contacts|sync.*contacts/i.test(policyContent),
            advertising: /targeted.*ads|advertising.*partners|personalize.*ads/i.test(policyContent)
        };

        policyCache[tabId] = {
            findings: findings,
            url: url
        };
        
        // Notify background to analyze
        chrome.runtime.sendMessage({
            type: "policyAnalysisUpdate",
            tabId: tabId,
            data: policyCache[tabId]
        });

        // Trigger summary push
        pushTabSummary(tabId);

    } catch (e) {
        console.error("PRISM background fetch failed:", e);
    }
}

async function pushTabSummary(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) return;
        
        const url = new URL(tab.url);
        const cookies = await chrome.cookies.getAll({ domain: url.hostname });
        
        let trackingCount = 0;
        cookies.forEach(c => {
            let info = KNOWN_COOKIES[c.name] || classifyUnknownCookie(c.name);
            if (info.type === 'stalking' || info.type === 'analytics') trackingCount++;
        });

        const policyData = policyCache[tabId];
        let policySummary = "Policy not scanned yet.";
        let concerns = 0;
        
        if (policyData && policyData.findings) {
            concerns = Object.values(policyData.findings).filter(v => v === true).length;
            policySummary = concerns > 0 ? `${concerns} Privacy Concerns detected.` : "Policy looks healthy.";
        }

        chrome.tabs.sendMessage(tabId, {
            type: "prismSummaryUpdate",
            data: {
                trackingCount: trackingCount,
                policyConcerns: concerns,
                policySummary: policySummary
            }
        }).catch(() => {}); // Ignore errors if content script not ready
    } catch (e) {
        console.error("Push summary failed:", e);
    }
}

// Clean up cache on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
    delete policyCache[tabId];
});

// Clear badge on new loads
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        chrome.action.setBadgeText({ text: "", tabId: tabId });
    }
    if (changeInfo.status === 'complete' && tab.url) {
        pushTabSummary(tabId);
    }
});
