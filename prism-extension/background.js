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
        const rawContent = await response.text();
        const policyContent = rawContent.toLowerCase();

        const patterns = {
            dataSelling: /sell.*your.*(data|information)|share.*with.*third.*parties/i,
            locationTracking: /track.*your.*location|gps|real-time.*location/i,
            contactSharing: /access.*your.*contacts|sync.*contacts/i,
            advertising: /targeted.*ads|advertising.*partners|personalize.*ads/i
        };

        const findings = {};
        const snippets = {};

        for (const [key, regex] of Object.entries(patterns)) {
            const match = policyContent.match(regex);
            findings[key] = !!match;
            if (match) {
                snippets[key] = extractMatchingSnippet(rawContent, match.index);
            }
        }

        policyCache[tabId] = {
            findings: findings,
            snippets: snippets,
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

function extractMatchingSnippet(text, index) {
    // Find the sentence surrounding the match
    const start = Math.max(0, text.lastIndexOf('.', index) + 1);
    let end = text.indexOf('.', index + 20);
    if (end === -1) end = text.length;
    
    let snippet = text.substring(start, end).trim();
    if (snippet.length > 200) snippet = snippet.substring(0, 197) + "...";
    return snippet;
}


async function pushTabSummary(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) return;
        
        const url = new URL(tab.url);
        const cookies = await chrome.cookies.getAll({ domain: url.hostname });
        
        const categories = {
            tracking: 0,
            analytics: 0,
            advertising: 0,
            social: 0,
            functional: 0
        };

        cookies.forEach(c => {
            let info = KNOWN_COOKIES[c.name] || classifyUnknownCookie(c.name);
            if (info.type === 'stalking') {
                categories.tracking++;
                if (info.risk === 'high') categories.advertising++;
                else categories.analytics++;
            } else if (info.type === 'functional') {
                categories.functional++;
            }
        });

        const policyData = policyCache[tabId];
        let policySummary = "Policy analysis in progress...";
        let concerns = 0;
        
        if (policyData && policyData.findings) {
            concerns = Object.values(policyData.findings).filter(v => v === true).length;
            policySummary = concerns > 0 ? `${concerns} Privacy Risks Found` : "Clear Policy";
        }

        chrome.tabs.sendMessage(tabId, {
            type: "prismSummaryUpdate",
            data: {
                categories: categories,
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
