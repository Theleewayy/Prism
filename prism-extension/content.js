function autoRejectCookies() {

    const rejectWords = [
        "reject",
        "reject all",
        "decline",
        "only necessary",
        "essential only"
    ]

    let buttons = document.querySelectorAll("button")

    buttons.forEach(btn => {

        let text = btn.innerText.toLowerCase()

        if (rejectWords.some(word => text.includes(word))) {

            console.log("PRISM rejecting cookies")

            btn.click()

        }

    })

}

setTimeout(autoRejectCookies, 2000)

async function analyzePolicies() {
    const policyLinks = Array.from(document.querySelectorAll("a")).filter(a => {
        const text = a.innerText.toLowerCase();
        return text.includes("privacy policy") || text.includes("terms of service") || text.includes("terms of use");
    });

    if (policyLinks.length === 0) return;

    const policyUrl = policyLinks[0].href;
    
    // Notify background to analyze
    chrome.runtime.sendMessage({
        type: "foundPolicyLink",
        url: policyUrl
    });
}

let hoverTimeout;
let tooltip;

function createTooltip() {
    tooltip = document.createElement("div");
    tooltip.id = "prism-url-tooltip";
    Object.assign(tooltip.style, {
        position: "fixed",
        background: "#0f172a",
        color: "white",
        padding: "10px 14px",
        borderRadius: "8px",
        fontSize: "13px",
        zIndex: "2147483647",
        boxShadow: "0 10px 25px rgba(0,0,0,0.6)",
        pointerEvents: "none",
        border: "1px solid #475569",
        display: "none",
        fontFamily: "Inter, sans-serif, system-ui",
        maxWidth: "320px",
        wordBreak: "break-all",
        lineHeight: "1.4",
        textAlign: "left"
    });
    document.documentElement.appendChild(tooltip);
}

function handleMouseOver(e) {
    const path = e.composedPath();
    const link = path.find(el => el.tagName === "A");
    if (!link || !link.href || link.href.startsWith("javascript:")) return;

    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
        const originalUrl = link.href;
        
        chrome.runtime.sendMessage({ type: "resolveURL", url: originalUrl }, (response) => {
            if (response && response.finalUrl) {
                showTooltip(e, originalUrl, response.finalUrl);
            }
        });
    }, 500);
}

function showTooltip(e, originalUrl, finalUrl) {
    if (!tooltip) createTooltip();
    
    const currentDomain = window.location.hostname;
    let finalDomain;
    try {
        finalDomain = new URL(finalUrl).hostname;
    } catch(err) {
        finalDomain = finalUrl;
    }

    const isThirdParty = finalDomain !== currentDomain;
    
    let content = `<div style="color: #94a3b8; font-size: 10px; margin-bottom: 2px;">Resolved Destination:</div>`;
    content += `<div style="font-weight: bold; color: ${isThirdParty ? '#f87171' : '#22c55e'}">${finalUrl}</div>`;
    
    if (isThirdParty) {
        content += `<div style="margin-top: 4px; padding: 2px 4px; background: #450a0a; color: #f87171; font-size: 9px; border-radius: 3px; display: inline-block;">⚠ THIRD-PARTY SITE</div>`;
    }

    tooltip.innerHTML = content;
    tooltip.style.display = "block";
    updateTooltipPosition(e);
}

function updateTooltipPosition(e) {
    if (!tooltip) return;
    tooltip.style.left = (e.clientX + 10) + "px";
    tooltip.style.top = (e.clientY + 10) + "px";
}

function handleMouseOut() {
    clearTimeout(hoverTimeout);
    if (tooltip) tooltip.style.display = "none";
}

document.addEventListener("mouseover", handleMouseOver);
document.addEventListener("mouseout", handleMouseOut);
document.addEventListener("mousemove", (e) => {
    if (tooltip && tooltip.style.display === "block") {
        updateTooltipPosition(e);
    }
});

let banner;

function injectPrismBanner(data) {
    if (document.getElementById("prism-summary-banner")) {
        updateBanner(data);
        return;
    }

    banner = document.createElement("div");
    banner.id = "prism-summary-banner";
    Object.assign(banner.style, {
        position: "fixed",
        top: "-100px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "90%",
        maxWidth: "600px",
        background: "rgba(15, 23, 42, 0.9)",
        backdropFilter: "blur(12px)",
        color: "white",
        padding: "12px 20px",
        borderRadius: "12px",
        zIndex: "2147483646",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: "Inter, sans-serif, system-ui",
        transition: "top 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        border: "1px solid rgba(255,255,255,0.1)"
    });

    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
            <div style="background: #3b82f6; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">P</div>
            <div>
                <div style="font-size: 13px; font-weight: 600;">PRISM Privacy Scan</div>
                <div id="prism-banner-status" style="font-size: 11px; color: #94a3b8;">Analyzing site security...</div>
            </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
            <button id="prism-close-banner" style="background: transparent; border: none; color: #64748b; cursor: pointer; font-size: 18px;">&times;</button>
        </div>
    `;

    document.documentElement.appendChild(banner);
    
    // Animation entry
    setTimeout(() => { banner.style.top = "20px"; }, 100);

    document.getElementById("prism-close-banner").onclick = () => {
        banner.style.top = "-100px";
        setTimeout(() => banner.remove(), 500);
    };

    updateBanner(data);
}

function updateBanner(data) {
    const statusEl = document.getElementById("prism-banner-status");
    if (!statusEl) return;

    if (!data || !data.categories) return;

    const cat = data.categories;
    let cookieDetails = [];
    if (cat.advertising > 0) cookieDetails.push(`<span style="color: #f87171;">${cat.advertising} Advertising</span>`);
    if (cat.analytics > 0) cookieDetails.push(`<span style="color: #fbbf24;">${cat.analytics} Analytics</span>`);
    
    const cookieSummary = cookieDetails.length > 0 
        ? `${cat.tracking} Trackers (${cookieDetails.join(", ")})` 
        : `<span style="color: #34d399;">No Trackers Found</span>`;

    const policyColor = data.policyConcerns > 0 ? '#fbbf24' : '#34d399';
    const policyText = `<span style="color: ${policyColor}; font-weight: 600;">${data.policySummary}</span>`;
    
    statusEl.innerHTML = `<div>${cookieSummary}</div><div style="margin-top: 2px;">${policyText}</div>`;
}


chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "prismSummaryUpdate") {
        injectPrismBanner(msg.data);
    }
});

analyzePolicies();
setTimeout(analyzePolicies, 3000); // Retry after 3 seconds for dynamic content
detectTrackers();